export const dynamic = "force-dynamic"

import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { contracts, termins } from "@/lib/db/schema";
import { clients, invoices } from "@/lib/db/schema";
import { generateInvoiceNumber, getJakartaMonthYear } from "@/lib/numbering";

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

  let finalTermin = updated;
  const prevInvoiceId = updated.invoiceId;
  if (body?.status === "INVOICED" && !updated.invoiceId) {
    const [contractRow] = await db
      .select({
        contractId: contracts.id,
        clientId: contracts.clientId,
        clientCode: clients.code,
      })
      .from(contracts)
      .innerJoin(clients, eq(contracts.clientId, clients.id))
      .where(eq(contracts.id, updated.contractId))
      .limit(1);

    if (contractRow) {
      const invoiceDate = new Date();
      const { year } = getJakartaMonthYear(invoiceDate);
      const existingInvoices = await db
        .select({ invoiceDate: invoices.invoiceDate, seqNo: invoices.seqNo })
        .from(invoices)
        .innerJoin(contracts, eq(invoices.contractId, contracts.id))
        .where(eq(contracts.clientId, contractRow.clientId));

      const sameYearInvoices = existingInvoices.filter((invoice) => {
        const invoiceMonthYear = getJakartaMonthYear(new Date(invoice.invoiceDate));
        return invoiceMonthYear.year === year;
      });
      const maxSeq = sameYearInvoices.reduce(
        (acc, invoice) => Math.max(acc, invoice.seqNo ?? 0),
        0
      );
      const seqNo = maxSeq + 1;
      const invoiceNumber = generateInvoiceNumber({
        seqNo,
        clientCode: contractRow.clientCode,
        invoiceDate,
      });

      const [createdInvoice] = await db
        .insert(invoices)
        .values({
          id: crypto.randomUUID(),
          invoiceDate,
          contractId: contractRow.contractId,
          terminId: updated.id,
          seqNo,
          invoiceNumber,
          amount: updated.terminAmount.toString(),
          status: "ISSUED",
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      if (createdInvoice) {
        const [terminWithInvoice] = await db
          .update(termins)
          .set({ invoiceId: createdInvoice.id, updatedAt: new Date() })
          .where(eq(termins.id, updated.id))
          .returning();

        if (terminWithInvoice) {
          finalTermin = terminWithInvoice;
        }
      }
    }
  }

  if (body?.status === "PAID" && finalTermin.invoiceId) {
    await db
      .update(invoices)
      .set({ status: "PAID", updatedAt: new Date() })
      .where(eq(invoices.id, finalTermin.invoiceId));
  }
  if (body?.status === "INVOICED" && finalTermin.invoiceId) {
    await db
      .update(invoices)
      .set({ status: "ISSUED", updatedAt: new Date() })
      .where(eq(invoices.id, finalTermin.invoiceId));
  }
  if (body?.status === "PENDING" && prevInvoiceId) {
    await db.delete(invoices).where(eq(invoices.id, prevInvoiceId));
    const [cleared] = await db
      .update(termins)
      .set({ invoiceId: null, updatedAt: new Date() })
      .where(eq(termins.id, updated.id))
      .returning();
    if (cleared) {
      finalTermin = cleared;
    }
  }

  await updateContractPaymentStatus(db, updated.contractId);

  return NextResponse.json(finalTermin);
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const db = getDb();
  const [existing] = await db
    .select({ contractId: termins.contractId })
    .from(termins)
    .where(eq(termins.id, params.id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Termin tidak ditemukan" }, { status: 404 });
  }

  const [deleted] = await db
    .delete(termins)
    .where(eq(termins.id, params.id))
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: "Termin tidak ditemukan" }, { status: 404 });
  }

  await updateContractPaymentStatus(db, existing.contractId);

  return NextResponse.json({ ok: true });
}
