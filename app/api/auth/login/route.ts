export const dynamic = "force-dynamic"

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";

export async function POST(request: Request) {
  const body = await request.json();

  if (!body?.username || !body?.password) {
    return NextResponse.json(
      { error: "Username dan password wajib diisi" },
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
      { error: "Username atau password salah" },
      { status: 401 }
    );
  }

  const isValid = await bcrypt.compare(body.password, user.passwordHash);
  if (!isValid) {
    return NextResponse.json(
      { error: "Username atau password salah" },
      { status: 401 }
    );
  }

  return NextResponse.json({
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  });
}
