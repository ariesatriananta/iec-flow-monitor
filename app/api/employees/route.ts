export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { employees, users } from "@/lib/db/schema";
import { requireAdmin, requireSessionUser } from "@/lib/auth/server";

export async function GET() {
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  const db = getDb();
  const rows = await db
    .select({ employee: employees, user: users })
    .from(employees)
    .leftJoin(users, eq(employees.userId, users.id));

  const filtered =
    auth.user.role === "ADMIN"
      ? rows
      : rows.filter((row) => row.employee.userId === auth.user.id);

  return NextResponse.json(
    filtered.map(({ employee, user }) => ({
      ...employee,
      user: user
        ? {
            id: user.id,
            username: user.username,
            name: user.name,
            role: user.role,
          }
        : undefined,
    }))
  );
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const body = await request.json();

  if (!body?.userId || !body?.employeeCode) {
    return NextResponse.json(
      { error: "userId dan employeeCode wajib diisi" },
      { status: 400 }
    );
  }

  const db = getDb();
  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, body.userId))
    .limit(1);

  if (!owner) {
    return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 });
  }

  const now = new Date();
  const [created] = await db
    .insert(employees)
    .values({
      id: crypto.randomUUID(),
      userId: body.userId,
      employeeCode: body.employeeCode,
      position: body.position ?? null,
      department: body.department ?? null,
      workLocation: body.workLocation ?? null,
      phone: body.phone ?? null,
      email: body.email ?? null,
      isActive: body.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
