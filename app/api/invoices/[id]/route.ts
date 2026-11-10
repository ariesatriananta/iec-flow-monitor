export const dynamic = "force-dynamic"

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { invoices } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/server";
import { recordAuditLog } from "@/lib/audit-log";

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const body = await request.json();

  if (!body) {
    return NextResponse.json(
      { error: "Data update tidak boleh kosong" },
      { status: 400 }
    );
  }

  const db = getDb();
  const [beforeUpdate] = await db
    .select({ status: invoices.status })
    .from(invoices)
    .where(eq(invoices.id, params.id))
    .limit(1);
  const [updated] = await db
    .update(invoices)
    .set({
      invoiceDate: body.invoiceDate ? new Date(body.invoiceDate) : undefined,
      seqNo: body.seqNo !== undefined ? Number(body.seqNo) : undefined,
      invoiceNumber: body.invoiceNumber ?? undefined,
      amount: body.amount !== undefined ? body.amount.toString() : undefined,
      status: body.status ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, params.id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Invoice tidak ditemukan" }, { status: 404 });
  }

  const statusChanged =
    body.status !== undefined && body.status !== beforeUpdate?.status;
  await recordAuditLog({
    module: "INVOICE",
    entityId: updated.id,
    action: statusChanged ? "STATUS_CHANGED" : "UPDATE",
    actor: auth.user,
    details: {
      invoiceNumber: updated.invoiceNumber,
      ...(statusChanged
        ? { fromStatus: beforeUpdate?.status ?? null, toStatus: updated.status }
        : {}),
    },
  });

  return NextResponse.json(updated);
}
