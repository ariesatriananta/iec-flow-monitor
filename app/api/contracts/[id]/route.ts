export const dynamic = "force-dynamic"

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { clients, contracts, termins } from "@/lib/db/schema";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const db = getDb();
  const [row] = await db
    .select({ contract: contracts, client: clients })
    .from(contracts)
    .leftJoin(clients, eq(contracts.clientId, clients.id))
    .where(eq(contracts.id, params.id))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Contract tidak ditemukan" }, { status: 404 });
  }

  const contractTermins = await db
    .select()
    .from(termins)
    .where(eq(termins.contractId, params.id));

  return NextResponse.json({
    ...row.contract,
    client: row.client ?? undefined,
    termins: contractTermins,
  });
}

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
  const updateData: {
    contractTitle?: string | null;
    contractValue?: string;
    paymentStatus?: string;
    status?: string;
    notes?: string | null;
    updatedAt: Date;
  } = {
    updatedAt: new Date(),
  };

  if (body.contractTitle !== undefined) {
    updateData.contractTitle = body.contractTitle ?? null;
  }
  if (body.contractValue !== undefined) {
    updateData.contractValue = body.contractValue.toString();
  }
  if (body.paymentStatus !== undefined) {
    updateData.paymentStatus = body.paymentStatus;
  }
  if (body.status !== undefined) {
    updateData.status = body.status;
  }
  if (body.notes !== undefined) {
    updateData.notes = body.notes ?? null;
  }

  const [updated] = await db
    .update(contracts)
    .set(updateData)
    .where(eq(contracts.id, params.id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Contract tidak ditemukan" }, { status: 404 });
  }

  return NextResponse.json(updated);
}
