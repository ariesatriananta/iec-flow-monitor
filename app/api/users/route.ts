export const dynamic = "force-dynamic"

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import bcrypt from "bcryptjs";

export async function GET() {
  const db = getDb();
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      name: users.name,
      role: users.role,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users);
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const body = await request.json();

  if (!body?.username || !body?.name || !body?.password) {
    return NextResponse.json(
      { error: "Data user belum lengkap" },
      { status: 400 }
    );
  }

  const db = getDb();
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, body.username))
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json(
      { error: "Username sudah digunakan" },
      { status: 409 }
    );
  }

  const now = new Date();
  const passwordHash = await bcrypt.hash(body.password, 10);
  const [created] = await db
    .insert(users)
    .values({
      id: crypto.randomUUID(),
      username: body.username,
      name: body.name,
      role: "ADMIN",
      passwordHash,
      createdAt: now,
      updatedAt: now,
    })
    .returning({
      id: users.id,
      username: users.username,
      name: users.name,
      role: users.role,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    });

  return NextResponse.json(created, { status: 201 });
}
