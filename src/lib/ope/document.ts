import type { OpeDocument } from "../../types/ope";

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
}[character]!));

const currency = (value: number) => `Rp ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(value)}`;
const date = (value: Date | null) => value && Number.isFinite(value.getTime())
  ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(value)
  : "-";

/** Uses only the persisted document snapshot; preview and print share this HTML. */
export function buildOpeDocumentHtml(
  document: OpeDocument,
  options: { headerUrl: string; signerName: string },
): string {
  const businessTrip = document.type === "BUSINESS_TRIP";
  const title = businessTrip ? "OPE - BUSINESS TRIP" : "OPE - MEALS";
  const client = document.clientSnapshot;
  const npwpDigits = client?.npwp2?.replace(/\D/g, "") ?? "";
  const npwp = npwpDigits.length === 16
    ? npwpDigits.match(/.{4}/g)!.join(" ")
    : client?.npwp?.trim() || "-";
  const rows = (document.items ?? []).map((item, index) => businessTrip
    ? `<tr><td>${index + 1}</td><td class="text">${escapeHtml(item.employeeName || "-")}${item.description && item.description !== item.employeeName ? `<div class="item-description">${escapeHtml(item.description)}</div>` : ""}</td><td class="number">${escapeHtml(item.days ?? "-")}</td><td class="number">${escapeHtml(item.rate === null ? "-" : currency(item.rate))}</td><td class="number">${escapeHtml(currency(item.amount))}</td></tr>`
    : `<tr><td>${index + 1}</td><td class="text">${escapeHtml(date(item.expenseDate))}</td><td class="text">${escapeHtml(item.clientSnapshot?.name || "-")}</td><td class="text">${escapeHtml(item.description)}</td><td class="number">${escapeHtml(currency(item.amount))}</td></tr>`
  ).join("");
  const status = document.status === "DRAFT"
    ? '<div class="status draft">DRAFT — BELUM DITERBITKAN</div>'
    : document.status === "VOID"
      ? '<div class="status void">VOID — DOKUMEN DIBATALKAN</div>'
      : "";

  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} ${escapeHtml(document.documentNumber)}</title>
