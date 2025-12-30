export const dynamic = "force-dynamic"

import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import bcrypt from "bcryptjs";

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
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

  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (body.username !== undefined) updateData.username = body.username;
  if (body.name !== undefined) updateData.name = body.name;
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
