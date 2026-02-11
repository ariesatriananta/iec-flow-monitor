export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, sessionCookieOptions } from "@/lib/auth/session";

export async function POST() {
  cookies().set(SESSION_COOKIE_NAME, "", {
    ...sessionCookieOptions,
    maxAge: 0,
  });

  return NextResponse.json({ ok: true });
}

