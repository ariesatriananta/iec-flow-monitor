export const dynamic = "force-dynamic"

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { invoices } from "@/lib/db/schema";

export async function GET(request: Request) {
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
      status: body.status,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
