export const dynamic = "force-dynamic"

import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { contracts, termins } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/server";

async function updateContractPaymentStatus(db: ReturnType<typeof getDb>, contractId: string) {
  const [contract] = await db
    .select({ contractValue: contracts.contractValue })
    .from(contracts)
    .where(eq(contracts.id, contractId))
    .limit(1);

  if (!contract) return;

  const [paid] = await db
    .select({
      totalPaid: sql<string>`coalesce(sum(${termins.terminAmount}), 0)`,
    })
    .from(termins)
    .where(and(eq(termins.contractId, contractId), eq(termins.status, "PAID")));

  const totalPaid = Number(paid?.totalPaid ?? 0);
  const contractValue = Number(contract.contractValue ?? 0);

  let paymentStatus: "UNPAID" | "PARTIAL" | "PAID" = "UNPAID";
  if (totalPaid > 0 && totalPaid < contractValue) {
    paymentStatus = "PARTIAL";
  } else if (totalPaid >= contractValue && contractValue > 0) {
    paymentStatus = "PAID";
  }

  await db
    .update(contracts)
    .set({ paymentStatus, updatedAt: new Date() })
    .where(eq(contracts.id, contractId));
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

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
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const body = await request.json();

  if (!body?.contractId || !body?.terminName || body?.terminAmount === undefined) {
    return NextResponse.json(
      { error: "Data termin belum lengkap" },
      { status: 400 }
    );
  }

  const now = new Date();
  const db = getDb();
  const [contractRow] = await db
    .select({ contractValue: contracts.contractValue })
    .from(contracts)
    .where(eq(contracts.id, body.contractId))
    .limit(1);

  if (!contractRow) {
    return NextResponse.json(
      { error: "Contract tidak ditemukan" },
      { status: 404 }
    );
  }

  const [terminSum] = await db
    .select({
      total: sql<string>`coalesce(sum(${termins.terminAmount}), 0)`,
    })
    .from(termins)
    .where(eq(termins.contractId, body.contractId));

  const contractValue = Number(contractRow.contractValue ?? 0);
  const existingTotal = Number(terminSum?.total ?? 0);
  const requestedAmount = Number(body.terminAmount ?? 0);
  const remaining = contractValue - existingTotal;

  if (contractValue > 0 && existingTotal >= contractValue) {
    return NextResponse.json(
      { error: "Nilai kontrak sudah terpenuhi, tidak bisa tambah termin lagi" },
      { status: 400 }
    );
  }

  if (contractValue > 0 && requestedAmount > remaining) {
    return NextResponse.json(
      { error: "Nominal termin melebihi sisa nilai kontrak" },
      { status: 400 }
    );
  }

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

  await updateContractPaymentStatus(db, created.contractId);

  return NextResponse.json(created, { status: 201 });
}
