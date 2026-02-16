export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  businessTrips,
  employees,
  settingsApprovalFlow,
  settingsBusinessTripAllowance,
} from "@/lib/db/schema";
import { requireAdmin, requireSessionUser } from "@/lib/auth/server";
import { createWorkflowEvent } from "@/lib/workflow-events";
import {
  createNotificationsForUsers,
  resolveUserIdsByEmployeeIds,
} from "@/lib/notifications";
import {
  calculateBusinessTripCompensation,
  DEFAULT_BUSINESS_TRIP_COMPENSATION_SETTINGS,
  normalizeOpeRules,
  normalizeTransportOptions,
  type BusinessTripCompensationSettings,
  type OpeRule,
  type TransportOption,
} from "@/lib/business-trip-allowance";

const dateStringSchema = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(new Date(value).getTime()), "Format tanggal tidak valid");

const staffUpdateSchema = z.object({
  destinationCity: z.string().trim().min(1).max(100).optional(),
  companyName: z.string().trim().min(1).max(150).optional(),
  purpose: z.string().trim().max(2000).optional(),
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.optional(),
  isOutOfTownOvernight: z.boolean().optional(),
  transportOptionId: z.string().trim().min(1).max(64).optional(),
  status: z.literal("CANCELLED").optional(),
});

const adminUpdateSchema = z.object({
  destinationCity: z.string().trim().min(1).max(100).optional(),
  companyName: z.string().trim().min(1).max(150).optional(),
  purpose: z.string().trim().max(2000).optional(),
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.optional(),
  isOutOfTownOvernight: z.boolean().optional(),
  transportOptionId: z.string().trim().min(1).max(64).optional(),
  status: z
    .union([
      z.literal("SUBMITTED"),
      z.literal("WAITING_LEVEL_2"),
      z.literal("APPROVED"),
      z.literal("REJECTED"),
      z.literal("CANCELLED"),
    ])
    .optional(),
  adminNote: z.string().trim().max(2000).optional(),
});

const formatZodError = (error: z.ZodError) =>
  error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");

const ACTIVE_TRIP_STATUSES = ["SUBMITTED", "WAITING_LEVEL_2", "APPROVED"] as const;

const parseOpeRules = (value: string | null | undefined): OpeRule[] => {
  if (!value) return DEFAULT_BUSINESS_TRIP_COMPENSATION_SETTINGS.opeRules;
  try {
    const parsed = JSON.parse(value) as OpeRule[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return DEFAULT_BUSINESS_TRIP_COMPENSATION_SETTINGS.opeRules;
    }
    return normalizeOpeRules(parsed);
  } catch {
    return DEFAULT_BUSINESS_TRIP_COMPENSATION_SETTINGS.opeRules;
  }
};

const parseTransportOptions = (value: string | null | undefined): TransportOption[] => {
  if (!value) return DEFAULT_BUSINESS_TRIP_COMPENSATION_SETTINGS.transportOptions;
  try {
    const parsed = JSON.parse(value) as TransportOption[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return DEFAULT_BUSINESS_TRIP_COMPENSATION_SETTINGS.transportOptions;
    }
    return normalizeTransportOptions(parsed);
  } catch {
    return DEFAULT_BUSINESS_TRIP_COMPENSATION_SETTINGS.transportOptions;
  }
};

