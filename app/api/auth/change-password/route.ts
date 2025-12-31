export const dynamic = "force-dynamic"

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";

export async function POST(request: Request) {
  const body = await request.json();

  if (!body?.username || !body?.currentPassword || !body?.newPassword) {
    return NextResponse.json(
      { error: "Data belum lengkap" },
      { status: 400 }
    );
  }

  if (body.newPassword.length < 8) {
    return NextResponse.json(
      { error: "Password baru minimal 8 karakter" },
      { status: 400 }
    );
  }

  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.username, body.username))
    .limit(1);

  if (!user) {
    return NextResponse.json(
      { error: "User tidak ditemukan" },
      { status: 404 }
    );
  }

  const isValid = await bcrypt.compare(body.currentPassword, user.passwordHash);
  if (!isValid) {
    return NextResponse.json(
      { error: "Password saat ini salah" },
      { status: 401 }
    );
  }

  const passwordHash = await bcrypt.hash(body.newPassword, 10);
  await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  return NextResponse.json({ ok: true });
}
