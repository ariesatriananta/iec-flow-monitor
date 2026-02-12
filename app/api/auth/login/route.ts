export const dynamic = "force-dynamic"

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/db";
import { employees, users } from "@/lib/db/schema";
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
  const [row] = await db
    .select({
      user: users,
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
    .where(eq(users.username, body.username))
    .limit(1);

  if (!row?.user) {
    return NextResponse.json(
      { error: "Username atau password salah" },
      { status: 401 }
    );
  }

  const isValid = await bcrypt.compare(body.password, row.user.passwordHash);
  if (!isValid) {
    return NextResponse.json(
      { error: "Username atau password salah" },
      { status: 401 }
    );
  }

  const role = row.user.role === "STAFF" ? "STAFF" : "ADMIN";
  const token = createSessionToken({
    userId: row.user.id,
    role,
  });

  cookies().set(SESSION_COOKIE_NAME, token, sessionCookieOptions);

  return NextResponse.json({
    id: row.user.id,
    username: row.user.username,
    name: row.user.name,
    role,
    employeeId: row.user.employeeId,
    employee: row.employee?.id ? row.employee : null,
    createdAt: row.user.createdAt,
    updatedAt: row.user.updatedAt,
  });
}
