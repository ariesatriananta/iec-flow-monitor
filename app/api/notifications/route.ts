export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { notifications } from "@/lib/db/schema";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
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
  });
  if (!parsedQuery.success) {
    return NextResponse.json(
      { error: `Query tidak valid: ${formatZodError(parsedQuery.error)}` },
      { status: 400 }
    );
  }

  const { limit, offset } = parsedQuery.data;
  const db = getDb();

  const [totalRow, unreadRow, rows] = await Promise.all([
    db
      .select({ count: sql<string>`count(*)` })
      .from(notifications)
      .where(eq(notifications.userId, auth.user.id))
      .then((items) => items[0]),
    db
      .select({ count: sql<string>`count(*)` })
      .from(notifications)
      .where(and(eq(notifications.userId, auth.user.id), eq(notifications.isRead, false)))
      .then((items) => items[0]),
    db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, auth.user.id))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset),
  ]);

  const total = Number(totalRow?.count ?? 0);
  const unreadCount = Number(unreadRow?.count ?? 0);
  const hasMore = offset + rows.length < total;

  return NextResponse.json({
    items: rows,
    unreadCount,
    total,
    limit,
    offset,
    hasMore,
    nextOffset: hasMore ? offset + rows.length : null,
  });
}

export async function PATCH() {
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  const db = getDb();
  const now = new Date();
  await db
    .update(notifications)
    .set({
      isRead: true,
      readAt: now,
    })
    .where(and(eq(notifications.userId, auth.user.id), eq(notifications.isRead, false)));

  return NextResponse.json({ ok: true });
}
