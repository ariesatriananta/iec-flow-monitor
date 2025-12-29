export const dynamic = "force-dynamic"

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { termins } from "@/lib/db/schema";

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
    .update(termins)
    .set({
      terminName: body.terminName ?? undefined,
      terminAmount:
        body.terminAmount !== undefined ? body.terminAmount.toString() : undefined,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      invoiceId: body.invoiceId ?? undefined,
      paymentReceivedDate: body.paymentReceivedDate
        ? new Date(body.paymentReceivedDate)
        : undefined,
      status: body.status ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(termins.id, params.id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Termin tidak ditemukan" }, { status: 404 });
  }

  return NextResponse.json(updated);
}
