export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const { searchParams } = new URL(request.url);
  const requestedLimit = Number(searchParams.get("limit") ?? 50);
  const requestedPage = Number(searchParams.get("page") ?? 1);
  const limit = Number.isInteger(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 100)
    : 50;
  const page = Number.isInteger(requestedPage) && requestedPage > 0
    ? requestedPage
    : 1;
  const moduleFilter = searchParams.get("module")?.trim().toUpperCase();
  const actionFilter = searchParams.get("action")?.trim().toUpperCase();
  const filters = [
    moduleFilter ? eq(auditLogs.module, moduleFilter) : undefined,
    actionFilter ? eq(auditLogs.action, actionFilter) : undefined,
  ].filter((filter): filter is NonNullable<typeof filter> => Boolean(filter));
  const where = filters.length > 0 ? and(...filters) : undefined;

  const db = getDb();
  const [rows, [countRow]] = await Promise.all([
    db
      .select()
      .from(auditLogs)
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset((page - 1) * limit),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(where),
  ]);

  return NextResponse.json({
    data: rows,
    pagination: {
      page,
      limit,
      total: countRow?.total ?? 0,
    },
  });
}
