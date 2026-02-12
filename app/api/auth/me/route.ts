export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { employees, users } from "@/lib/db/schema";
import {
  parseSessionToken,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/lib/auth/session";

export async function GET() {
  const cookieStore = cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = parseSessionToken(token);

  if (!session) {
    if (token) {
      cookieStore.set(SESSION_COOKIE_NAME, "", {
        ...sessionCookieOptions,
        maxAge: 0,
      });
    }
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const db = getDb();
  const [row] = await db
    .select({
      user: {
        id: users.id,
        username: users.username,
        name: users.name,
        role: users.role,
        employeeId: users.employeeId,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      },
      employee: {
        id: employees.id,
        employeeCode: employees.employeeCode,
        fullName: employees.fullName,
        nip: employees.nip,
        gender: employees.gender,
        title: employees.title,
        department: employees.department,
        workLocation: employees.workLocation,
        phone: employees.phone,
        email: employees.email,
        bankAccountName: employees.bankAccountName,
        bankAccountNumber: employees.bankAccountNumber,
        isActive: employees.isActive,
        updatedAt: employees.updatedAt,
      },
    })
    .from(users)
    .leftJoin(employees, eq(users.employeeId, employees.id))
    .where(eq(users.id, session.sub))
    .limit(1);

  if (!row) {
    cookieStore.set(SESSION_COOKIE_NAME, "", {
      ...sessionCookieOptions,
      maxAge: 0,
    });
    return NextResponse.json({ user: null }, { status: 401 });
  }

  return NextResponse.json({
    ...row.user,
    employee: row.employee?.id ? row.employee : null,
  });
}
