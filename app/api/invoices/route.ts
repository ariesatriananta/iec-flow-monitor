export const dynamic = "force-dynamic"

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { contracts, invoices, termins } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/server";
import { recordAuditLog } from "@/lib/audit-log";
import { allocateDocumentNumber } from "@/lib/document-numbering";

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const { searchParams } = new URL(request.url);
  const contractId = searchParams.get("contractId");

  if (contractId) {
    const db = getDb();
    const data = await db
      .select()
      .from(invoices)
      .where(eq(invoices.contractId, contractId));
    return NextResponse.json(data);
  }

  const db = getDb();
  const data = await db.select().from(invoices);
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const body = await request.json();

  if (
    !body?.contractId ||
    !body?.terminId ||
    !body?.invoiceDate ||
    body?.amount === undefined ||
    !body?.status
  ) {
    return NextResponse.json(
      { error: "Data invoice belum lengkap" },
      { status: 400 }
    );
  }

  const now = new Date();
  const invoiceDate = new Date(body.invoiceDate);
  if (!Number.isFinite(invoiceDate.getTime())) {
    return NextResponse.json({ error: "Tanggal invoice tidak valid" }, { status: 400 });
  }
  const db = getDb();
  const created = await db.transaction(async (tx) => {
    // Match the Termin route's lock order before allocating a shared number.
    await tx.select({ id: termins.id }).from(termins)
      .where(eq(termins.id, body.terminId)).for("update").limit(1);
    await tx.select({ id: contracts.id }).from(contracts)
      .where(eq(contracts.id, body.contractId)).for("update").limit(1);
    const { seqNo, documentNumber } = await allocateDocumentNumber(tx, invoiceDate);
    const [row] = await tx
    .insert(invoices)
    .values({
      id: crypto.randomUUID(),
      invoiceDate,
      contractId: body.contractId,
      terminId: body.terminId,
      seqNo,
      invoiceNumber: documentNumber,
      amount: body.amount.toString(),
      pph23Rate: body.usePph23 === false ? null : "2.00",
      status: body.status,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
    return row;
  });

  await recordAuditLog({
    module: "INVOICE",
    entityId: created.id,
    action: "CREATE",
    actor: auth.user,
    details: {
      invoiceNumber: created.invoiceNumber,
      contractId: created.contractId,
      terminId: created.terminId,
      status: created.status,
      pph23Enabled: created.pph23Rate !== null,
    },
  });

  return NextResponse.json(created, { status: 201 });
}
