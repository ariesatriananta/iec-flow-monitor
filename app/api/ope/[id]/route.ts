export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/server";
import { recordAuditLog } from "@/lib/audit-log";
import { getDb } from "@/lib/db";
import { opeDocuments, opeItems } from "@/lib/db/schema";
import { opeErrorResponse } from "@/lib/ope/http";
import { updateOpe } from "@/lib/ope/service";
import { OPE_STATUSES, OpeError, opeInputSchema } from "@/lib/ope/validation";

type Context = { params: { id: string } };

export async function GET(_request: Request, { params }: Context) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  try {
    const db = getDb();
    // One transaction provides a consistent header/detail snapshot during draft edits.
    const result = await db.transaction(async (tx) => {
      const [document] = await tx.select().from(opeDocuments).where(eq(opeDocuments.id, params.id)).limit(1);
      if (!document) throw new OpeError("Dokumen OPE tidak ditemukan", 404);
      const items = await tx.select().from(opeItems).where(eq(opeItems.documentId, params.id)).orderBy(asc(opeItems.position));
      return { ...document, items };
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
    return NextResponse.json(result);
  } catch (error) { return opeErrorResponse(error); }
}

export async function PUT(request: Request, { params }: Context) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  try {
    const body = await request.json();
    const input = body && typeof body === "object" && "status" in body
      ? z.object({ status: z.enum(OPE_STATUSES) }).strict().parse(body)
      : opeInputSchema.parse(body);
    const result = await updateOpe(params.id, input);
    await recordAuditLog({
      module: "OPE", entityId: result.document.id, action: result.action, actor: auth.user,
      details: {
        documentNumber: result.document.documentNumber, type: result.document.type,
        fromStatus: result.previousStatus, status: result.document.status, total: result.document.total,
      },
    });
    return NextResponse.json(result.document);
  } catch (error) { return opeErrorResponse(error); }
}
