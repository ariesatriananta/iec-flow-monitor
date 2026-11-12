import { and, eq, gte, lt, max } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { clients, consolidatedLetterCounters, letters, settings } from "@/lib/db/schema";
import { generateLetterNumber, getJakartaMonthYear } from "@/lib/numbering";
import {
  CONSOLIDATED_LETTER_SUBJECT, CONSOLIDATED_LETTER_TYPE, ConsolidatedLetterError,
  consolidatedLetterDate, consolidatedNumberingChange, createConsolidatedLetterSchema, parseConsolidatedInput,
  updateConsolidatedLetterSchema,
} from "./consolidated-validation";

export { ConsolidatedLetterError } from "./consolidated-validation";

type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

async function nextSequence(tx: Transaction, year: number): Promise<number> {
  await tx.insert(consolidatedLetterCounters).values({ year, lastSeq: 0 }).onConflictDoNothing();
  const [counter] = await tx.select().from(consolidatedLetterCounters)
    .where(eq(consolidatedLetterCounters.year, year)).for("update");
  // The counter survives deletion. max also protects databases with imported letters.
  const [existing] = await tx.select({ maxSeq: max(letters.seqNo) }).from(letters).where(and(
    eq(letters.letterType, CONSOLIDATED_LETTER_TYPE),
    gte(letters.letterDate, new Date(`${String(year).padStart(4, "0")}-01-01T00:00:00+07:00`)),
    lt(letters.letterDate, new Date(`${String(year).padStart(4, "0")}-12-31T17:00:00Z`)),
  ));
  const seqNo = Math.max(counter.lastSeq, existing?.maxSeq ?? 0) + 1;
  await tx.update(consolidatedLetterCounters).set({ lastSeq: seqNo, updatedAt: new Date() })
    .where(eq(consolidatedLetterCounters.year, year));
  return seqNo;
}

async function assertActiveClient(tx: Transaction, id: string) {
  const [client] = await tx.select({ id: clients.id, active: clients.isActive }).from(clients)
    .where(eq(clients.id, id)).for("share");
  if (!client?.active) throw new ConsolidatedLetterError(400, "Pilih client aktif yang valid");
}

async function currentPrefix(tx: Transaction) {
  const [row] = await tx.select({ prefix: settings.numberingPrefix }).from(settings).limit(1);
  return row?.prefix;
}

export async function createConsolidatedLetter(body: unknown) {
  const input = parseConsolidatedInput(createConsolidatedLetterSchema, body);
  const letterDate = consolidatedLetterDate(input.letterDate);
  const { year } = getJakartaMonthYear(letterDate);
  return getDb().transaction(async (tx) => {
    await assertActiveClient(tx, input.clientId);
    const seqNo = await nextSequence(tx, year);
    const now = new Date();
    const [created] = await tx.insert(letters).values({
      id: crypto.randomUUID(), letterDate, letterType: CONSOLIDATED_LETTER_TYPE,
      clientId: input.clientId, subject: CONSOLIDATED_LETTER_SUBJECT, hrgaCategory: null,
      status: input.status, notes: input.notes ?? null,
      opinionDate: input.opinionDate, opinionNumber: input.opinionNumber, seqNo,
      letterNumber: generateLetterNumber({ seqNo, letterDate, letterType: CONSOLIDATED_LETTER_TYPE, numberingPrefix: await currentPrefix(tx) }),
      createdAt: now, updatedAt: now,
    }).returning();
    return created;
  });
}

export async function updateConsolidatedLetter(id: string, body: unknown) {
  const patch = parseConsolidatedInput(updateConsolidatedLetterSchema, body);
  return getDb().transaction(async (tx) => {
    const [current] = await tx.select().from(letters).where(eq(letters.id, id)).for("update");
    if (!current) throw new ConsolidatedLetterError(404, "Surat tidak ditemukan");
    if (current.letterType !== CONSOLIDATED_LETTER_TYPE) throw new ConsolidatedLetterError(400, "Tipe surat tidak dapat diubah ke Surat Pengantar Konsolidasian");
    if ((patch.seqNo !== undefined && patch.seqNo !== current.seqNo)
      || (patch.letterNumber !== undefined && patch.letterNumber !== current.letterNumber)) {
      throw new ConsolidatedLetterError(400, "Nomor surat dibuat otomatis dan tidak dapat diisi manual");
    }
    const changes = { ...patch };
    delete changes.seqNo;
    delete changes.letterNumber;
    const input = parseConsolidatedInput(createConsolidatedLetterSchema, {
      letterDate: current.letterDate.toISOString(), clientId: current.clientId,
      letterType: current.letterType, status: current.status, notes: current.notes,
      opinionDate: current.opinionDate, opinionNumber: current.opinionNumber, ...changes,
    });
    if (input.clientId !== current.clientId) await assertActiveClient(tx, input.clientId);
    const letterDate = consolidatedLetterDate(input.letterDate);
    const change = consolidatedNumberingChange(current.letterDate, letterDate);
    const seqNo = change.allocateSequence ? await nextSequence(tx, change.year) : current.seqNo;
    const prefix = current.letterNumber.match(/^L\.\d+\/CON\/(.+)\/[IVX]+\/\d+$/)?.[1];
    const letterNumber = change.regenerateNumber ? generateLetterNumber({
      seqNo, letterDate, letterType: CONSOLIDATED_LETTER_TYPE,
      numberingPrefix: prefix ?? await currentPrefix(tx),
    }) : current.letterNumber;
    const [updated] = await tx.update(letters).set({
      letterDate, clientId: input.clientId, subject: CONSOLIDATED_LETTER_SUBJECT,
      status: input.status, notes: input.notes ?? null, opinionDate: input.opinionDate,
      opinionNumber: input.opinionNumber, seqNo, letterNumber, updatedAt: new Date(),
    }).where(eq(letters.id, id)).returning();
    return updated;
  });
}
