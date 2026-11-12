export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { desc, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/server";
import { recordAuditLog } from "@/lib/audit-log";
import { getDb } from "@/lib/db";
import { opeDocuments } from "@/lib/db/schema";
import { opeErrorResponse } from "@/lib/ope/http";
import { createOpe } from "@/lib/ope/service";
import { OpeError, opeInputSchema } from "@/lib/ope/validation";
import { opeQuerySchema, opeListWhere } from "@/lib/ope/query";

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  try {
    const params = opeQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const where = opeListWhere(params);
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
