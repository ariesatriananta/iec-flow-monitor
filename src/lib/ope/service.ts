import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { clients, contracts, employees, opeDocuments, opeItems, type OpeClientSnapshot } from "@/lib/db/schema";
import { calculateOpeTotals, canTransitionOpe, OpeError, type OpeInput } from "./validation";
import { allocateDocumentNumber } from "../document-numbering";

type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
type Document = typeof opeDocuments.$inferSelect;
type Item = typeof opeItems.$inferSelect;

export async function getOpeClientOptions() {
  return getDb().select({
    id: clients.id, name: clients.name, code: clients.code,
    address: clients.address, picName: clients.picName, npwp: clients.npwp, npwp2: clients.npwp2,
    latestContractDate: sql<Date>`max(${contracts.createdAt})`,
  }).from(clients).innerJoin(contracts, eq(contracts.clientId, clients.id))
    .where(and(eq(clients.isActive, true), eq(contracts.status, "ACTIVE")))
    .groupBy(clients.id).orderBy(desc(sql`max(${contracts.createdAt})`), asc(clients.id));
}

async function prepareDocument(tx: Transaction, input: OpeInput, old?: Document, oldItems: Item[] = []) {
  const snapshots = new Map<string, OpeClientSnapshot>();
  if (old?.clientId && old.clientSnapshot) snapshots.set(old.clientId, old.clientSnapshot);
  for (const item of oldItems) {
    if (item.clientId && item.clientSnapshot) snapshots.set(item.clientId, item.clientSnapshot);
  }
  async function clientSnapshot(clientId: string) {
    const previous = snapshots.get(clientId);
    if (previous) return previous;
    const [found] = await tx.select({ client: clients }).from(clients)
      .innerJoin(contracts, eq(contracts.clientId, clients.id))
      .where(and(eq(clients.id, clientId), eq(clients.isActive, true), eq(contracts.status, "ACTIVE"))).limit(1);
    if (!found) throw new OpeError("Client harus aktif dan memiliki kontrak ACTIVE");
    const client = found.client;
    const snapshot = {
      name: client.name, code: client.code, address: client.address,
      picName: client.picName, npwp: client.npwp, npwp2: client.npwp2,
    };
    snapshots.set(clientId, snapshot);
    return snapshot;
  }

  const rows: Omit<typeof opeItems.$inferInsert, "documentId">[] = [];
  const clientId = input.type === "BUSINESS_TRIP" ? input.clientId : null;
  const headerSnapshot = clientId ? await clientSnapshot(clientId) : null;
  const employeeNames = new Map<string, string>();
  for (const item of oldItems) {
    if (item.employeeId && item.employeeName) employeeNames.set(item.employeeId, item.employeeName);
  }

  if (input.type === "BUSINESS_TRIP") {
    for (const [position, item] of input.items.entries()) {
      let name = employeeNames.get(item.employeeId);
      if (!name) {
        const [employee] = await tx.select().from(employees)
          .where(and(eq(employees.id, item.employeeId), eq(employees.isActive, true))).limit(1);
        if (!employee) throw new OpeError("Karyawan tidak ditemukan atau tidak aktif");
        name = employee.fullName || employee.employeeCode;
        employeeNames.set(item.employeeId, name);
      }
      const amount = item.days * item.rate;
      rows.push({
        id: crypto.randomUUID(), position, employeeId: item.employeeId, employeeName: name,
        days: item.days, rate: String(item.rate), amount: String(amount),
        description: item.description || name,
      });
    }
  } else {
    for (const [position, item] of input.items.entries()) {
      rows.push({
        id: crypto.randomUUID(), position, expenseDate: item.expenseDate,
        clientId: item.clientId, clientSnapshot: await clientSnapshot(item.clientId),
        description: item.description, amount: String(item.amount),
      });
    }
  }
  const totals = calculateOpeTotals(rows.map((row) => Number(row.amount)), input.usePpn, input.usePph23);
  return {
    header: {
      documentDate: input.documentDate, clientId, clientSnapshot: headerSnapshot,
      subject: input.subject, notes: input.notes || null, ...totals,
    },
    rows,
  };
}

export async function createOpe(input: OpeInput) {
  return getDb().transaction(async (tx) => {
    const { header, rows } = await prepareDocument(tx, input);
    const numbering = await allocateDocumentNumber(tx, input.documentDate);
    const now = new Date();
    const [document] = await tx.insert(opeDocuments).values({
      ...header, id: crypto.randomUUID(), type: input.type, status: "DRAFT", ...numbering,
      createdAt: now, updatedAt: now,
    }).returning();
    const items = await tx.insert(opeItems).values(rows.map((row) => ({ ...row, documentId: document.id }))).returning();
    return { ...document, items };
  });
}

export async function updateOpe(id: string, input: OpeInput | { status: string }) {
  return getDb().transaction(async (tx) => {
    const [old] = await tx.select().from(opeDocuments).where(eq(opeDocuments.id, id)).for("update").limit(1);
    if (!old) throw new OpeError("Dokumen OPE tidak ditemukan", 404);
    const oldItems = await tx.select().from(opeItems).where(eq(opeItems.documentId, id)).orderBy(asc(opeItems.position));
    if ("status" in input) {
      if (!canTransitionOpe(old.status, input.status)) throw new OpeError("Perubahan status OPE tidak diizinkan", 409);
      if (input.status === "ISSUED" && !oldItems.length) throw new OpeError("Dokumen harus memiliki detail sebelum diterbitkan");
      const [document] = await tx.update(opeDocuments).set({ status: input.status, updatedAt: new Date() })
        .where(eq(opeDocuments.id, id)).returning();
      return { document: { ...document, items: oldItems }, previousStatus: old.status, action: "STATUS_CHANGED" };
    }
    if (old.status !== "DRAFT") throw new OpeError("Hanya dokumen DRAFT yang dapat diedit", 409);
    if (old.type !== input.type) throw new OpeError("Jenis dokumen tidak dapat diubah");
    const { header, rows } = await prepareDocument(tx, input, old, oldItems);
    const [document] = await tx.update(opeDocuments).set({ ...header, updatedAt: new Date() })
      .where(eq(opeDocuments.id, id)).returning();
    await tx.delete(opeItems).where(eq(opeItems.documentId, id));
    const items = await tx.insert(opeItems).values(rows.map((row) => ({ ...row, documentId: id }))).returning();
    return { document: { ...document, items }, previousStatus: old.status, action: "UPDATE" };
  });
}
