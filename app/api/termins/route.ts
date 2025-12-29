export const dynamic = "force-dynamic"

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { termins } from "@/lib/db/schema";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const contractId = searchParams.get("contractId");

  if (!contractId) {
    return NextResponse.json(
      { error: "contractId wajib diisi" },
      { status: 400 }
    );
  }

  const db = getDb();
  const data = await db.select().from(termins).where(eq(termins.contractId, contractId));
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const body = await request.json();

  if (!body?.contractId || !body?.terminName || body?.terminAmount === undefined) {
    return NextResponse.json(
      { error: "Data termin belum lengkap" },
      { status: 400 }
    );
  }

  const now = new Date();
  const db = getDb();
  const [created] = await db
    .insert(termins)
    .values({
      id: crypto.randomUUID(),
      contractId: body.contractId,
      terminName: body.terminName,
      terminAmount: body.terminAmount.toString(),
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      invoiceId: body.invoiceId ?? null,
      paymentReceivedDate: body.paymentReceivedDate
        ? new Date(body.paymentReceivedDate)
        : null,
      status: body.status ?? "PENDING",
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
