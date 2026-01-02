import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { getDb } from "./index";
import { clients, contracts, termins, invoices, letters, users, settings } from "./schema";
import {
  mockClients,
  mockContracts,
  mockTermins,
  mockInvoices,
  mockLetters,
} from "../../data/mockData";
import {
  generateInvoiceNumber,
  generateLetterNumber,
  generateProposalNumber,
  getJakartaMonthYear,
} from "../numbering";

const toNumeric = (value: number) => value.toString();
const mockClientById = new Map(mockClients.map((client) => [client.id, client]));

async function resolveClientId(db: ReturnType<typeof getDb>, clientId: string) {
  const direct = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (direct.length > 0) return direct[0].id;

  const mockClient = mockClientById.get(clientId);
  if (!mockClient) return clientId;

  const byCode = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.code, mockClient.code))
    .limit(1);
  if (byCode.length > 0) return byCode[0].id;

  const byName = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.name, mockClient.name))
    .limit(1);
  if (byName.length > 0) return byName[0].id;

  return clientId;
}

async function seedUsers() {
  const db = getDb();
  const now = new Date();
  const passwordHash = await bcrypt.hash("iecnet123", 10);
  await db
    .insert(users)
    .values({
      id: "1",
      username: "iecnet",
      name: "Admin IECNET",
      role: "ADMIN",
      passwordHash,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: users.username,
      set: {
        name: "Admin IECNET",
        role: "ADMIN",
        passwordHash,
        updatedAt: now,
      },
    });
}

async function seedSettings() {
  const db = getDb();
  const now = new Date();
  await db
    .insert(settings)
    .values({
      id: "default",
      companyName: "Krisnawan, Nugroho & Fahmy",
      companyAddress:
        "Pesanggrahan Office R102, Jl Lebak Bulus III No. 50, Jakarta 12440, Indonesia",
      companyPhone: "+62 21 2297 6353",
      companyEmail: "contactus@knfeds.id",
      companyLogoUrl: "/logo-1.png",
      numberingPrefix: "AP.2137",
      numberingReset: "YEARLY",
      defaultPpnRate: "11",
      defaultSignerName: "Anita Rahman, CPA",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: settings.id,
      set: {
        companyName: "Krisnawan, Nugroho & Fahmy",
        companyAddress:
          "Pesanggrahan Office R102, Jl Lebak Bulus III No. 50, Jakarta 12440, Indonesia",
        companyPhone: "+62 21 2297 6353",
        companyEmail: "contactus@knfeds.id",
        companyLogoUrl: "/logo-1.png",
        numberingPrefix: "AP.2137",
        numberingReset: "YEARLY",
        defaultPpnRate: "11",
        defaultSignerName: "Anita Rahman, CPA",
        updatedAt: now,
      },
    });
}

