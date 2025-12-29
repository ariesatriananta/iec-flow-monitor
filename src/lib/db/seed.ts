import "dotenv/config";
import { eq } from "drizzle-orm";
import { getDb } from "./index";
import { clients, contracts, termins, invoices, letters } from "./schema";
import {
  mockClients,
  mockContracts,
  mockTermins,
  mockInvoices,
  mockLetters,
} from "../../data/mockData";

const toNumeric = (value: number) => value.toString();

async function seedClients() {
  const db = getDb();
  for (const client of mockClients) {
    await db
      .insert(clients)
      .values({
        id: client.id,
        name: client.name,
        code: client.code,
        address: client.address ?? null,
        picName: client.picName ?? null,
        email: client.email ?? null,
        phone: client.phone ?? null,
        isActive: client.isActive,
        createdAt: client.createdAt,
        updatedAt: client.updatedAt,
      })
      .onConflictDoUpdate({
        target: clients.code,
        set: {
          id: client.id,
          name: client.name,
          code: client.code,
          address: client.address ?? null,
          picName: client.picName ?? null,
          email: client.email ?? null,
          phone: client.phone ?? null,
          isActive: client.isActive,
          createdAt: client.createdAt,
          updatedAt: client.updatedAt,
        },
      });
  }
}

async function seedContracts() {
  const db = getDb();
  for (const contract of mockContracts) {
    await db
      .insert(contracts)
      .values({
        id: contract.id,
        proposalDate: contract.proposalDate,
        clientId: contract.clientId,
        serviceCode: contract.serviceCode,
        engagementNo: contract.engagementNo,
        seqNo: contract.seqNo,
        proposalNumber: contract.proposalNumber,
        contractTitle: contract.contractTitle ?? null,
        contractValue: toNumeric(contract.contractValue),
        paymentStatus: contract.paymentStatus,
        status: contract.status,
        notes: contract.notes ?? null,
        createdAt: contract.createdAt,
        updatedAt: contract.updatedAt,
      })
      .onConflictDoUpdate({
        target: contracts.proposalNumber,
        set: {
          id: contract.id,
          proposalDate: contract.proposalDate,
          clientId: contract.clientId,
          serviceCode: contract.serviceCode,
          engagementNo: contract.engagementNo,
          seqNo: contract.seqNo,
          proposalNumber: contract.proposalNumber,
          contractTitle: contract.contractTitle ?? null,
          contractValue: toNumeric(contract.contractValue),
          paymentStatus: contract.paymentStatus,
          status: contract.status,
          notes: contract.notes ?? null,
          createdAt: contract.createdAt,
          updatedAt: contract.updatedAt,
        },
      });
  }
}

async function seedTermins() {
  const db = getDb();
  for (const termin of mockTermins) {
    await db
      .insert(termins)
      .values({
        id: termin.id,
        contractId: termin.contractId,
        terminName: termin.terminName,
        terminAmount: toNumeric(termin.terminAmount),
        dueDate: termin.dueDate ?? null,
        invoiceId: termin.invoiceId ?? null,
        paymentReceivedDate: termin.paymentReceivedDate ?? null,
        status: termin.status,
        createdAt: termin.createdAt,
        updatedAt: termin.updatedAt,
      })
      .onConflictDoUpdate({
        target: termins.id,
        set: {
          contractId: termin.contractId,
          terminName: termin.terminName,
          terminAmount: toNumeric(termin.terminAmount),
          dueDate: termin.dueDate ?? null,
          invoiceId: termin.invoiceId ?? null,
          paymentReceivedDate: termin.paymentReceivedDate ?? null,
          status: termin.status,
          createdAt: termin.createdAt,
          updatedAt: termin.updatedAt,
        },
      });
  }
}

async function seedInvoices() {
  const db = getDb();
  for (const invoice of mockInvoices) {
    await db
      .insert(invoices)
      .values({
        id: invoice.id,
        invoiceDate: invoice.invoiceDate,
        contractId: invoice.contractId,
        terminId: invoice.terminId,
        seqNo: invoice.seqNo,
        invoiceNumber: invoice.invoiceNumber,
        amount: toNumeric(invoice.amount),
        status: invoice.status,
        createdAt: invoice.createdAt,
        updatedAt: invoice.updatedAt,
      })
      .onConflictDoUpdate({
        target: invoices.invoiceNumber,
        set: {
          id: invoice.id,
          invoiceDate: invoice.invoiceDate,
          contractId: invoice.contractId,
          terminId: invoice.terminId,
          seqNo: invoice.seqNo,
          invoiceNumber: invoice.invoiceNumber,
          amount: toNumeric(invoice.amount),
          status: invoice.status,
          createdAt: invoice.createdAt,
          updatedAt: invoice.updatedAt,
        },
      });
  }
}

async function syncTerminInvoiceIds() {
  const db = getDb();
  for (const termin of mockTermins) {
    if (!termin.invoiceId) continue;
    await db
      .update(termins)
      .set({
        invoiceId: termin.invoiceId,
        updatedAt: termin.updatedAt,
      })
      .where(eq(termins.id, termin.id));
  }
}

async function seedLetters() {
  const db = getDb();
  for (const letter of mockLetters) {
    await db
      .insert(letters)
      .values({
        id: letter.id,
        letterDate: letter.letterDate,
        clientId: letter.clientId,
        letterType: letter.letterType,
        subject: letter.subject,
        seqNo: letter.seqNo,
        letterNumber: letter.letterNumber,
        status: letter.status,
        notes: letter.notes ?? null,
        createdAt: letter.createdAt,
        updatedAt: letter.updatedAt,
      })
      .onConflictDoUpdate({
        target: letters.letterNumber,
        set: {
          id: letter.id,
          letterDate: letter.letterDate,
          clientId: letter.clientId,
          letterType: letter.letterType,
          subject: letter.subject,
          seqNo: letter.seqNo,
          letterNumber: letter.letterNumber,
          status: letter.status,
          notes: letter.notes ?? null,
          createdAt: letter.createdAt,
          updatedAt: letter.updatedAt,
        },
      });
  }
}

async function run() {
  await seedClients();
  await seedContracts();
  await seedTermins();
  await seedInvoices();
  await syncTerminInvoiceIds();
  await seedLetters();
}

run()
  .then(() => {
    console.log("Seed completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Seed failed", error);
    process.exit(1);
  });
