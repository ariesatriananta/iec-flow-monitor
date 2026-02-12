export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { and, desc, eq, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { businessTrips, users } from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/server";

const workflowStatusSchema = z.union([
  z.literal("SUBMITTED"),
  z.literal("APPROVED"),
  z.literal("REJECTED"),
  z.literal("CANCELLED"),
]);

const dateStringSchema = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(new Date(value).getTime()), "Format tanggal tidak valid");

const querySchema = z.object({
  status: workflowStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
  q: z.string().trim().max(100).optional(),
});

const createSchema = z.object({
  userId: z.string().trim().min(1).max(128).optional(),
  destinationCity: z.string().trim().min(1).max(100),
  companyName: z.string().trim().min(1).max(150),
  purpose: z.string().trim().max(2000).optional(),
  startDate: dateStringSchema,
  endDate: dateStringSchema,
});

const formatZodError = (error: z.ZodError) =>
  error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");

export async function GET(request: Request) {
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  const url = new URL(request.url);
  const parsedQuery = querySchema.safeParse({
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

  const { status, limit, offset, q } = parsedQuery.data;
  const conditions: SQL[] = [];

  if (auth.user.role !== "ADMIN") {
    conditions.push(eq(businessTrips.userId, auth.user.id));
  }
  if (status) {
    conditions.push(eq(businessTrips.status, status));
  }
  const search = q?.trim().toLowerCase();
  if (search) {
    const like = `%${search}%`;
    conditions.push(
      or(
        sql`lower(coalesce(${users.name}, '')) like ${like}`,
        sql`lower(${businessTrips.destinationCity}) like ${like}`,
        sql`lower(${businessTrips.companyName}) like ${like}`,
        sql`lower(coalesce(${businessTrips.purpose}, '')) like ${like}`,
        sql`lower(${businessTrips.status}) like ${like}`
      ) as SQL
    );
  }

  const db = getDb();
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const totalResult = whereClause
    ? await db
        .select({ count: sql<string>`count(*)` })
        .from(businessTrips)
        .leftJoin(users, eq(businessTrips.userId, users.id))
        .where(whereClause)
    : await db
        .select({ count: sql<string>`count(*)` })
        .from(businessTrips)
        .leftJoin(users, eq(businessTrips.userId, users.id));
  const total = Number(totalResult[0]?.count ?? 0);

  const rows = whereClause
    ? await db
        .select({ trip: businessTrips, user: users })
        .from(businessTrips)
        .leftJoin(users, eq(businessTrips.userId, users.id))
        .where(whereClause)
        .orderBy(desc(businessTrips.createdAt))
        .limit(limit)
        .offset(offset)
    : await db
        .select({ trip: businessTrips, user: users })
        .from(businessTrips)
        .leftJoin(users, eq(businessTrips.userId, users.id))
        .orderBy(desc(businessTrips.createdAt))
        .limit(limit)
        .offset(offset);

  const items = rows.map(({ trip, user }) => ({
    ...trip,
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
  const parsedBody = createSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: `Payload tidak valid: ${formatZodError(parsedBody.error)}` },
      { status: 400 }
    );
  }

  const body = parsedBody.data;
  const startDate = new Date(body.startDate);
  const endDate = new Date(body.endDate);
  if (endDate < startDate) {
    return NextResponse.json(
      { error: "Rentang tanggal perjalanan tidak valid" },
      { status: 400 }
    );
  }

  const targetUserId =
    auth.user.role === "ADMIN" && body.userId ? body.userId : auth.user.id;

  const now = new Date();
  const db = getDb();
  const [created] = await db
    .insert(businessTrips)
    .values({
      id: crypto.randomUUID(),
      userId: targetUserId,
      destinationCity: body.destinationCity,
      companyName: body.companyName,
      purpose: body.purpose ?? null,
      startDate,
      endDate,
      status: "SUBMITTED",
      adminNote: null,
      approvedBy: null,
      approvedAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
