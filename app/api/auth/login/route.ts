export const dynamic = "force-dynamic"

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import {
  createSessionToken,
  sessionCookieOptions,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/session";

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

  const role = user.role === "STAFF" ? "STAFF" : "ADMIN";
  const token = createSessionToken({
    userId: user.id,
    role,
  });

  cookies().set(SESSION_COOKIE_NAME, token, sessionCookieOptions);

  return NextResponse.json({
    id: user.id,
    username: user.username,
    name: user.name,
    role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  });
}
