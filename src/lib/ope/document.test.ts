import assert from "node:assert/strict";
import test from "node:test";
import type { OpeDocument } from "../../types/ope";
import { buildOpeDocumentHtml } from "./document";

const document: OpeDocument = {
  id: "ope-1", type: "BUSINESS_TRIP", documentDate: new Date("2026-11-10T00:00:00Z"),
  documentNumber: "OPE/BT/2026/0001", seqNo: 1, numberYear: 2026, status: "DRAFT",
  clientId: "client-1", clientSnapshot: { name: "Client Snapshot", code: "C1", address: "Alamat\nLantai 2", picName: "Direktur", npwp: "NPWP LAMA", npwp2: "1234567890123456" },
  subject: "Biaya perjalanan", notes: null, ppnRate: 11, pph23Rate: 2,
  subtotal: 100_000, ppnAmount: 11_000, pph23Amount: 2_000, total: 109_000,
  createdAt: new Date(), updatedAt: new Date(),
  items: [{ id: "item-1", documentId: "ope-1", position: 0, employeeId: "employee-1", employeeName: "Nama Snapshot", days: 2, rate: 40_000, amount: 100_000, expenseDate: null, clientId: null, clientSnapshot: null, description: "Kunjungan" }],
};
const options = { headerUrl: "/invoice-header.png", signerName: "Anita Rahman, CPA" };

test("both OPE formats render one letterhead and a separate readable legal footer", () => {
  for (const type of ["BUSINESS_TRIP", "MEALS"] as const) {
    const html = buildOpeDocumentHtml({ ...document, type }, options);
    assert.equal((html.match(/<image\b/g) ?? []).length, 1);
    assert.match(html, /<footer[^>]*aria-label="Keterangan keanggotaan IECnet"><strong>Krisnawan, Nugroho &amp; Fahmy<\/strong> is an independent member of IECnet Network\./);
    assert.match(html, /Each member of IECnet Network is legally separate and independent entity which practices in its own jurisdiction and in its own rights\. IECnet Network is full member of Forum of Firm\./);
  }
});

test("OPE renderer uses saved snapshots and amounts, with formatted new NPWP and tax display", () => {
  const html = buildOpeDocumentHtml(document, options);
  assert.match(html, /1234 5678 9012 3456/);
  assert.doesNotMatch(html, /NPWP LAMA/);
  assert.match(html, /Nama Snapshot/);
  assert.match(html, /Rp 100\.000/);
  assert.match(html, /Rp 109\.000/);
  assert.match(html, /<td>Rp 11\.000<\/td>/);
  assert.match(html, /<td>\(Rp 2\.000\)<\/td>/);
  assert.match(html, /DRAFT — BELUM DITERBITKAN/);
});

test("OPE renderer escapes hostile text and attribute values without creating executable markup", () => {
  const payload = '<script>alert("x")</script>';
  const html = buildOpeDocumentHtml({ ...document, documentNumber: payload, subject: payload, notes: payload, clientSnapshot: { ...document.clientSnapshot!, name: payload }, items: [{ ...document.items![0], employeeName: payload, description: payload }] }, { headerUrl: 'x" onerror="alert(1)', signerName: payload });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /href="x&quot; onerror=&quot;alert\(1\)"/);
});

test("Meals renders each client without a header client and hides disabled taxes", () => {
  const html = buildOpeDocumentHtml({ ...document, type: "MEALS", status: "VOID", ppnRate: 0, pph23Rate: 0, items: [
    { ...document.items![0], expenseDate: new Date("2026-11-09T00:00:00Z"), clientSnapshot: { ...document.clientSnapshot!, name: "Client A" }, description: "Makan siang" },
    { ...document.items![0], id: "item-2", expenseDate: new Date("2026-11-10T00:00:00Z"), clientSnapshot: { ...document.clientSnapshot!, name: "Client B" }, description: "Makan malam" },
  ] }, options);
  assert.match(html, /Client A/);
  assert.match(html, /Client B/);
  assert.doesNotMatch(html, /Client Snapshot|>NPWP<|>PPN \(|>PPh 23 \(/);
  assert.match(html, /VOID — DOKUMEN DIBATALKAN/);
  assert.match(html, /9 November 2026/);
});
