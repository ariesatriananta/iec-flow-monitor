export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  attendanceRecords,
  businessTrips,
  employees,
  leaveRequests,
  reimbursements,
  users,
} from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/server";

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
  const [updated] = await db
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
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.id, params.id))
    .limit(1);

  if (!employee) {
    return NextResponse.json({ error: "Employee tidak ditemukan" }, { status: 404 });
  }

  const linkedUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.employeeId, params.id));

  const linkedUserIds = linkedUsers.map((item) => item.id);
  if (linkedUserIds.length > 0) {
    const [attendanceCount, leaveCount, tripCount, reimbursementCount] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(attendanceRecords)
        .where(inArray(attendanceRecords.userId, linkedUserIds)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(leaveRequests)
        .where(inArray(leaveRequests.userId, linkedUserIds)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(businessTrips)
        .where(inArray(businessTrips.userId, linkedUserIds)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(reimbursements)
        .where(inArray(reimbursements.userId, linkedUserIds)),
    ]);

    const usedInWorkflow =
      Number(attendanceCount[0]?.count ?? 0) > 0 ||
      Number(leaveCount[0]?.count ?? 0) > 0 ||
      Number(tripCount[0]?.count ?? 0) > 0 ||
      Number(reimbursementCount[0]?.count ?? 0) > 0;

    if (usedInWorkflow) {
      return NextResponse.json(
        { error: "Employee tidak bisa dihapus karena sudah dipakai transaksi/workflow" },
        { status: 409 }
      );
    }
  }

  await db.transaction(async (tx) => {
    if (linkedUserIds.length > 0) {
      await tx
        .update(users)
        .set({ employeeId: null, updatedAt: new Date() })
        .where(inArray(users.id, linkedUserIds));
    }

    await tx.delete(employees).where(eq(employees.id, params.id));
  });

  return NextResponse.json({ ok: true });
}
