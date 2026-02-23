export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { and, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  attendanceRecords,
  businessTrips,
  employees,
  leaveRequests,
  notifications,
  reimbursementAttachments,
  reimbursementItems,
  reimbursements,
  settingsApprovalFlow,
  users,
  workflowEvents,
} from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/server";
import { deleteObjectFromR2 } from "@/lib/storage/r2";

const updateEmployeeSchema = z.object({
  fullName: z.string().trim().min(1).optional(),
  nip: z.string().trim().min(1).optional(),
  gender: z.enum(["MALE", "FEMALE"]).optional(),
  title: z.string().trim().min(1).optional(),
  department: z.string().trim().min(1).optional(),
  workLocation: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  bankAccountName: z.string().trim().optional(),
  bankAccountNumber: z.string().trim().optional(),
  isActive: z.boolean().optional(),
});

const formatZodError = (error: z.ZodError) =>
  error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");

const getEmployeeUniqueErrorMessage = (error: unknown) => {
  if (typeof error !== "object" || !error) return null;
  const pgError = error as { code?: string; constraint?: string };
  if (pgError.code !== "23505") return null;

  if (pgError.constraint === "employees_nip_unique") {
    return "NIP sudah digunakan employee lain";
  }
  if (pgError.constraint === "employees_email_unique") {
    return "Email sudah digunakan employee lain";
  }
  return "Data employee duplikat (unik) terdeteksi";
};

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const db = getDb();
  const [row] = await db
    .select({ employee: employees, user: users })
    .from(employees)
    .leftJoin(users, eq(users.employeeId, employees.id))
    .where(eq(employees.id, params.id))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Employee tidak ditemukan" }, { status: 404 });
  }

  return NextResponse.json({
    ...row.employee,
    user: row.user
      ? {
          id: row.user.id,
          username: row.user.username,
          name: row.user.name,
          role: row.user.role,
        }
      : undefined,
    canHardDelete: true,
    hardDeleteReasons: [],
  });
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const body = await request.json();
  if (!body) {
    return NextResponse.json({ error: "Data update kosong" }, { status: 400 });
  }
  const parsedBody = updateEmployeeSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: `Body tidak valid: ${formatZodError(parsedBody.error)}` },
      { status: 400 }
    );
  }

  const input = parsedBody.data;

  const db = getDb();
  let updated: typeof employees.$inferSelect | undefined;
  try {
    [updated] = await db
      .update(employees)
      .set({
        fullName: input.fullName ?? undefined,
        nip: input.nip ?? undefined,
        gender: input.gender ?? undefined,
        title: input.title ?? undefined,
        department: input.department ?? undefined,
        workLocation: input.workLocation ?? undefined,
        phone: input.phone ?? undefined,
        email: input.email === "" ? null : input.email ?? undefined,
        bankAccountName: input.bankAccountName ?? undefined,
        bankAccountNumber: input.bankAccountNumber ?? undefined,
        isActive: input.isActive ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(employees.id, params.id))
      .returning();
  } catch (error) {
    const message = getEmployeeUniqueErrorMessage(error);
    if (message) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    throw error;
  }

  if (!updated) {
    return NextResponse.json({ error: "Employee tidak ditemukan" }, { status: 404 });
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
  const [employee] = await db
    .select({ id: employees.id, isActive: employees.isActive })
    .from(employees)
    .where(eq(employees.id, params.id))
    .limit(1);

  if (!employee) {
    return NextResponse.json({ error: "Employee tidak ditemukan" }, { status: 404 });
  }

  const linkedUsers = await db
    .select({
      id: users.id,
      employeeId: users.employeeId,
      role: users.role,
      username: users.username,
      name: users.name,
    })
    .from(users)
    .where(eq(users.employeeId, params.id));

  const [leaveRows, tripRows, reimbursementRows] = await Promise.all([
    db
      .select({ id: leaveRequests.id })
      .from(leaveRequests)
      .where(eq(leaveRequests.employeeId, params.id)),
    db
      .select({ id: businessTrips.id })
      .from(businessTrips)
      .where(eq(businessTrips.employeeId, params.id)),
    db
      .select({ id: reimbursements.id })
      .from(reimbursements)
      .where(eq(reimbursements.employeeId, params.id)),
  ]);

  const leaveIds = leaveRows.map((row) => row.id);
  const tripIds = tripRows.map((row) => row.id);
  const reimbursementIds = reimbursementRows.map((row) => row.id);

  const attachmentRows =
    reimbursementIds.length > 0
      ? await db
          .select({ id: reimbursementAttachments.id, fileKey: reimbursementAttachments.fileKey })
          .from(reimbursementAttachments)
          .where(inArray(reimbursementAttachments.reimbursementId, reimbursementIds))
      : [];

  await db.transaction(async (tx) => {
    // Unlink any login account from this employee.
    if (linkedUsers.length > 0) {
      await tx
        .update(users)
        .set({ employeeId: null, updatedAt: new Date() })
        .where(eq(users.employeeId, params.id));
    }

    // Remove employee from approval-flow assignments if referenced.
    await tx
      .update(settingsApprovalFlow)
      .set({ leaveApproverLevel1EmployeeId: null, updatedAt: new Date() })
      .where(eq(settingsApprovalFlow.leaveApproverLevel1EmployeeId, params.id));
    await tx
      .update(settingsApprovalFlow)
      .set({ leaveApproverLevel2EmployeeId: null, updatedAt: new Date() })
      .where(eq(settingsApprovalFlow.leaveApproverLevel2EmployeeId, params.id));
    await tx
      .update(settingsApprovalFlow)
      .set({ reimbursementApproverLevel1EmployeeId: null, updatedAt: new Date() })
      .where(eq(settingsApprovalFlow.reimbursementApproverLevel1EmployeeId, params.id));
    await tx
      .update(settingsApprovalFlow)
      .set({ reimbursementApproverLevel2EmployeeId: null, updatedAt: new Date() })
      .where(eq(settingsApprovalFlow.reimbursementApproverLevel2EmployeeId, params.id));
    await tx
      .update(settingsApprovalFlow)
      .set({ businessTripApproverLevel1EmployeeId: null, updatedAt: new Date() })
      .where(eq(settingsApprovalFlow.businessTripApproverLevel1EmployeeId, params.id));
    await tx
      .update(settingsApprovalFlow)
      .set({ businessTripApproverLevel2EmployeeId: null, updatedAt: new Date() })
      .where(eq(settingsApprovalFlow.businessTripApproverLevel2EmployeeId, params.id));

    // Delete notifications linked to workflow entities owned by this employee.
    if (leaveIds.length > 0) {
      await tx.delete(notifications).where(entityMatch(notifications.entityType, notifications.entityId, "LEAVE", leaveIds));
    }
    if (tripIds.length > 0) {
      await tx
        .delete(notifications)
        .where(entityMatch(notifications.entityType, notifications.entityId, "BUSINESS_TRIP", tripIds));
    }
    if (reimbursementIds.length > 0) {
      await tx
        .delete(notifications)
        .where(entityMatch(notifications.entityType, notifications.entityId, "REIMBURSEMENT", reimbursementIds));
    }

    // Delete workflow events referencing those entities and any events performed by this employee.
    await tx.delete(workflowEvents).where(eq(workflowEvents.actorEmployeeId, params.id));
    if (tripIds.length > 0) {
      await tx
        .delete(workflowEvents)
        .where(entityMatch(workflowEvents.module, workflowEvents.entityId, "BUSINESS_TRIP", tripIds));
    }
    if (leaveIds.length > 0) {
      await tx
        .delete(workflowEvents)
        .where(entityMatch(workflowEvents.module, workflowEvents.entityId, "LEAVE", leaveIds));
    }
    if (reimbursementIds.length > 0) {
      await tx
        .delete(workflowEvents)
        .where(entityMatch(workflowEvents.module, workflowEvents.entityId, "REIMBURSEMENT", reimbursementIds));
    }

    // Delete attendance/history rows.
    await tx.delete(attendanceRecords).where(eq(attendanceRecords.employeeId, params.id));
    if (leaveIds.length > 0) {
      await tx.delete(leaveRequests).where(inArray(leaveRequests.id, leaveIds));
    }
    if (tripIds.length > 0) {
      await tx.delete(businessTrips).where(inArray(businessTrips.id, tripIds));
    }
    if (reimbursementIds.length > 0) {
      await tx
        .delete(reimbursementAttachments)
        .where(inArray(reimbursementAttachments.reimbursementId, reimbursementIds));
      await tx
        .delete(reimbursementItems)
        .where(inArray(reimbursementItems.reimbursementId, reimbursementIds));
      await tx.delete(reimbursements).where(inArray(reimbursements.id, reimbursementIds));
    }
    await tx.delete(employees).where(eq(employees.id, params.id));
  });

  // Best-effort R2 cleanup for deleted reimbursement attachments (do not fail the delete flow).
  await Promise.allSettled(
    attachmentRows
      .map((row) => row.fileKey)
      .filter((key): key is string => Boolean(key))
      .map((key) => deleteObjectFromR2(key))
  );

  return NextResponse.json({ ok: true });
}

function entityMatch(
  entityTypeColumn: typeof notifications.entityType | typeof workflowEvents.module,
  entityIdColumn: typeof notifications.entityId | typeof workflowEvents.entityId,
  entityType: "LEAVE" | "BUSINESS_TRIP" | "REIMBURSEMENT",
  ids: string[]
) {
  return and(
    or(eq(entityTypeColumn, entityType), eq(entityTypeColumn, entityType.toLowerCase())),
    inArray(entityIdColumn, ids)
  );
}
