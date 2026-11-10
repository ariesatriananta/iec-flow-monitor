export const dynamic = "force-dynamic"

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { invoices } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/server";
import { recordAuditLog } from "@/lib/audit-log";

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
    body?.seqNo === undefined ||
    !body?.invoiceNumber ||
    body?.amount === undefined ||
    !body?.status
  ) {
    return NextResponse.json(
      { error: "Data invoice belum lengkap" },
      { status: 400 }
    );
  }

  const now = new Date();
  const db = getDb();
  const [created] = await db
    .insert(invoices)
    .values({
      id: crypto.randomUUID(),
      invoiceDate: new Date(body.invoiceDate),
      contractId: body.contractId,
      terminId: body.terminId,
      seqNo: Number(body.seqNo),
      invoiceNumber: body.invoiceNumber,
      amount: body.amount.toString(),
      pph23Rate: body.usePph23 === false ? null : "2.00",
      status: body.status,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

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
