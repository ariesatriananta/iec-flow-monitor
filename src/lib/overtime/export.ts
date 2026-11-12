import * as XLSX from "xlsx";
import type { OvertimeQuery, OvertimeStatus } from "@/types/overtime";

export interface OvertimeExportRow {
  id: string; employeeCode: string; employeeName: string; clientName: string;
  overtimeDate: string; startTime: string; endTime: string; endsNextDay: boolean;
  durationMinutes: number; description: string; status: string;
  approverLevel1Name: string; approverLevel2Name: string; createdAt: Date;
}
export interface OvertimeExportEvent {
  entityId: string; action: string; level: number | null; note: string | null; createdAt: Date;
}
const statuses: Record<OvertimeStatus, string> = {
  SUBMITTED: "Menunggu Level 1", WAITING_LEVEL_2: "Menunggu Level 2",
  APPROVED: "Disetujui", REJECTED: "Ditolak", CANCELLED: "Dibatalkan",
};
const wib = (date: Date) => new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short",
}).format(date) + " WIB";

export function buildOvertimeWorkbook(rows: OvertimeExportRow[], events: OvertimeExportEvent[], query: OvertimeQuery, generatedAt = new Date()) {
  // Group once instead of repeatedly scanning all events for every exported row.
  const history = new Map<string, OvertimeExportEvent[]>();
  for (const event of events) {
    const list = history.get(event.entityId) ?? [];
    list.push(event); history.set(event.entityId, list);
  }
  const details = rows.map((row, index) => {
    const rowEvents = history.get(row.id) ?? [];
    const decision = (level: number) => rowEvents.filter(event => event.level === level && ["APPROVE", "REJECT"].includes(event.action)).at(-1);
    const first = decision(1), second = decision(2);
    const cancelled = rowEvents.filter(event => event.action === "CANCEL").at(-1);
    const decisionLabel = (event?: OvertimeExportEvent) => event ? event.action === "APPROVE" ? "Disetujui" : "Ditolak" : "-";
    return {
      No: index + 1, "ID Pengajuan": row.id, "Kode Karyawan": row.employeeCode,
      "Nama Karyawan": row.employeeName, Tanggal: row.overtimeDate, Client: row.clientName,
      "Jam Mulai (WIB)": row.startTime, "Jam Selesai (WIB)": row.endTime,
      "Selesai Hari Berikutnya": row.endsNextDay ? "Ya" : "Tidak",
      "Durasi (Menit)": row.durationMinutes,
      "Durasi (Jam:Menit)": `${Math.floor(row.durationMinutes / 60)}:${String(row.durationMinutes % 60).padStart(2, "0")}`,
      Status: statuses[row.status as OvertimeStatus] ?? row.status, "Keterangan Overtime": row.description,
      "Approver Level 1": row.approverLevel1Name, "Keputusan Level 1": decisionLabel(first),
      "Waktu Keputusan Level 1": first ? wib(first.createdAt) : "-", "Catatan Level 1": first?.note ?? "-",
      "Approver Level 2": row.approverLevel2Name, "Keputusan Level 2": decisionLabel(second),
      "Waktu Keputusan Level 2": second ? wib(second.createdAt) : "-", "Catatan Level 2": second?.note ?? "-",
      "Waktu Pembatalan": cancelled ? wib(cancelled.createdAt) : "-", "Catatan Pembatalan": cancelled?.note ?? "-",
      "Diajukan Pada": wib(row.createdAt),
    };
  });
  const worksheet = XLSX.utils.json_to_sheet(details);
  worksheet["!cols"] = [6, 38, 18, 30, 14, 35, 18, 18, 24, 18, 22, 22, 60, 30, 22, 30, 45, 30, 22, 30, 45, 30, 45, 30].map(wch => ({ wch }));
  worksheet["!autofilter"] = { ref: worksheet["!ref"] ?? "A1:X1" };
  const scopes = { mine: "Pengajuan Saya", approval: "Perlu Persetujuan Saya", related: "Riwayat Persetujuan", all: "Semua Pengajuan" };
  const filters = XLSX.utils.aoa_to_sheet([
    ["Informasi", "Nilai"], ["Diekspor Pada", wib(generatedAt)],
    ["Pilihan Daftar", scopes[query.scope ?? "mine"]], ["Status", query.status ? statuses[query.status] : "Semua Status"],
    ["Dari Tanggal", query.fromDate ?? "Semua"], ["Sampai Tanggal", query.toDate ?? "Semua"],
    ["Filter ID Client", query.clientId ?? "Semua"], ["Filter ID Karyawan", query.employeeId ?? "Semua"],
    ["Jumlah Pengajuan", rows.length], ["Zona Waktu", "Asia/Jakarta (WIB)"],
    ["Catatan", "Seluruh hasil filter, bukan hanya halaman aktif. Durasi bukan nilai upah Overtime."],
  ]);
  filters["!cols"] = [{ wch: 24 }, { wch: 95 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Overtime");
  XLSX.utils.book_append_sheet(workbook, filters, "Filter");
  return workbook;
}
