export const dynamic = "force-dynamic"

import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { contracts, termins } from "@/lib/db/schema";
import { invoices } from "@/lib/db/schema";
import { generateInvoiceNumber, getJakartaMonthYear } from "@/lib/numbering";
import { requireAdmin } from "@/lib/auth/server";
import { recordAuditLog } from "@/lib/audit-log";

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
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const body = await request.json();

  if (!body) {
    return NextResponse.json(
      { error: "Data update tidak boleh kosong" },
      { status: 400 }
    );
  }

  const db = getDb();
  const [beforeUpdate] = await db
    .select({
      status: termins.status,
      invoiceId: termins.invoiceId,
    })
    .from(termins)
    .where(eq(termins.id, params.id))
    .limit(1);
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
  let createdInvoiceId: string | null = null;
  let invoiceStatusTransition: {
    id: string;
    fromStatus: string;
    toStatus: string;
  } | null = null;
  if (body?.status === "INVOICED" && !updated.invoiceId) {
    const [contractRow] = await db
      .select({
        contractId: contracts.id,
      })
      .from(contracts)
      .where(eq(contracts.id, updated.contractId))
      .limit(1);

    if (contractRow) {
      const invoiceDate = updated.dueDate ? new Date(updated.dueDate) : new Date();
      const { year } = getJakartaMonthYear(invoiceDate);
      const existingInvoices = await db
        .select({ invoiceDate: invoices.invoiceDate, seqNo: invoices.seqNo })
        .from(invoices);

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
          pph23Rate: body.usePph23 === false ? null : "2.00",
          status: "ISSUED",
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      if (createdInvoice) {
        createdInvoiceId = createdInvoice.id;
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
    const [beforeInvoice] = await db
      .select({ status: invoices.status })
      .from(invoices)
      .where(eq(invoices.id, finalTermin.invoiceId))
      .limit(1);
    const [afterInvoice] = await db
      .update(invoices)
      .set({ status: "PAID", updatedAt: new Date() })
      .where(eq(invoices.id, finalTermin.invoiceId))
      .returning({ id: invoices.id, status: invoices.status });
    if (beforeInvoice && afterInvoice && beforeInvoice.status !== afterInvoice.status) {
      invoiceStatusTransition = {
        id: afterInvoice.id,
        fromStatus: beforeInvoice.status,
        toStatus: afterInvoice.status,
      };
    }
  }
  if (body?.status === "INVOICED" && finalTermin.invoiceId) {
    const [beforeInvoice] = await db
      .select({ status: invoices.status })
      .from(invoices)
      .where(eq(invoices.id, finalTermin.invoiceId))
      .limit(1);
    const [afterInvoice] = await db
      .update(invoices)
      .set({ status: "ISSUED", updatedAt: new Date() })
      .where(eq(invoices.id, finalTermin.invoiceId))
      .returning({ id: invoices.id, status: invoices.status });
    if (beforeInvoice && afterInvoice && beforeInvoice.status !== afterInvoice.status) {
      invoiceStatusTransition = {
        id: afterInvoice.id,
        fromStatus: beforeInvoice.status,
        toStatus: afterInvoice.status,
      };
    }
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

  const statusChanged =
    body.status !== undefined && body.status !== beforeUpdate?.status;
  await recordAuditLog({
    module: "TERMIN",
    entityId: finalTermin.id,
    action: statusChanged ? "STATUS_CHANGED" : "UPDATE",
    actor: auth.user,
    details: {
      contractId: finalTermin.contractId,
      terminName: finalTermin.terminName,
      ...(statusChanged
        ? { fromStatus: beforeUpdate?.status ?? null, toStatus: finalTermin.status }
        : {}),
    },
  });
  if (createdInvoiceId) {
    await recordAuditLog({
      module: "INVOICE",
      entityId: createdInvoiceId,
      action: "CREATE",
      actor: auth.user,
      details: {
        terminId: finalTermin.id,
        contractId: finalTermin.contractId,
        pph23Enabled: body.usePph23 !== false,
      },
    });
  } else if (invoiceStatusTransition) {
    await recordAuditLog({
      module: "INVOICE",
      entityId: invoiceStatusTransition.id,
      action: "STATUS_CHANGED",
      actor: auth.user,
      details: {
        terminId: finalTermin.id,
        fromStatus: invoiceStatusTransition.fromStatus,
        toStatus: invoiceStatusTransition.toStatus,
      },
    });
  } else if (body?.status === "PENDING" && prevInvoiceId) {
    await recordAuditLog({
      module: "INVOICE",
      entityId: prevInvoiceId,
      action: "DELETE",
      actor: auth.user,
      details: { terminId: finalTermin.id, reason: "TERMIN_RESET_TO_PENDING" },
    });
  }

  return NextResponse.json(finalTermin);
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const db = getDb();
  const [existing] = await db
    .select({
      contractId: termins.contractId,
      terminName: termins.terminName,
      status: termins.status,
    })
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

  await recordAuditLog({
    module: "TERMIN",
    entityId: params.id,
    action: "DELETE",
    actor: auth.user,
    details: {
      contractId: existing.contractId,
      terminName: existing.terminName,
      status: existing.status,
    },
  });

  return NextResponse.json({ ok: true });
}
