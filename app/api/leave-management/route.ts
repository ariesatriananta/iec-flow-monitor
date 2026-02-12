export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { and, eq, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { leaveRequests, users } from "@/lib/db/schema";
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
  leaveType: z.string().trim().min(1).max(50),
  reason: z.string().trim().min(1).max(2000),
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
    conditions.push(eq(leaveRequests.userId, auth.user.id));
  }
  if (status) {
    conditions.push(eq(leaveRequests.status, status));
  }

  const db = getDb();
  const baseQuery = db
    .select({ request: leaveRequests, user: users })
    .from(leaveRequests)
    .leftJoin(users, eq(leaveRequests.userId, users.id));
  const rows =
    conditions.length > 0
      ? await baseQuery.where(and(...conditions))
      : await baseQuery;

  return NextResponse.json(
    rows.map(({ request, user }) => ({
      ...request,
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
      { error: "Rentang tanggal cuti tidak valid" },
      { status: 400 }
    );
  }

  const targetUserId =
    auth.user.role === "ADMIN" && body.userId ? body.userId : auth.user.id;

  const now = new Date();
  const db = getDb();
  const [created] = await db
    .insert(leaveRequests)
    .values({
      id: crypto.randomUUID(),
      userId: targetUserId,
      leaveType: body.leaveType,
      reason: body.reason,
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

