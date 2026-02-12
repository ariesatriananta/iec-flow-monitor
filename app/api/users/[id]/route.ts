export const dynamic = "force-dynamic"

import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { employees, users } from "@/lib/db/schema";
import bcrypt from "bcryptjs";
import { requireAdmin } from "@/lib/auth/server";

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const body = await request.json();

  if (!body) {
    return NextResponse.json(
      { error: "Data update tidak boleh kosong" },
      { status: 400 }
    );
  }

  const db = getDb();

  if (body.username) {
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(eq(users.username, body.username), sql`${users.id} <> ${params.id}`)
      )
      .limit(1);
    if (existing.length > 0) {
      return NextResponse.json(
        { error: "Username sudah digunakan" },
        { status: 409 }
      );
    }
  }

  if (body.employeeId !== undefined) {
    if (body.employeeId) {
      const [employeeExists] = await db
        .select({ id: employees.id })
        .from(employees)
        .where(eq(employees.id, body.employeeId))
        .limit(1);
      if (!employeeExists) {
        return NextResponse.json(
          { error: "Employee tidak ditemukan" },
          { status: 404 }
        );
      }

      const employeeTaken = await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.employeeId, body.employeeId),
            sql`${users.id} <> ${params.id}`
          )
        )
        .limit(1);
      if (employeeTaken.length > 0) {
        return NextResponse.json(
          { error: "Employee sudah terhubung ke user lain" },
          { status: 409 }
        );
      }
    }
  }

  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (body.username !== undefined) updateData.username = body.username;
  if (body.name !== undefined) updateData.name = body.name;
  if (body.role !== undefined) {
    updateData.role = body.role === "STAFF" ? "STAFF" : "ADMIN";
  }
  if (body.employeeId !== undefined) {
    updateData.employeeId = body.employeeId || null;
  }
  if (body.password) {
    updateData.passwordHash = await bcrypt.hash(body.password, 10);
  }

  const [updated] = await db
    .update(users)
    .set(updateData)
    .where(eq(users.id, params.id))
    .returning({
      id: users.id,
      username: users.username,
      name: users.name,
      role: users.role,
      employeeId: users.employeeId,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    });

  if (!updated) {
    return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 });
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
  const total = await db
    .select({ count: sql<number>`count(*)` })
    .from(users);
  const totalUsers = Number(total[0]?.count ?? 0);

  if (totalUsers <= 1) {
    return NextResponse.json(
      { error: "Tidak bisa menghapus user terakhir" },
      { status: 400 }
    );
  }

  const [deleted] = await db
    .delete(users)
    .where(eq(users.id, params.id))
    .returning({ id: users.id });

  if (!deleted) {
    return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