<style>
@page { size: A4; margin: 18mm; }
* { box-sizing: border-box; }
html { color-scheme: light; }
body { margin: 0; background: #e5e7eb; color: #111827; font: 12px/1.45 "Segoe UI", Arial, sans-serif; }
.paper { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 18mm; background: #fff; }
/* The existing letterhead is a full transparent A4 canvas: show its top and bottom separately. */
.header { display: block; width: 100%; height: 180px; object-fit: cover; object-position: top center; margin-bottom: 24px; }
.closing { break-inside: avoid; page-break-inside: avoid; }
.letterhead-footer { display: block; width: 100%; height: 100px; object-fit: cover; object-position: bottom center; margin-top: 10px; }
.top { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; margin-bottom: 24px; }
.client { flex: 1; min-width: 0; }
.text { white-space: pre-wrap; overflow-wrap: anywhere; }
.pic { margin-top: 8px; }
h1 { margin: 0; padding: 7px 12px; border: 1px solid #94a3b8; background: #e7eef8; color: #1e4e8c; font-size: 16px; letter-spacing: .5px; text-align: center; }
.status { margin-top: 8px; padding: 5px 8px; border: 1px solid currentColor; text-align: center; font-weight: 700; }
.draft { color: #92400e; } .void { color: #b91c1c; }
.meta { margin-bottom: 14px; width: 100%; border-collapse: collapse; }
.meta td { padding: 2px 0; vertical-align: top; }
.meta .label { width: 94px; } .meta .colon { width: 12px; }
.items { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 12px; }
.items th, .items td { padding: 8px 7px; vertical-align: top; border-bottom: 1px solid #94a3b8; }
.items th { background: #e7eef8; color: #1e4e8c; text-align: left; }
.items tbody tr:nth-child(even) { background: #f2f6fc; }
.items th.number, .number { text-align: right; font-variant-numeric: tabular-nums; }
.number { overflow-wrap: anywhere; }
.item-description { margin-top: 3px; color: #4b5563; }
thead { display: table-header-group; }
tr { break-inside: avoid; page-break-inside: avoid; }
.totals { width: 100%; border-collapse: collapse; margin-top: 0; break-inside: avoid; page-break-inside: avoid; }
.totals td { padding: 7px; border-bottom: 1px solid #94a3b8; text-align: right; }
.totals td:last-child { width: 31%; }
.grand-total { background: #e7eef8; font-weight: 700; }
.document-notes { margin-top: 18px; }
.document-notes p { margin: 4px 0 0; }
.payment { display: flex; gap: 18px; justify-content: space-between; margin-top: 16px; padding: 12px; border: 1px solid #94a3b8; border-radius: 8px; break-inside: avoid; page-break-inside: avoid; }
.bank { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.signature { width: 185px; flex-shrink: 0; text-align: right; }
.signer { margin-top: 100px; white-space: pre-wrap; overflow-wrap: anywhere; font-weight: 700; }
@media print {
  body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .paper { width: auto; min-height: 0; margin: 0; padding: 0; }
}
</style></head><body><main class="paper">
<img class="header" src="${escapeHtml(options.headerUrl)}" alt="Kop KAP Krisnawan, Nugroho &amp; Fahmy">
<div class="top">
${businessTrip ? `<div class="client"><strong class="text">${escapeHtml(client?.name || "-")}</strong><div class="text">${escapeHtml(client?.address || "-")}</div><div class="pic text">Up : ${escapeHtml(client?.picName || "-")}</div></div>` : ""}
<div><h1>${title}</h1>${status}</div>
</div>
<table class="meta" aria-label="Informasi dokumen"><tbody>
<tr><td class="label">No. Dokumen</td><td class="colon">:</td><td class="text">${escapeHtml(document.documentNumber)}</td></tr>
<tr><td>Tanggal</td><td>:</td><td>${escapeHtml(date(document.documentDate))}</td></tr>
${businessTrip ? `<tr><td>NPWP</td><td>:</td><td class="text">${escapeHtml(npwp)}</td></tr>` : ""}
<tr><td>Perihal</td><td>:</td><td class="text">${escapeHtml(document.subject)}</td></tr>
</tbody></table>
<table class="items" aria-label="Rincian ${businessTrip ? "Business Trip" : "Meals"}">
${businessTrip
    ? '<colgroup><col style="width:6%"><col style="width:31%"><col style="width:9%"><col style="width:25%"><col style="width:29%"></colgroup><thead><tr><th scope="col">No</th><th scope="col">Nama</th><th scope="col" class="number">Hari</th><th scope="col" class="number">Nilai (Rp)</th><th scope="col" class="number">Jumlah</th></tr></thead>'
    : '<colgroup><col style="width:6%"><col style="width:17%"><col style="width:23%"><col style="width:27%"><col style="width:27%"></colgroup><thead><tr><th scope="col">No</th><th scope="col">Tanggal</th><th scope="col">Client</th><th scope="col">Deskripsi</th><th scope="col" class="number">Nominal</th></tr></thead>'}
<tbody>${rows || '<tr><td colspan="5">Tidak ada rincian item.</td></tr>'}</tbody></table>
<table class="totals" aria-label="Total dokumen"><tbody>
<tr><td>SUBTOTAL</td><td>${escapeHtml(currency(document.subtotal))}</td></tr>
${document.ppnRate > 0 ? `<tr><td>PPN (${escapeHtml(document.ppnRate)}%)</td><td>${escapeHtml(currency(document.ppnAmount))}</td></tr>` : ""}
${document.pph23Rate > 0 ? `<tr><td>PPh 23 (${escapeHtml(document.pph23Rate)}%)</td><td>(${escapeHtml(currency(document.pph23Amount))})</td></tr>` : ""}
<tr class="grand-total"><td>TOTAL TAGIHAN</td><td>${escapeHtml(currency(document.total))}</td></tr>
</tbody></table>
${document.notes ? `<section class="document-notes"><strong>Catatan Dokumen:</strong><p class="text">${escapeHtml(document.notes)}</p></section>` : ""}
<div class="closing"><footer class="payment"><div class="bank"><strong>Catatan:</strong><div>Pembayaran dapat dilakukan dengan cara transfer kepada:</div><div>KAP KRISNAWAN, NUGROHO &amp; FAHMY</div><div>BANK MANDIRI</div><div>KCP JAKARTA LEBAK BULUS</div><div>No. Rekening 101-00-1469009-1</div><div>Bukti transfer email ke office.rasunasaid@knfdts.id</div></div><div class="signature"><div>Jakarta, ${escapeHtml(date(document.documentDate))}</div><div class="signer">${escapeHtml(options.signerName)}</div></div></footer>
<img class="letterhead-footer" src="${escapeHtml(options.headerUrl)}" alt="Keterangan keanggotaan IECnet"></div>
</main></body></html>`;
}