const parseCompensationSettings = (
  row: typeof settingsBusinessTripAllowance.$inferSelect | undefined
): BusinessTripCompensationSettings => {
  if (!row) return DEFAULT_BUSINESS_TRIP_COMPENSATION_SETTINGS;
  return {
    opeRules: parseOpeRules(row.allowanceRuleJson),
    mealPerDay: Number(row.mealPerDay),
    laundryPerWeek: Number(row.laundryPerWeek),
    laundryMinDays: row.laundryMinDays,
    transportOptions: parseTransportOptions(row.transportOptionJson),
  }
};

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  const rawBody = await request.json().catch(() => null);
  const db = getDb();

  const [existing] = await db
    .select()
    .from(businessTrips)
    .where(eq(businessTrips.id, params.id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Perjalanan dinas tidak ditemukan" }, { status: 404 });
  }

  const [employee] = await db
    .select({
      id: employees.id,
      title: employees.title,
    })
    .from(employees)
    .where(eq(employees.id, existing.employeeId))
    .limit(1);
  if (!employee) {
    return NextResponse.json(
      { error: "Data employee tidak ditemukan" },
      { status: 404 }
    );
  }

  const [allowanceSetting] = await db
    .select()
    .from(settingsBusinessTripAllowance)
    .limit(1);
  const compensationSettings = parseCompensationSettings(allowanceSetting);

  const [approvalFlow] = await db.select().from(settingsApprovalFlow).limit(1);
  const approvalLevels = approvalFlow?.businessTripApprovalLevels ?? 2;
  const approverLevel1EmployeeId =
    approvalFlow?.businessTripApproverLevel1EmployeeId ?? null;
  const approverLevel2EmployeeId =
    approvalFlow?.businessTripApproverLevel2EmployeeId ?? null;
  const isApproverLevel1 =
    Boolean(auth.user.employeeId) && auth.user.employeeId === approverLevel1EmployeeId;
  const isApproverLevel2 =
    approvalLevels === 2 &&
    Boolean(auth.user.employeeId) &&
    auth.user.employeeId === approverLevel2EmployeeId;
  const isApprover = isApproverLevel1 || isApproverLevel2;

  if (!isApprover) {
    const parsedBody = staffUpdateSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: `Payload tidak valid: ${formatZodError(parsedBody.error)}` },
        { status: 400 }
      );
    }

    const body = parsedBody.data;
    if (!auth.user.employeeId || existing.employeeId !== auth.user.employeeId) {
      return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
    }

    if (existing.status !== "SUBMITTED") {
      return NextResponse.json(
        { error: "Pengajuan yang sudah diproses tidak bisa diubah" },
        { status: 400 }
      );
    }

    const startDate = body.startDate ? new Date(body.startDate) : existing.startDate;
    const endDate = body.endDate ? new Date(body.endDate) : existing.endDate;
    if (endDate < startDate) {
      return NextResponse.json(
        { error: "Rentang tanggal perjalanan tidak valid" },
        { status: 400 }
      );
    }
    const nextStatus = body.status === "CANCELLED" ? "CANCELLED" : existing.status;
    if (nextStatus !== "CANCELLED") {
      const [overlap] = await db
        .select({ id: businessTrips.id })
        .from(businessTrips)
        .where(
          and(
            eq(businessTrips.employeeId, existing.employeeId),
            inArray(businessTrips.status, [...ACTIVE_TRIP_STATUSES]),
            sql`${businessTrips.startDate} <= ${endDate}`,
            sql`${businessTrips.endDate} >= ${startDate}`,
            sql`${businessTrips.id} <> ${params.id}`
          )
        )
        .limit(1);
      if (overlap) {
        return NextResponse.json(
          {
            error:
              "Tanggal perjalanan dinas bentrok dengan pengajuan lain yang masih aktif.",
          },
          { status: 400 }
        );
      }
    }
    const compensation = calculateBusinessTripCompensation({
      employeeTitle: employee.title,
      startDate,
      endDate,
      isOutOfTownOvernight:
        body.isOutOfTownOvernight ?? existing.isOutOfTownOvernight ?? false,
      transportOptionId: body.transportOptionId ?? existing.transportOptionId ?? null,
      settings: compensationSettings,
    });

    const [updated] = await db
      .update(businessTrips)
      .set({
        destinationCity: body.destinationCity ?? undefined,
        companyName: body.companyName ?? undefined,
        purpose: body.purpose ?? undefined,
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        endDate: body.endDate ? new Date(body.endDate) : undefined,
        allowanceRuleId: compensation.ope.ruleId,
        allowanceRuleLabel: compensation.ope.ruleLabel,
        allowanceDaily: compensation.ope.daily.toString(),
        allowanceDays: compensation.days,
        allowanceTotal: compensation.ope.total.toString(),
        isOutOfTownOvernight:
          body.isOutOfTownOvernight ?? existing.isOutOfTownOvernight ?? false,
        transportOptionId: body.transportOptionId ?? existing.transportOptionId ?? null,
        compensationBreakdownJson: JSON.stringify(compensation),
        compensationTotal: compensation.total.toString(),
        status: nextStatus,
        updatedAt: new Date(),
      })
      .where(
        and(eq(businessTrips.id, params.id), eq(businessTrips.status, existing.status))
      )
      .returning();
    if (!updated) {
      return NextResponse.json(
        {
          error:
            "Data sudah berubah oleh proses lain. Silakan refresh lalu coba lagi.",
        },
        { status: 409 }
      );
    }

    if (updated.status !== existing.status && updated.status === "CANCELLED") {
      await createWorkflowEvent(db, {
        module: "BUSINESS_TRIP",
        entityId: updated.id,
        action: "CANCELLED",
        fromStatus: existing.status,
        toStatus: updated.status,
        note: "Dibatalkan oleh pengaju",
        actorUserId: auth.user.id,
        actorEmployeeId: auth.user.employeeId,
      });

      const approverMap = await resolveUserIdsByEmployeeIds(db, [
        approverLevel1EmployeeId,
        approverLevel2EmployeeId,
      ]);
      const targetUserIds = [approverLevel1EmployeeId, approverLevel2EmployeeId]
        .map((employeeId) => (employeeId ? approverMap.get(employeeId) ?? null : null))
        .filter((userId): userId is string => Boolean(userId) && userId !== auth.user.id);
      await createNotificationsForUsers(db, targetUserIds, {
        type: "BUSINESS_TRIP_CANCELLED",
        title: "Perjalanan Dinas Dibatalkan",
        message: "Pengaju membatalkan pengajuan perjalanan dinas.",
        entityType: "BUSINESS_TRIP",
        entityId: updated.id,
      });
    }

    return NextResponse.json({
      ...updated,
      compensationBreakdown: compensation,
    });
  }

  const parsedBody = adminUpdateSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: `Payload tidak valid: ${formatZodError(parsedBody.error)}` },
      { status: 400 }
    );
  }

  const body = parsedBody.data;
  const requestedStatus = body.status ?? existing.status;
  let nextStatus = requestedStatus;
  const startDate = body.startDate ? new Date(body.startDate) : existing.startDate;
  const endDate = body.endDate ? new Date(body.endDate) : existing.endDate;
  if (endDate < startDate) {
    return NextResponse.json(
      { error: "Rentang tanggal perjalanan tidak valid" },
      { status: 400 }
    );
  }
  const compensation = calculateBusinessTripCompensation({
    employeeTitle: employee.title,
    startDate,
    endDate,
    isOutOfTownOvernight:
      body.isOutOfTownOvernight ?? existing.isOutOfTownOvernight ?? false,
    transportOptionId: body.transportOptionId ?? existing.transportOptionId ?? null,
    settings: compensationSettings,
  });

  let approvedBy: string | null | undefined = undefined;
  let approvedAt: Date | null | undefined = undefined;

  if (requestedStatus === "APPROVED" || requestedStatus === "REJECTED") {
    if (existing.status === "SUBMITTED") {
      if (!isApproverLevel1) {
        return NextResponse.json(
          { error: "Anda bukan approver level 1 untuk perjalanan dinas ini" },
          { status: 403 }
        );
      }

      if (requestedStatus === "APPROVED" && approvalLevels === 2) {
        nextStatus = "WAITING_LEVEL_2";
        approvedBy = null;
        approvedAt = null;
      } else {
        nextStatus = requestedStatus;
        approvedBy = auth.user.id;
        approvedAt = new Date();
      }
    } else if (existing.status === "WAITING_LEVEL_2") {
      if (approvalLevels !== 2) {
        return NextResponse.json(
          { error: "Konfigurasi approval level perjalanan dinas tidak sesuai" },
          { status: 400 }
        );
      }
      if (!isApproverLevel2) {
        return NextResponse.json(
          { error: "Anda bukan approver level 2 untuk perjalanan dinas ini" },
          { status: 403 }
        );
      }

      nextStatus = requestedStatus;
      approvedBy = auth.user.id;
      approvedAt = new Date();
    } else {
      return NextResponse.json(
        { error: "Status saat ini tidak bisa diproses approval/reject" },
        { status: 400 }
      );
    }
  } else if (
    requestedStatus === "WAITING_LEVEL_2" &&
    existing.status !== "WAITING_LEVEL_2"
  ) {
    return NextResponse.json(
      { error: "Status WAITING_LEVEL_2 tidak dapat di-set manual" },
      { status: 400 }
    );
  } else if (requestedStatus === "SUBMITTED" && existing.status !== "SUBMITTED") {
    return NextResponse.json(
      { error: "Status SUBMITTED tidak dapat dikembalikan manual" },
      { status: 400 }
    );
  }

  if (nextStatus !== "CANCELLED") {
    const [overlap] = await db
      .select({ id: businessTrips.id })
      .from(businessTrips)
      .where(
        and(
          eq(businessTrips.employeeId, existing.employeeId),
          inArray(businessTrips.status, [...ACTIVE_TRIP_STATUSES]),
          sql`${businessTrips.startDate} <= ${endDate}`,
          sql`${businessTrips.endDate} >= ${startDate}`,
          sql`${businessTrips.id} <> ${params.id}`
        )
      )
      .limit(1);
    if (overlap) {
      return NextResponse.json(
        {
          error:
            "Tanggal perjalanan dinas bentrok dengan pengajuan lain yang masih aktif.",
        },
        { status: 400 }
      );
    }
  }

  const [updated] = await db
    .update(businessTrips)
    .set({
      destinationCity: body.destinationCity ?? undefined,
      companyName: body.companyName ?? undefined,
      purpose: body.purpose ?? undefined,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      endDate: body.endDate ? new Date(body.endDate) : undefined,
      allowanceRuleId: compensation.ope.ruleId,
      allowanceRuleLabel: compensation.ope.ruleLabel,
      allowanceDaily: compensation.ope.daily.toString(),
      allowanceDays: compensation.days,
      allowanceTotal: compensation.ope.total.toString(),
      isOutOfTownOvernight:
        body.isOutOfTownOvernight ?? existing.isOutOfTownOvernight ?? false,
      transportOptionId: body.transportOptionId ?? existing.transportOptionId ?? null,
      compensationBreakdownJson: JSON.stringify(compensation),
      compensationTotal: compensation.total.toString(),
      status: nextStatus,
      adminNote: body.adminNote ?? undefined,
      approvedBy,
      approvedAt,
      updatedAt: new Date(),
    })
    .where(and(eq(businessTrips.id, params.id), eq(businessTrips.status, existing.status)))
    .returning();
  if (!updated) {
    return NextResponse.json(
      {
        error:
          "Data sudah berubah oleh proses lain. Silakan refresh lalu coba lagi.",
      },
      { status: 409 }
    );
  }

  if (updated.status !== existing.status) {
    let action = "STATUS_CHANGED";
    let level: number | null = null;

    if (updated.status === "WAITING_LEVEL_2") {
      action = "APPROVED_L1";
      level = 1;
    } else if (updated.status === "APPROVED") {
      action = existing.status === "WAITING_LEVEL_2" ? "APPROVED_L2" : "APPROVED";
      level = existing.status === "WAITING_LEVEL_2" ? 2 : 1;
    } else if (updated.status === "REJECTED") {
      action = existing.status === "WAITING_LEVEL_2" ? "REJECTED_L2" : "REJECTED_L1";
      level = existing.status === "WAITING_LEVEL_2" ? 2 : 1;
    } else if (updated.status === "CANCELLED") {
      action = "CANCELLED";
    }

    await createWorkflowEvent(db, {
      module: "BUSINESS_TRIP",
      entityId: updated.id,
      level,
      action,
      fromStatus: existing.status,
      toStatus: updated.status,
      note: body.adminNote ?? null,
      actorUserId: auth.user.id,
      actorEmployeeId: auth.user.employeeId,
    });

    const userByEmployee = await resolveUserIdsByEmployeeIds(db, [
      existing.employeeId,
      approverLevel2EmployeeId,
    ]);
    const requesterUserId = userByEmployee.get(existing.employeeId);
    const notificationTargets: string[] = [];

    if (requesterUserId && requesterUserId !== auth.user.id) {
      notificationTargets.push(requesterUserId);
    }
    if (updated.status === "WAITING_LEVEL_2" && approverLevel2EmployeeId) {
      const approverL2UserId = userByEmployee.get(approverLevel2EmployeeId);
      if (approverL2UserId && approverL2UserId !== auth.user.id) {
        notificationTargets.push(approverL2UserId);
      }
    }

    await createNotificationsForUsers(db, notificationTargets, {
      type: `BUSINESS_TRIP_${updated.status}`,
      title:
        updated.status === "WAITING_LEVEL_2"
          ? "Perjalanan Dinas Menunggu Approval L2"
          : "Update Status Perjalanan Dinas",
      message:
        updated.status === "WAITING_LEVEL_2"
          ? "Ada pengajuan perjalanan dinas yang perlu Anda review di level 2."
          : `Status perjalanan dinas berubah menjadi ${updated.status}.`,
      entityType: "BUSINESS_TRIP",
      entityId: updated.id,
    });
  }

  return NextResponse.json({
    ...updated,
    compensationBreakdown: compensation,
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const db = getDb();
  const [existing] = await db
    .select()
    .from(businessTrips)
    .where(eq(businessTrips.id, params.id))
    .limit(1);

  if (!existing) {
    return NextResponse.json(
      { error: "Perjalanan dinas tidak ditemukan" },
      { status: 404 }
    );
  }

  if (existing.status !== "CANCELLED") {
    return NextResponse.json(
      { error: "Hard delete hanya diizinkan untuk status CANCELLED" },
      { status: 400 }
    );
  }

  await createWorkflowEvent(db, {
    module: "BUSINESS_TRIP",
    entityId: existing.id,
    action: "HARD_DELETED",
    fromStatus: existing.status,
    toStatus: null,
    note: "Hard delete oleh admin",
    actorUserId: auth.user.id,
    actorEmployeeId: auth.user.employeeId,
  });

  await db.delete(businessTrips).where(eq(businessTrips.id, params.id));
  return NextResponse.json({ ok: true });
}
