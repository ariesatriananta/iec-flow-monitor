import test from "node:test";
import assert from "node:assert/strict";
import {
  CONSOLIDATED_LETTER_TYPE, ConsolidatedLetterError, consolidatedDateOnlySchema,
  consolidatedLetterDate, consolidatedNumberingChange, createConsolidatedLetterSchema,
  parseConsolidatedInput, updateConsolidatedLetterSchema,
} from "./consolidated-validation";
import { generateLetterNumber } from "../numbering";

const valid = {
  clientId: "client", letterDate: "2026-11-12T00:00:00.000Z",
  opinionDate: "2026-11-10", opinionNumber: "OP.001",
};

test("new letter has independent opinion date and default ACTIVE status", () => {
  const parsed = createConsolidatedLetterSchema.parse(valid);
  assert.equal(parsed.status, "ACTIVE");
  assert.equal(parsed.opinionDate, "2026-11-10");
  assert.equal(parsed.letterDate, valid.letterDate);
});
test("client, opinion date and manual opinion number mandatory", () => {
  for (const key of ["clientId", "opinionDate", "opinionNumber"]) {
    for (const value of [undefined, null, "", "   "]) {
      assert.equal(createConsolidatedLetterSchema.safeParse({ ...valid, [key]: value }).success, false);
    }
  }
});
test("calendar dates reject overflow, year zero and timestamp opinions", () => {
  for (const value of ["0000-01-01", "2026-02-29", "2026-04-31", "2026-1-01", valid.letterDate]) {
    assert.equal(consolidatedDateOnlySchema.safeParse(value).success, false);
  }
  assert.equal(consolidatedDateOnlySchema.safeParse("2024-02-29").success, true);
});
test("letter date accepts date only or timezone ISO, rejects normalized overflow", () => {
  for (const value of ["2026-11-12", "2026-11-12T08:00:00+07:00", valid.letterDate]) {
    assert.equal(createConsolidatedLetterSchema.safeParse({ ...valid, letterDate: value }).success, true);
  }
  for (const value of ["2026-02-30T00:00:00Z", "bad", "2026-11-12T08:00:00"]) {
    assert.equal(createConsolidatedLetterSchema.safeParse({ ...valid, letterDate: value }).success, false);
  }
});
test("date-only letter date means WIB midnight", () => {
  assert.equal(consolidatedLetterDate("2026-11-12").toISOString(), "2026-11-11T17:00:00.000Z");
});
test("status constrained and type cannot be switched", () => {
  for (const status of ["ACTIVE", "VOID", "CANCELLED"]) assert.equal(createConsolidatedLetterSchema.safeParse({ ...valid, status }).success, true);
  assert.equal(createConsolidatedLetterSchema.safeParse({ ...valid, status: "APPROVED" }).success, false);
  assert.equal(updateConsolidatedLetterSchema.safeParse({ letterType: "UMUM" }).success, false);
  assert.equal(updateConsolidatedLetterSchema.safeParse({ letterType: CONSOLIDATED_LETTER_TYPE }).success, true);
});
test("creation cannot spoof numbering or unrelated assignment", () => {
  for (const change of [{ seqNo: 100 }, { letterNumber: "manual" }, { assignment: {} }, { id: "id" }]) {
    assert.equal(createConsolidatedLetterSchema.safeParse({ ...valid, ...change }).success, false);
  }
});
test("partial edits do not default or erase missing values", () => {
  assert.deepEqual(updateConsolidatedLetterSchema.parse({ notes: "note" }), { notes: "note" });
  assert.deepEqual(updateConsolidatedLetterSchema.parse({ notes: null }), { notes: null });
  assert.equal(createConsolidatedLetterSchema.parse({ ...valid, opinionNumber: " OP.001 " }).opinionNumber, "OP.001");
});
test("typed validation errors expose controlled HTTP status", () => {
  assert.throws(() => parseConsolidatedInput(createConsolidatedLetterSchema, {}), (error) => error instanceof ConsolidatedLetterError && error.status === 400);
});
test("same WIB month preserves sequence and number even across UTC year boundary", () => {
  assert.deepEqual(consolidatedNumberingChange(new Date("2025-12-31T17:00:00Z"), new Date("2026-01-10T00:00:00Z")), {
    year: 2026, allocateSequence: false, regenerateNumber: false,
  });
});
test("month edit keeps sequence, year edit allocates fresh annual sequence", () => {
  const previous = consolidatedLetterDate("2026-11-12");
  assert.deepEqual(consolidatedNumberingChange(previous, consolidatedLetterDate("2026-12-01")), { year: 2026, allocateSequence: false, regenerateNumber: true });
  assert.deepEqual(consolidatedNumberingChange(previous, consolidatedLetterDate("2027-01-01")), { year: 2027, allocateSequence: true, regenerateNumber: true });
});
test("CON format uses letter date, independent prefix and sequence", () => {
  assert.equal(generateLetterNumber({ seqNo: 1, letterType: CONSOLIDATED_LETTER_TYPE, letterDate: consolidatedLetterDate("2026-11-12") }), "L.001/CON/AP.2137/XI/2026");
  assert.equal(generateLetterNumber({ seqNo: 42, letterType: CONSOLIDATED_LETTER_TYPE, letterDate: consolidatedLetterDate("2027-01-01"), numberingPrefix: "AP.9999" }), "L.042/CON/AP.9999/I/2027");
});
