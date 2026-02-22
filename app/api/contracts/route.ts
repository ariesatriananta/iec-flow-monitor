export const dynamic = "force-dynamic"

import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { clients, contracts, settings } from "@/lib/db/schema";
import { generateProposalNumber } from "@/lib/numbering";
import { requireAdmin } from "@/lib/auth/server";

export async function GET() {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

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
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const body = await request.json();

  if (
    !body?.clientId ||
    !body?.proposalDate ||
    !body?.serviceCode ||
    body?.seqNo === undefined ||
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
  const [settingsRow] = await db
    .select({ numberingPrefix: settings.numberingPrefix })
    .from(settings)
    .limit(1);
  const [{ maxEngagement }] = await db
    .select({ maxEngagement: sql<number>`coalesce(max(${contracts.engagementNo}), 0)` })
    .from(contracts)
    .where(and(eq(contracts.clientId, body.clientId), eq(contracts.serviceCode, body.serviceCode)));
  const engagementNo = Number(maxEngagement ?? 0) + 1;
  const proposalNumber = generateProposalNumber({
    seqNo: Number(body.seqNo),
    serviceCode: body.serviceCode,
    engagementNo,
    proposalDate: new Date(body.proposalDate),
    numberingPrefix: settingsRow?.numberingPrefix,
  });

  const [created] = await db
    .insert(contracts)
    .values({
      id: crypto.randomUUID(),
      proposalDate: new Date(body.proposalDate),
      clientId: body.clientId,
      serviceCode: body.serviceCode,
      engagementNo,
      seqNo: Number(body.seqNo),
      proposalNumber,
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
