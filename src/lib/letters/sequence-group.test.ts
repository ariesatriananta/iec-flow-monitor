import test from "node:test";
import assert from "node:assert/strict";
import { sharesLetterSequence } from "./sequence-group";
import { generateLetterNumber } from "../numbering";

test("CON never raises old letter sequences; general/assignment and HRGA grouping unchanged", () => {
  const types = ["HRGA", "UMUM", "SURAT_TUGAS", "SURAT_PENGANTAR_KONSOLIDASIAN"];
  assert.deepEqual(types.filter(type => sharesLetterSequence(type, "UMUM")), ["UMUM", "SURAT_TUGAS"]);
  assert.deepEqual(types.filter(type => sharesLetterSequence(type, "SURAT_TUGAS")), ["UMUM", "SURAT_TUGAS"]);
  assert.deepEqual(types.filter(type => sharesLetterSequence(type, "HRGA")), ["HRGA"]);
  assert.deepEqual(types.filter(type => sharesLetterSequence(type, types[3])), [types[3]]);
});
test("legacy numbering formats remain unchanged", () => {
  const common = { seqNo: 7, letterDate: new Date("2026-11-12T00:00:00+07:00") };
  assert.equal(generateLetterNumber({ ...common, letterType: "UMUM" }), "L.007/AP.2137/XI/2026");
  assert.equal(generateLetterNumber({ ...common, letterType: "SURAT_TUGAS" }), "L.007/AP.2137/XI/2026");
  assert.equal(generateLetterNumber({ ...common, letterType: "HRGA", hrgaCategory: "PERMANEN" }), "007/AP.2137/Employee-A/XI/2026");
  assert.equal(generateLetterNumber({ ...common, letterType: "HRGA", hrgaCategory: "NON_PERMANEN" }), "007/AP.2137/Employee-B/XI/2026");
  assert.equal(generateLetterNumber({ ...common, letterType: "HRGA", hrgaCategory: "INTERNSHIP" }), "007/AP.2137/Employee-C/XI/2026");
});
