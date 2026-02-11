export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { and, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { attendanceRecords, users } from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/server";
import { getJakartaDayStart, getJakartaParts } from "@/lib/hr/time";

export async function GET(request: Request) {
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const targetUserId = auth.user.role === "ADMIN" ? userId : auth.user.id;

  const conditions = [];
  if (targetUserId) conditions.push(eq(attendanceRecords.userId, targetUserId));
  if (from) conditions.push(gte(attendanceRecords.attendanceDate, new Date(from)));
  if (to) conditions.push(lte(attendanceRecords.attendanceDate, new Date(to)));

  const db = getDb();
  const baseQuery = db
    .select({ attendance: attendanceRecords, user: users })
    .from(attendanceRecords)
    .leftJoin(users, eq(attendanceRecords.userId, users.id));
  const rows =
    conditions.length > 0
      ? await baseQuery.where(and(...conditions))
      : await baseQuery;

  return NextResponse.json(
    rows.map(({ attendance, user }) => ({
      ...attendance,
      user: user
        ? {
            id: user.id,
            username: user.username,
            name: user.name,
            role: user.role,
          }
        : undefined,
    }))
  );
}

export async function POST(request: Request) {
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  const body = await request.json();
  const action = body?.action;
  if (action !== "CHECK_IN" && action !== "CHECK_OUT") {
    return NextResponse.json(
      { error: "action harus CHECK_IN atau CHECK_OUT" },
      { status: 400 }
    );
  }

  const targetUserId =
    auth.user.role === "ADMIN" && body?.userId ? body.userId : auth.user.id;

  const now = new Date();
  const dayStart = getJakartaDayStart(now);
  const jakarta = getJakartaParts(now);

  const db = getDb();
  const [existing] = await db
    .select()
    .from(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.userId, targetUserId),
        eq(attendanceRecords.attendanceDate, dayStart)
      )
    )
    .limit(1);

  if (action === "CHECK_IN") {
    if (jakarta.hour >= 10) {
      return NextResponse.json(
        { error: "Check-in hanya diperbolehkan sebelum jam 10:00 WIB" },
        { status: 400 }
      );
    }

    if (existing?.checkInAt) {
      return NextResponse.json(
        { error: "Check-in hari ini sudah dilakukan" },
        { status: 400 }
      );
    }

    if (existing) {
      const [updated] = await db
        .update(attendanceRecords)
        .set({
          checkInAt: now,
          checkInLocation: body?.location ?? existing.checkInLocation,
          notes: body?.notes ?? existing.notes,
          updatedAt: now,
        })
        .where(eq(attendanceRecords.id, existing.id))
        .returning();
      return NextResponse.json(updated);
    }

    const [created] = await db
      .insert(attendanceRecords)
      .values({
        id: crypto.randomUUID(),
        userId: targetUserId,
        attendanceDate: dayStart,
        checkInAt: now,
        checkInLocation: body?.location ?? null,
        checkOutAt: null,
        checkOutLocation: null,
        status: "PRESENT",
        notes: body?.notes ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return NextResponse.json(created, { status: 201 });
  }

  if (!existing?.checkInAt) {
    return NextResponse.json(
      { error: "Belum ada data check-in hari ini" },
      { status: 400 }
    );
  }

  if (existing.checkOutAt) {
    return NextResponse.json(
      { error: "Check-out hari ini sudah dilakukan" },
      { status: 400 }
    );
  }

  const [updated] = await db
    .update(attendanceRecords)
    .set({
      checkOutAt: now,
      checkOutLocation: body?.location ?? null,
      notes: body?.notes ?? existing.notes,
      updatedAt: now,
    })
    .where(eq(attendanceRecords.id, existing.id))
    .returning();

  return NextResponse.json(updated);
}
