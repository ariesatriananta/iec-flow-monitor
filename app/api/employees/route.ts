export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { and, desc, eq, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { employees, users } from "@/lib/db/schema";
import { requireAdmin, requireSessionUser } from "@/lib/auth/server";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
  q: z.string().trim().max(100).optional(),
});

const formatZodError = (error: z.ZodError) =>
  error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");

export async function GET(request: Request) {
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  const url = new URL(request.url);
  const parsedQuery = querySchema.safeParse({
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

  const { limit, offset, q } = parsedQuery.data;
  const db = getDb();
  const conditions: SQL[] = [];
  if (auth.user.role !== "ADMIN") {
    conditions.push(eq(employees.userId, auth.user.id));
  }

  const search = q?.trim().toLowerCase();
  if (search) {
    const like = `%${search}%`;
    conditions.push(
      or(
        sql`lower(${employees.employeeCode}) like ${like}`,
        sql`lower(coalesce(${employees.department}, '')) like ${like}`,
        sql`lower(coalesce(${employees.position}, '')) like ${like}`,
        sql`lower(coalesce(${employees.workLocation}, '')) like ${like}`,
        sql`lower(coalesce(${users.name}, '')) like ${like}`,
        sql`lower(coalesce(${users.username}, '')) like ${like}`
      ) as SQL
    );
  }
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const totalResult = whereClause
    ? await db
        .select({ count: sql<string>`count(*)` })
        .from(employees)
        .leftJoin(users, eq(employees.userId, users.id))
        .where(whereClause)
    : await db
        .select({ count: sql<string>`count(*)` })
        .from(employees)
        .leftJoin(users, eq(employees.userId, users.id));
  const total = Number(totalResult[0]?.count ?? 0);

  const rows = whereClause
    ? await db
        .select({ employee: employees, user: users })
        .from(employees)
        .leftJoin(users, eq(employees.userId, users.id))
        .where(whereClause)
        .orderBy(desc(employees.updatedAt))
        .limit(limit)
        .offset(offset)
    : await db
        .select({ employee: employees, user: users })
        .from(employees)
        .leftJoin(users, eq(employees.userId, users.id))
        .orderBy(desc(employees.updatedAt))
        .limit(limit)
        .offset(offset);

  const items = rows.map(({ employee, user }) => ({
    ...employee,
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
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const body = await request.json();

  if (!body?.userId || !body?.employeeCode) {
    return NextResponse.json(
      { error: "userId dan employeeCode wajib diisi" },
      { status: 400 }
    );
  }

  const db = getDb();
  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, body.userId))
    .limit(1);

  if (!owner) {
    return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 });
  }

  const now = new Date();
  const [created] = await db
    .insert(employees)
    .values({
      id: crypto.randomUUID(),
      userId: body.userId,
      employeeCode: body.employeeCode,
      position: body.position ?? null,
      department: body.department ?? null,
      workLocation: body.workLocation ?? null,
      phone: body.phone ?? null,
      email: body.email ?? null,
      isActive: body.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
