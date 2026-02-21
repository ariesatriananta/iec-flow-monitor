export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { leaveRequests, settingsApprovalFlow } from "@/lib/db/schema";
import { requireAdmin, requireSessionUser } from "@/lib/auth/server";
import { createWorkflowEvent } from "@/lib/workflow-events";
import {
  createNotificationsForUsers,
  resolveUserIdsByEmployeeIds,
} from "@/lib/notifications";

const dateStringSchema = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(new Date(value).getTime()), "Format tanggal tidak valid");

const staffUpdateSchema = z.object({
  leaveType: z.string().trim().min(1).max(50).optional(),
  reason: z.string().trim().min(1).max(2000).optional(),
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.optional(),
  status: z.literal("CANCELLED").optional(),
});

const adminUpdateSchema = z.object({
  leaveType: z.string().trim().min(1).max(50).optional(),
  reason: z.string().trim().min(1).max(2000).optional(),
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.optional(),
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
    .from(leaveRequests)
    .where(eq(leaveRequests.id, params.id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Pengajuan cuti tidak ditemukan" }, { status: 404 });
  }

  const [approvalFlow] = await db.select().from(settingsApprovalFlow).limit(1);
  const leaveApprovalLevels = approvalFlow?.leaveApprovalLevels ?? 2;
  const approverLevel1EmployeeId = approvalFlow?.leaveApproverLevel1EmployeeId ?? null;
  const approverLevel2EmployeeId = approvalFlow?.leaveApproverLevel2EmployeeId ?? null;
  const isApproverLevel1 =
    Boolean(auth.user.employeeId) && auth.user.employeeId === approverLevel1EmployeeId;
  const isApproverLevel2 =
    leaveApprovalLevels === 2 &&
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
        { error: "Rentang tanggal cuti tidak valid" },
        { status: 400 }
      );
    }

    const [updated] = await db
      .update(leaveRequests)
      .set({
        leaveType: body.leaveType ?? undefined,
        reason: body.reason ?? undefined,
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        endDate: body.endDate ? new Date(body.endDate) : undefined,
        status: body.status === "CANCELLED" ? "CANCELLED" : existing.status,
        updatedAt: new Date(),
      })
      .where(eq(leaveRequests.id, params.id))
      .returning();

    if (updated.status !== existing.status && updated.status === "CANCELLED") {
      await createWorkflowEvent(db, {
        module: "LEAVE",
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
        type: "LEAVE_CANCELLED",
        title: "Pengajuan Cuti Dibatalkan",
        message: "Pengaju membatalkan pengajuan cuti sebelum diproses.",
        entityType: "LEAVE",
        entityId: updated.id,
      });
    }

    return NextResponse.json(updated);
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
  const startDate = body.startDate ? new Date(body.startDate) : existing.startDate;
  const endDate = body.endDate ? new Date(body.endDate) : existing.endDate;
  if (endDate < startDate) {
    return NextResponse.json(
      { error: "Rentang tanggal cuti tidak valid" },
      { status: 400 }
    );
  }

  let nextStatus = requestedStatus;
  let approvedBy: string | null | undefined = undefined;
  let approvedAt: Date | null | undefined = undefined;

  if (requestedStatus === "APPROVED" || requestedStatus === "REJECTED") {
    if (existing.status === "SUBMITTED") {
      if (!isApproverLevel1) {
        return NextResponse.json(
          { error: "Anda bukan approver level 1 untuk pengajuan cuti ini" },
          { status: 403 }
        );
      }

      if (requestedStatus === "APPROVED" && leaveApprovalLevels === 2) {
        nextStatus = "WAITING_LEVEL_2";
        approvedBy = null;
        approvedAt = null;
      } else {
        nextStatus = requestedStatus;
        approvedBy = auth.user.id;
        approvedAt = new Date();
      }
    } else if (existing.status === "WAITING_LEVEL_2") {
      if (leaveApprovalLevels !== 2) {
        return NextResponse.json(
          { error: "Konfigurasi approval level cuti tidak sesuai" },
          { status: 400 }
        );
      }
      if (!isApproverLevel2) {
        return NextResponse.json(
          { error: "Anda bukan approver level 2 untuk pengajuan cuti ini" },
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

  const [updated] = await db
    .update(leaveRequests)
    .set({
      leaveType: body.leaveType ?? undefined,
      reason: body.reason ?? undefined,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      endDate: body.endDate ? new Date(body.endDate) : undefined,
      status: nextStatus,
      adminNote: body.adminNote ?? undefined,
      approvedBy,
      approvedAt,
      updatedAt: new Date(),
    })
    .where(eq(leaveRequests.id, params.id))
    .returning();

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
      module: "LEAVE",
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
      type: `LEAVE_${updated.status}`,
      title:
        updated.status === "WAITING_LEVEL_2"
          ? "Pengajuan Cuti Menunggu Approval L2"
          : "Update Status Pengajuan Cuti",
      message:
        updated.status === "WAITING_LEVEL_2"
          ? "Ada pengajuan cuti yang perlu Anda review di level 2."
          : `Status pengajuan cuti berubah menjadi ${updated.status}.`,
      entityType: "LEAVE",
      entityId: updated.id,
    });
  }

  return NextResponse.json(updated);
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
    .from(leaveRequests)
    .where(eq(leaveRequests.id, params.id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Pengajuan cuti tidak ditemukan" }, { status: 404 });
  }

  await createWorkflowEvent(db, {
    module: "LEAVE",
    entityId: existing.id,
    action: "HARD_DELETED",
    fromStatus: existing.status,
    toStatus: null,
    note: "Hard delete oleh admin",
    actorUserId: auth.user.id,
    actorEmployeeId: auth.user.employeeId,
  });

  await db.delete(leaveRequests).where(eq(leaveRequests.id, params.id));
  return NextResponse.json({ ok: true });
}
