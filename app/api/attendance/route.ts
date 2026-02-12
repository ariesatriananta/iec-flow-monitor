export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { and, eq, gte, lte, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { attendanceRecords, users } from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/server";
import { getJakartaDayStart, getJakartaParts } from "@/lib/hr/time";

const dateStringSchema = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(new Date(value).getTime()), "Format tanggal tidak valid");

const querySchema = z.object({
  userId: z.string().trim().min(1).max(128).optional(),
  from: dateStringSchema.optional(),
  to: dateStringSchema.optional(),
});

const actionSchema = z.object({
  action: z.union([z.literal("CHECK_IN"), z.literal("CHECK_OUT")]),
  location: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(1000).optional(),
  userId: z.string().trim().min(1).max(128).optional(),
});

const formatZodError = (error: z.ZodError) =>
  error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");

export async function GET(request: Request) {
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  const url = new URL(request.url);
  const parsedQuery = querySchema.safeParse({
    userId: url.searchParams.get("userId") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });
  if (!parsedQuery.success) {
    return NextResponse.json(
      { error: `Query tidak valid: ${formatZodError(parsedQuery.error)}` },
      { status: 400 }
    );
  }

  const { userId, from, to } = parsedQuery.data;
  const targetUserId = auth.user.role === "ADMIN" ? userId : auth.user.id;

  const conditions: SQL[] = [];
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

  const rawBody = await request.json().catch(() => null);
  const parsedBody = actionSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: `Payload tidak valid: ${formatZodError(parsedBody.error)}` },
      { status: 400 }
    );
  }

  const body = parsedBody.data;
  const action = body.action;
  const targetUserId =
    auth.user.role === "ADMIN" && body.userId ? body.userId : auth.user.id;

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
          checkInLocation: body.location ?? existing.checkInLocation,
          notes: body.notes ?? existing.notes,
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
        checkInLocation: body.location ?? null,
        checkOutAt: null,
        checkOutLocation: null,
        status: "PRESENT",
        notes: body.notes ?? null,
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
      checkOutLocation: body.location ?? null,
      notes: body.notes ?? existing.notes,
      updatedAt: now,
    })
    .where(eq(attendanceRecords.id, existing.id))
    .returning();

  return NextResponse.json(updated);
}

