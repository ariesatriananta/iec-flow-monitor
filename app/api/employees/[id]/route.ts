export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { employees, users } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/server";
import { buildEmployeeHardDeleteEligibilityMap } from "@/lib/employee-hard-delete";

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

  const eligibilityMap = await buildEmployeeHardDeleteEligibilityMap(db, [
    {
      id: row.employee.id,
      isActive: row.employee.isActive,
      hasLinkedUser: Boolean(row.user?.id),
    },
  ]);
  const eligibility = eligibilityMap.get(row.employee.id);

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
    canHardDelete: eligibility?.canHardDelete ?? false,
    hardDeleteReasons: eligibility?.reasons ?? [],
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

  const [eligibility] = Array.from(
    (
      await buildEmployeeHardDeleteEligibilityMap(db, [
        {
          id: employee.id,
          isActive: employee.isActive,
          hasLinkedUser: linkedUsers.length > 0,
        },
      ])
    ).values()
  );

  if (!eligibility?.canHardDelete) {
    const reasonText =
      eligibility?.reasons && eligibility.reasons.length > 0
        ? ` Alasan: ${eligibility.reasons.join(" ")}`
        : "";
    return NextResponse.json(
      {
        error: `Hard delete tidak diizinkan. Gunakan Deactivate jika employee sudah pernah dipakai atau masih terhubung.${reasonText}`,
        reasons: eligibility?.reasons ?? [],
      },
      { status: 409 }
    );
  }

  await db.delete(employees).where(eq(employees.id, params.id));

  return NextResponse.json({ ok: true });
}
