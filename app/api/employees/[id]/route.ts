export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { employees, users } from "@/lib/db/schema";
import { requireAdmin, requireSessionUser } from "@/lib/auth/server";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  const db = getDb();
  const [row] = await db
    .select({ employee: employees, user: users })
    .from(employees)
    .leftJoin(users, eq(employees.userId, users.id))
    .where(eq(employees.id, params.id))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Employee tidak ditemukan" }, { status: 404 });
  }

  if (auth.user.role !== "ADMIN" && row.employee.userId !== auth.user.id) {
    return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
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

  const db = getDb();
  const [updated] = await db
    .update(employees)
    .set({
      employeeCode: body.employeeCode ?? undefined,
      position: body.position ?? undefined,
      department: body.department ?? undefined,
      workLocation: body.workLocation ?? undefined,
      phone: body.phone ?? undefined,
      email: body.email ?? undefined,
      isActive: body.isActive ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(employees.id, params.id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Employee tidak ditemukan" }, { status: 404 });
  }

  return NextResponse.json(updated);
}
