import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { parseSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";

export type SessionUser = {
  id: string;
  username: string;
  name: string;
  role: "ADMIN" | "STAFF";
};

type GuardResult =
  | { user: SessionUser; response?: never }
  | { user?: never; response: NextResponse };

export async function requireSessionUser(): Promise<GuardResult> {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  const session = parseSessionToken(token);

  if (!session) {
    return {
      response: NextResponse.json(
        { error: "Sesi login tidak valid" },
        { status: 401 }
      ),
    };
  }

  const db = getDb();
  const [user] = await db
    .select({
      id: users.id,
      username: users.username,
      name: users.name,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, session.sub))
    .limit(1);

  if (!user) {
    return {
      response: NextResponse.json(
        { error: "User tidak ditemukan" },
        { status: 401 }
      ),
    };
  }

  return {
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role === "STAFF" ? "STAFF" : "ADMIN",
    },
  };
}

export async function requireAdmin(): Promise<GuardResult> {
  const auth = await requireSessionUser();
  if ("response" in auth) {
    return auth;
  }

  if (auth.user.role !== "ADMIN") {
    return {
      response: NextResponse.json(
        { error: "Akses ditolak" },
        { status: 403 }
      ),
    };
  }

  return auth;
}