async function seedClients() {
  const db = getDb();
  for (const client of mockClients) {
    const existing = await db
      .select({ id: clients.id })
      .from(clients)
      .where(eq(clients.id, client.id))
      .limit(1);
    if (existing.length > 0) {
      await db
        .update(clients)
        .set({
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
        .where(eq(clients.id, client.id));
      continue;
    }
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

async function migrateClientCodes() {
  const db = getDb();
  const clientRows = await db.select().from(clients);
  clientRows.sort((a, b) => {
    const timeDiff =
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.id.localeCompare(b.id);
  });
  for (let index = 0; index < clientRows.length; index += 1) {
    const client = clientRows[index];
    await db
      .update(clients)
      .set({ code: (index + 1).toString(), updatedAt: new Date() })
      .where(eq(clients.id, client.id));
  }
}

async function seedContracts() {
  const db = getDb();
  for (const contract of mockContracts) {
    const resolvedClientId = await resolveClientId(db, contract.clientId);
    const existing = await db
      .select({ id: contracts.id })
      .from(contracts)
      .where(eq(contracts.id, contract.id))
      .limit(1);
    if (existing.length > 0) {
      await db
        .update(contracts)
        .set({
          proposalDate: contract.proposalDate,
          clientId: resolvedClientId,
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
        .where(eq(contracts.id, contract.id));
      continue;
    }
    await db
      .insert(contracts)
      .values({
        id: contract.id,
        proposalDate: contract.proposalDate,
        clientId: resolvedClientId,
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
          proposalDate: contract.proposalDate,
          clientId: resolvedClientId,
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

async function migrateServiceCode() {
  const db = getDb();
  await db
    .update(contracts)
    .set({
      serviceCode: "B",
      proposalNumber: sql`replace(${contracts.proposalNumber}, '/NA/', '/B/')`,
      updatedAt: new Date(),
    })
    .where(eq(contracts.serviceCode, "NA"));
}

async function migrateNumbering() {
  const db = getDb();

  const clientRows = await db.select().from(clients);
  const clientCodeById = new Map(
    clientRows.map((client) => [client.id, client.code])
  );

  const contractRows = await db.select().from(contracts);
  const engagementGroups = new Map<string, typeof contractRows>();
  for (const contract of contractRows) {
    const key = `${contract.clientId}:${contract.serviceCode}`;
    const group = engagementGroups.get(key) ?? [];
    group.push(contract);
    engagementGroups.set(key, group);
  }
  for (const items of engagementGroups.values()) {
    items.sort((a, b) => {
      const timeDiff =
        new Date(a.proposalDate).getTime() - new Date(b.proposalDate).getTime();
      if (timeDiff !== 0) return timeDiff;
      return a.id.localeCompare(b.id);
    });
    for (let index = 0; index < items.length; index += 1) {
      const contract = items[index];
      const nextEngagementNo = index + 1;
      contract.engagementNo = nextEngagementNo;
      await db
        .update(contracts)
        .set({ engagementNo: nextEngagementNo, updatedAt: new Date() })
        .where(eq(contracts.id, contract.id));
    }
  }
  await db
    .update(contracts)
    .set({
      proposalNumber: sql`'TEMP-' || ${contracts.id}`,
      updatedAt: new Date(),
    });
  const contractsByYear = new Map<number, typeof contractRows>();
  for (const contract of contractRows) {
    const { year } = getJakartaMonthYear(new Date(contract.proposalDate));
    const group = contractsByYear.get(year) ?? [];
    group.push(contract);
    contractsByYear.set(year, group);
  }
  for (const items of contractsByYear.values()) {
    items.sort((a, b) => {
      const timeDiff =
        new Date(a.proposalDate).getTime() - new Date(b.proposalDate).getTime();
      if (timeDiff !== 0) return timeDiff;
      return a.id.localeCompare(b.id);
    });
    for (let index = 0; index < items.length; index += 1) {
      const contract = items[index];
      const clientCode = clientCodeById.get(contract.clientId);
      if (!clientCode) continue;
      const seqNo = index + 1;
      const proposalNumber = generateProposalNumber({
        seqNo,
        serviceCode: contract.serviceCode as "A" | "B",
        engagementNo: contract.engagementNo,
        proposalDate: new Date(contract.proposalDate),
      });
      await db
        .update(contracts)
        .set({
          seqNo,
          proposalNumber,
          updatedAt: new Date(),
        })
        .where(eq(contracts.id, contract.id));
    }
  }

  const invoiceRows = await db.select().from(invoices);
  await db
    .update(invoices)
    .set({
      invoiceNumber: sql`'TEMP-' || ${invoices.id}`,
      updatedAt: new Date(),
    });
  const invoicesByYear = new Map<number, typeof invoiceRows>();
  for (const invoice of invoiceRows) {
    const { year } = getJakartaMonthYear(new Date(invoice.invoiceDate));
    const group = invoicesByYear.get(year) ?? [];
    group.push(invoice);
    invoicesByYear.set(year, group);
  }
  for (const items of invoicesByYear.values()) {
    items.sort((a, b) => {
      const timeDiff =
        new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime();
      if (timeDiff !== 0) return timeDiff;
      return a.id.localeCompare(b.id);
    });
    for (let index = 0; index < items.length; index += 1) {
      const invoice = items[index];
      const seqNo = index + 1;
      const invoiceNumber = generateInvoiceNumber({
        seqNo,
        invoiceDate: new Date(invoice.invoiceDate),
      });
      await db
        .update(invoices)
        .set({
          seqNo,
          invoiceNumber,
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, invoice.id));
    }
  }

  const letterRows = await db.select().from(letters);
  await db
    .update(letters)
    .set({
      letterNumber: sql`'TEMP-' || ${letters.id}`,
      updatedAt: new Date(),
    });
  await db
    .update(letters)
    .set({ letterType: "UMUM", updatedAt: new Date() })
    .where(eq(letters.letterType, "FINANCE"));
  await db
    .update(letters)
    .set({ letterType: "SURAT_TUGAS", updatedAt: new Date() })
    .where(eq(letters.letterType, "SURAT_JALAN"));
  const lettersByYear = new Map<number, typeof letterRows>();
  for (const letter of letterRows) {
    const { year } = getJakartaMonthYear(new Date(letter.letterDate));
    const group = lettersByYear.get(year) ?? [];
    group.push(letter);
    lettersByYear.set(year, group);
  }
  for (const items of lettersByYear.values()) {
    items.sort((a, b) => {
      const timeDiff =
        new Date(a.letterDate).getTime() - new Date(b.letterDate).getTime();
      if (timeDiff !== 0) return timeDiff;
      return a.id.localeCompare(b.id);
    });
    for (let index = 0; index < items.length; index += 1) {
      const letter = items[index];
      const seqNo = index + 1;
      const letterNumber = generateLetterNumber({
        seqNo,
        letterDate: new Date(letter.letterDate),
      });
      await db
        .update(letters)
        .set({
          seqNo,
          letterNumber,
          updatedAt: new Date(),
        })
        .where(eq(letters.id, letter.id));
    }
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
    const conflict = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(eq(invoices.invoiceNumber, invoice.invoiceNumber))
      .limit(1);
    const hasConflict = conflict.length > 0 && conflict[0].id !== invoice.id;
    const existing = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(eq(invoices.id, invoice.id))
      .limit(1);
    if (existing.length > 0) {
      const updateValues: Record<string, unknown> = {
        invoiceDate: invoice.invoiceDate,
        contractId: invoice.contractId,
        terminId: invoice.terminId,
        seqNo: invoice.seqNo,
        amount: toNumeric(invoice.amount),
        status: invoice.status,
        createdAt: invoice.createdAt,
        updatedAt: invoice.updatedAt,
      };
      if (!hasConflict) {
        updateValues.invoiceNumber = invoice.invoiceNumber;
      }
      await db
        .update(invoices)
        .set(updateValues)
        .where(eq(invoices.id, invoice.id));
      continue;
    }
    await db
      .insert(invoices)
      .values({
        id: invoice.id,
        invoiceDate: invoice.invoiceDate,
        contractId: invoice.contractId,
        terminId: invoice.terminId,
        seqNo: invoice.seqNo,
        invoiceNumber: hasConflict ? `TEMP-${invoice.id}` : invoice.invoiceNumber,
        amount: toNumeric(invoice.amount),
        status: invoice.status,
        createdAt: invoice.createdAt,
        updatedAt: invoice.updatedAt,
      })
      .onConflictDoUpdate({
        target: invoices.invoiceNumber,
        set: {
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
    const resolvedClientId = letter.clientId
      ? await resolveClientId(db, letter.clientId)
      : null;
    const existing = await db
      .select({ id: letters.id })
      .from(letters)
      .where(eq(letters.id, letter.id))
      .limit(1);
    if (existing.length > 0) {
      await db
        .update(letters)
        .set({
          letterDate: letter.letterDate,
          clientId: resolvedClientId,
          letterType: letter.letterType,
          subject: letter.subject,
          seqNo: letter.seqNo,
          letterNumber: letter.letterNumber,
          status: letter.status,
          notes: letter.notes ?? null,
          createdAt: letter.createdAt,
          updatedAt: letter.updatedAt,
        })
        .where(eq(letters.id, letter.id));
      continue;
    }
    await db
      .insert(letters)
      .values({
        id: letter.id,
        letterDate: letter.letterDate,
        clientId: resolvedClientId,
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
          letterDate: letter.letterDate,
          clientId: resolvedClientId,
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
  await seedUsers();
  await seedSettings();
  await seedClients();
  await migrateClientCodes();
  await seedContracts();
  await migrateServiceCode();
  await seedTermins();
  await seedInvoices();
  await syncTerminInvoiceIds();
  await seedLetters();
  await migrateNumbering();
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
