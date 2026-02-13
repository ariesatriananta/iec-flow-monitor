export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { and, desc, eq, gte, lte, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { attendanceRecords, employees, users } from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/server";
import { getJakartaDayStart, getJakartaParts } from "@/lib/hr/time";

const dateStringSchema = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(new Date(value).getTime()), "Format tanggal tidak valid");

const querySchema = z.object({
  employeeId: z.string().trim().min(1).max(128).optional(),
  from: dateStringSchema.optional(),
  to: dateStringSchema.optional(),
  status: z.enum(["PRESENT", "SICK", "LEAVE", "ABSENT"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
  q: z.string().trim().max(100).optional(),
});

const actionSchema = z.object({
  action: z.union([z.literal("CHECK_IN"), z.literal("CHECK_OUT")]),
  location: z.string().trim().min(1).max(500),
  notes: z.string().trim().max(1000).optional(),
});

const formatZodError = (error: z.ZodError) =>
  error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");

const toJakartaBoundary = (value: string, boundary: "start" | "end") => {
  const base = value.trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(base)) {
    return new Date(
      boundary === "start"
        ? `${base}T00:00:00+07:00`
        : `${base}T23:59:59.999+07:00`
    );
  }
  return new Date(value);
};

const parseGeoLocationPayload = (raw: string) => {
  try {
    const parsed = JSON.parse(raw) as {
      lat?: number;
      lng?: number;
      accuracy?: number;
      timestamp?: string;
    };
    const lat = Number(parsed.lat);
    const lng = Number(parsed.lng);
    const accuracy =
      parsed.accuracy === undefined ? undefined : Number(parsed.accuracy);
    const timestamp = parsed.timestamp;

    if (!Number.isFinite(lat) || lat < -90 || lat > 90) return null;
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) return null;
    if (
      accuracy !== undefined &&
      (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100000)
    ) {
      return null;
    }
    if (timestamp !== undefined && Number.isNaN(new Date(timestamp).getTime())) {
      return null;
    }

    return {
      lat,
      lng,
      accuracy,
      timestamp: timestamp ?? null,
    };
  } catch {
    return null;
  }
};

