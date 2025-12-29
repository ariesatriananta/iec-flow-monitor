export const dynamic = "force-dynamic"

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { clients, contracts } from "@/lib/db/schema";

export async function GET() {
  const db = getDb();
  const rows = await db
    .select({ contract: contracts, client: clients })
    .from(contracts)
    .leftJoin(clients, eq(contracts.clientId, clients.id));

  const data = rows.map(({ contract, client }) => ({
    ...contract,
    client: client ?? undefined,
  }));

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const body = await request.json();

  if (
    !body?.clientId ||
    !body?.proposalDate ||
    !body?.serviceCode ||
    body?.engagementNo === undefined ||
    body?.seqNo === undefined ||
    !body?.proposalNumber ||
    body?.contractValue === undefined ||
    !body?.paymentStatus ||
    !body?.status
  ) {
    return NextResponse.json(
      { error: "Data contract belum lengkap" },
      { status: 400 }
    );
  }

  const now = new Date();
  const db = getDb();
  const [created] = await db
    .insert(contracts)
    .values({
      id: crypto.randomUUID(),
      proposalDate: new Date(body.proposalDate),
      clientId: body.clientId,
      serviceCode: body.serviceCode,
      engagementNo: Number(body.engagementNo),
      seqNo: Number(body.seqNo),
      proposalNumber: body.proposalNumber,
      contractTitle: body.contractTitle ?? null,
      contractValue: body.contractValue.toString(),
      paymentStatus: body.paymentStatus,
      status: body.status,
      notes: body.notes ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
