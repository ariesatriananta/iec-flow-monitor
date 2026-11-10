export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/server";
import { recordAuditLog } from "@/lib/audit-log";
import { getDb } from "@/lib/db";
import { opeDocuments } from "@/lib/db/schema";
import { opeErrorResponse } from "@/lib/ope/http";
import { createOpe } from "@/lib/ope/service";
import { OPE_STATUSES, OPE_TYPES, OpeError, opeInputSchema } from "@/lib/ope/validation";

const querySchema = z.object({
  type: z.enum(OPE_TYPES).optional(),
  status: z.enum(OPE_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(2_147_483_647).default(0),
});

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  try {
    const params = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const where = and(
      params.type ? eq(opeDocuments.type, params.type) : undefined,
      params.status ? eq(opeDocuments.status, params.status) : undefined,
    );
    const db = getDb();
    const [items, [count]] = await Promise.all([
      db.select().from(opeDocuments).where(where).orderBy(desc(opeDocuments.createdAt), desc(opeDocuments.id))
        .limit(params.limit).offset(params.offset),
      db.select({ total: sql<number>`count(*)::int` }).from(opeDocuments).where(where),
    ]);
    return NextResponse.json({ items, total: count.total, limit: params.limit, offset: params.offset });
  } catch (error) { return opeErrorResponse(error); }
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  try {
    const body = await request.json();
    if (body?.status !== undefined && body.status !== "DRAFT") throw new OpeError("Dokumen baru harus berstatus DRAFT");
    const created = await createOpe(opeInputSchema.parse(body));
    await recordAuditLog({
      module: "OPE", entityId: created.id, action: "CREATE", actor: auth.user,
      details: { documentNumber: created.documentNumber, type: created.type, status: created.status, total: created.total },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) { return opeErrorResponse(error); }
}