export async function GET(request: Request) {
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  const url = new URL(request.url);
  const parsedQuery = querySchema.safeParse({
    employeeId: url.searchParams.get("employeeId") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
  });
  if (!parsedQuery.success) {
    return NextResponse.json(
      { error: `Query tidak valid: ${formatZodError(parsedQuery.error)}` },
      { status: 400 }
    );
  }

  const { employeeId, from, to, status, limit, offset, q } = parsedQuery.data;
  const targetEmployeeId =
    auth.user.role === "ADMIN" ? employeeId : auth.user.employeeId;

  if (auth.user.role !== "ADMIN" && !targetEmployeeId) {
    return NextResponse.json(
      { error: "Akun belum terhubung ke employee" },
      { status: 403 }
    );
  }

  const conditions: SQL[] = [];
  if (targetEmployeeId) conditions.push(eq(attendanceRecords.employeeId, targetEmployeeId));
  if (from) {
    conditions.push(
      gte(attendanceRecords.attendanceDate, toJakartaBoundary(from, "start"))
    );
  }
  if (to) {
    conditions.push(
      lte(attendanceRecords.attendanceDate, toJakartaBoundary(to, "end"))
    );
  }
  if (status) conditions.push(eq(attendanceRecords.status, status));

  const search = q?.trim().toLowerCase();
  if (search) {
    const like = `%${search}%`;
    conditions.push(
      or(
        sql`lower(coalesce(${employees.fullName}, '')) like ${like}`,
        sql`lower(coalesce(${users.name}, '')) like ${like}`,
        sql`lower(coalesce(${attendanceRecords.checkInLocation}, '')) like ${like}`,
        sql`lower(coalesce(${attendanceRecords.checkOutLocation}, '')) like ${like}`,
        sql`lower(${attendanceRecords.status}) like ${like}`
      ) as SQL
    );
  }

  const db = getDb();
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const totalResult = whereClause
      ? await db
          .select({ count: sql<string>`count(*)` })
          .from(attendanceRecords)
          .leftJoin(employees, eq(attendanceRecords.employeeId, employees.id))
          .leftJoin(users, eq(users.employeeId, employees.id))
          .where(whereClause)
      : await db
          .select({ count: sql<string>`count(*)` })
          .from(attendanceRecords)
          .leftJoin(employees, eq(attendanceRecords.employeeId, employees.id))
          .leftJoin(users, eq(users.employeeId, employees.id));
  const total = Number(totalResult[0]?.count ?? 0);

  const rows = whereClause
    ? await db
        .select({ attendance: attendanceRecords, employee: employees, user: users })
        .from(attendanceRecords)
        .leftJoin(employees, eq(attendanceRecords.employeeId, employees.id))
        .leftJoin(users, eq(users.employeeId, employees.id))
        .where(whereClause)
        .orderBy(desc(attendanceRecords.attendanceDate), desc(attendanceRecords.updatedAt))
        .limit(limit)
        .offset(offset)
    : await db
        .select({ attendance: attendanceRecords, employee: employees, user: users })
        .from(attendanceRecords)
        .leftJoin(employees, eq(attendanceRecords.employeeId, employees.id))
        .leftJoin(users, eq(users.employeeId, employees.id))
        .orderBy(desc(attendanceRecords.attendanceDate), desc(attendanceRecords.updatedAt))
        .limit(limit)
        .offset(offset);

  const items = rows.map(({ attendance, employee, user }) => ({
    ...attendance,
    employee: employee
      ? {
          id: employee.id,
          employeeCode: employee.employeeCode,
          fullName: employee.fullName,
          nip: employee.nip,
          title: employee.title,
          department: employee.department,
          email: employee.email,
          workLocation: employee.workLocation,
        }
      : undefined,
    user: user
      ? {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role,
        }
      : undefined,
  }));
  const hasMore = offset + items.length < total;

  return NextResponse.json(
    {
      items,
      total,
      limit,
      offset,
      hasMore,
      nextOffset: hasMore ? offset + items.length : null,
    }
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
  const geoLocation = parseGeoLocationPayload(body.location);
  if (!geoLocation) {
    return NextResponse.json(
      { error: "Payload geolocation tidak valid" },
      { status: 400 }
    );
  }
  const targetEmployeeId = auth.user.employeeId;

  if (!targetEmployeeId) {
    return NextResponse.json(
      { error: "Akun belum terhubung ke employee" },
      { status: 403 }
    );
  }

  const now = new Date();
  const dayStart = getJakartaDayStart(now);
  const jakarta = getJakartaParts(now);

  const db = getDb();
  const [employee] = await db
    .select({ id: employees.id, isActive: employees.isActive })
    .from(employees)
    .where(eq(employees.id, targetEmployeeId))
    .limit(1);

  if (!employee) {
    return NextResponse.json(
      { error: "Data employee tidak ditemukan" },
      { status: 404 }
    );
  }

  if (!employee.isActive) {
    return NextResponse.json(
      { error: "Employee nonaktif tidak dapat melakukan absensi" },
      { status: 403 }
    );
  }

  const [existing] = await db
    .select()
    .from(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.employeeId, targetEmployeeId),
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
          checkInLocation: JSON.stringify(geoLocation),
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
        employeeId: targetEmployeeId,
        attendanceDate: dayStart,
        checkInAt: now,
        checkInLocation: JSON.stringify(geoLocation),
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
      checkOutLocation: JSON.stringify(geoLocation),
      notes: body.notes ?? existing.notes,
      updatedAt: now,
    })
    .where(eq(attendanceRecords.id, existing.id))
    .returning();

  return NextResponse.json(updated);
}
