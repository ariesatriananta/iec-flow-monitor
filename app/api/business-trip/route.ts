export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { and, eq, type SQL } from "drizzle-orm";
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
  });
  if (!parsedQuery.success) {
    return NextResponse.json(
      { error: `Query tidak valid: ${formatZodError(parsedQuery.error)}` },
      { status: 400 }
    );
  }

  const { status } = parsedQuery.data;
  const conditions: SQL[] = [];

  if (auth.user.role !== "ADMIN") {
    conditions.push(eq(businessTrips.userId, auth.user.id));
  }
  if (status) {
    conditions.push(eq(businessTrips.status, status));
  }

  const db = getDb();
  const baseQuery = db
    .select({ trip: businessTrips, user: users })
    .from(businessTrips)
    .leftJoin(users, eq(businessTrips.userId, users.id));
  const rows =
    conditions.length > 0
      ? await baseQuery.where(and(...conditions))
      : await baseQuery;

  return NextResponse.json(
    rows.map(({ trip, user }) => ({
      ...trip,
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

