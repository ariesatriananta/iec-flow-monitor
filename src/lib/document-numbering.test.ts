import assert from "node:assert/strict";
import test from "node:test";
import { nextDocumentSequence } from "./document-number-sequence";
import { generateInvoiceNumber } from "./numbering";
import { PgDialect } from "drizzle-orm/pg-core";
import { allocateDocumentNumber, type DocumentNumberTransaction } from "./document-numbering";

test("allocator locks shared counter and only counts canonical invoice numbers for that year", async () => {
  const numbers = ["I.042/ARM/X/2026", "I.043/ARM/XI/2026", "OPE/BT/2026/9999", "OPE/ML/2026/9999", "I.900/ARM/XII/2025"];
  const events: string[] = [];
  let reserved = 0;
  const tx = {
    insert: () => ({ values: () => ({ onConflictDoNothing: async () => { events.push("initialize"); } }) }),
    select: () => ({ from: () => ({ where: () => ({ for: async (mode: string) => {
      assert.equal(mode, "update"); events.push("lock"); return [{ year: 2026, lastSeq: reserved }];
    } }) }) }),
    execute: async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
      assert.equal(events.at(-1), "lock");
      const compiled = new PgDialect().sqlToQuery(query);
      assert.match(compiled.sql, /"invoices"/); assert.match(compiled.sql, /"ope_documents"/);
      const pattern = new RegExp(String(compiled.params[0]));
      assert.equal(pattern.test("Ix043/ARM/XI/2026"), false);
      const matches = numbers.filter((number) => pattern.test(number));
      assert.deepEqual(matches, numbers.slice(0, 2));
      events.push("read-floor");
      return { rows: [{ max: String(Math.max(...matches.map((number) => Number(number.split('/')[0].slice(2))))) }] };
    },
    update: () => ({ set: (value: { lastSeq: number }) => ({ where: async () => { reserved = value.lastSeq; events.push("reserve"); } }) }),
  } as unknown as DocumentNumberTransaction;
  assert.deepEqual(await allocateDocumentNumber(tx, new Date("2026-11-12T00:00:00Z")), {
    seqNo: 44, numberYear: 2026, documentNumber: "I.044/ARM/XI/2026",
  });
  assert.equal((await allocateDocumentNumber(tx, new Date("2026-11-12T00:00:00Z"))).seqNo, 45);
  assert.deepEqual(events.slice(0, 4), ["initialize", "lock", "read-floor", "reserve"]);
});

test("invoice, business trip and meals advance a single yearly high-water mark", () => {
  let last = 0;
  const numbers: string[] = [];
  for (const type of ["INVOICE", "BUSINESS_TRIP", "MEALS", "INVOICE"]) {
    last = nextDocumentSequence(last, "42");
    numbers.push(generateInvoiceNumber({ seqNo: last, invoiceDate: new Date("2026-11-12T00:00:00Z") }));
  }
  assert.deepEqual(numbers, ["I.043/ARM/XI/2026", "I.044/ARM/XI/2026", "I.045/ARM/XI/2026", "I.046/ARM/XI/2026"]);
});

test("deleting highest document or voiding it never reuses its committed counter", () => {
  assert.equal(nextDocumentSequence(44, "42"), 45);
  assert.equal(nextDocumentSequence(44, "44"), 45);
});

test("existing historical/imported higher invoice numbers advance the floor", () => {
  assert.equal(nextDocumentSequence(10, "123"), 124);
  assert.equal(nextDocumentSequence(0, "0"), 1);
});

test("sequence continues across months with Jakarta date and new year format", () => {
  assert.equal(generateInvoiceNumber({ seqNo: 43, invoiceDate: new Date("2026-11-30T17:00:00Z") }), "I.043/ARM/XII/2026");
  assert.equal(generateInvoiceNumber({ seqNo: 1, invoiceDate: new Date("2026-12-31T17:00:00Z") }), "I.001/ARM/I/2027");
  assert.equal(generateInvoiceNumber({ seqNo: 1000, invoiceDate: new Date("2026-11-12T00:00:00Z") }), "I.1000/ARM/XI/2026");
});

test("counter refuses overflow instead of wrapping or producing invalid IDs", () => {
  assert.equal(nextDocumentSequence(2147483646, "0"), 2147483647);
  assert.throws(() => nextDocumentSequence(2147483647, "0"));
  assert.throws(() => nextDocumentSequence(0, "99999999999999999999"));
});
