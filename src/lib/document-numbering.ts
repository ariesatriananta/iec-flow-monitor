import { eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import { documentNumberCounters, invoices, opeDocuments } from "./db/schema";
import { generateInvoiceNumber, getJakartaMonthYear } from "./numbering";
import { nextDocumentSequence } from "./document-number-sequence";

export type DocumentNumberTransaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/** Call inside the SAME transaction as the document insert. Never reuse committed numbers. */
export async function allocateDocumentNumber(tx: DocumentNumberTransaction, date: Date) {
  if (!Number.isFinite(date.getTime())) throw new Error("Tanggal dokumen tidak valid");
  const { year } = getJakartaMonthYear(date);
  await tx.insert(documentNumberCounters).values({ year, lastSeq: 0 }).onConflictDoNothing();
  // All three writers lock the same row. Waiting transactions see the latest committed counter.
  const [counter] = await tx.select().from(documentNumberCounters)
    .where(eq(documentNumberCounters.year, year)).for("update");
  const pattern = `^I\\.[0-9]+/ARM/[IVX]+/${year}$`;
  // Read the persisted NUMBER year, not the editable date. Legacy OPE/BT and OPE/ML are excluded.
  const result = await tx.execute<{ max: string }>(sql`
    SELECT coalesce(max(split_part(split_part(number, '/', 1), '.', 2)::numeric), 0)::text AS max
    FROM (
      SELECT ${invoices.invoiceNumber} AS number FROM ${invoices}
      UNION ALL
      SELECT ${opeDocuments.documentNumber} AS number FROM ${opeDocuments}
    ) AS numbered_documents
    WHERE number ~ ${pattern}
  `);
  const seqNo = nextDocumentSequence(counter.lastSeq, result.rows[0]?.max ?? "0");
  await tx.update(documentNumberCounters).set({ lastSeq: seqNo, updatedAt: new Date() })
    .where(eq(documentNumberCounters.year, year));
  return { seqNo, numberYear: year, documentNumber: generateInvoiceNumber({ seqNo, invoiceDate: date }) };
}
