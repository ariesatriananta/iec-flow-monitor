export const dynamic = "force-dynamic"

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { invoices } from "@/lib/db/schema";

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body = await request.json();

  if (!body) {
    return NextResponse.json(
      { error: "Data update tidak boleh kosong" },
      { status: 400 }
    );
  }

  const db = getDb();
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

  return NextResponse.json(updated);
}
