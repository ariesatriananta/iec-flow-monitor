import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { PgDialect } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { buildOvertimeWorkbook, type OvertimeExportRow } from "./export";
import { overtimeWhere } from "./query";
import { loadOvertimeExport } from "./export-server";
import { notificationPath } from "../notification-routing";

const row: OvertimeExportRow = {
  id: "request-1", employeeCode: "EMP01", employeeName: "Employee", clientName: "Snapshot Client",
  overtimeDate: "2026-11-12", startTime: "22:00", endTime: "02:00", endsNextDay: true,
  durationMinutes: 240, description: '=HYPERLINK("https://example.invalid")', status: "APPROVED",
  approverLevel1Name: "Snapshot L1", approverLevel2Name: "Snapshot L2", createdAt: new Date("2026-11-12T11:00:00Z"),
};
test("export includes all rows beyond the list page and preserves numeric durations", () => {
  const rows = Array.from({ length: 41 }, (_, i) => ({ ...row, id: `request-${i}` }));
  const workbook = buildOvertimeWorkbook(rows, [], { scope: "all" });
  const parsed = XLSX.read(XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }), { type: "buffer" });
  const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(parsed.Sheets.Lembur);
  assert.equal(data.length, 41);
  assert.equal(data[40].No, 41);
  assert.equal(data[0]["Durasi (Menit)"], 240);
  assert.equal(data[0]["Durasi (Jam:Menit)"], "4:00");
  assert.equal(data[0]["Selesai Hari Berikutnya"], "Ya");
  assert.equal(parsed.Sheets.Lembur.M2.t, "s");
  assert.equal(parsed.Sheets.Lembur.M2.f, undefined, "untrusted descriptions are text, never spreadsheet formulas");
});
test("export uses snapshot names, both decisions and WIB times, without mixing other requests", () => {
  const time = new Date("2026-11-12T18:00:00Z");
  const workbook = buildOvertimeWorkbook([row], [
    { entityId: row.id, level: 1, action: "APPROVE", note: "L1 note", createdAt: time },
    { entityId: row.id, level: 2, action: "APPROVE", note: "L2 note", createdAt: time },
    { entityId: "different", level: 2, action: "REJECT", note: "Private other note", createdAt: time },
  ], { scope: "all", fromDate: "2026-11-01", status: "APPROVED" });
  const [data] = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.Lembur);
  assert.equal(data.Client, "Snapshot Client");
  assert.equal(data["Approver Level 1"], "Snapshot L1");
  assert.equal(data["Keputusan Level 2"], "Disetujui");
  assert.equal(data["Catatan Level 2"], "L2 note");
  assert.match(String(data["Waktu Keputusan Level 1"]), /13 Nov 2026.*01[.:]00.*WIB/);
  const metadata = XLSX.utils.sheet_to_json(workbook.Sheets.Filter);
  assert.ok(JSON.stringify(metadata).includes("2026-11-01"));
});
test("scope constraints stay ANDed with extra filters for both export and list", () => {
  const dialect = new PgDialect();
  const compiled = dialect.sqlToQuery(overtimeWhere({ role: "STAFF", employeeId: "owner" }, { scope: "mine", employeeId: "other", status: "APPROVED" })!);
  assert.deepEqual(compiled.params, ["owner", "APPROVED", "other"]);
  assert.match(compiled.sql, / and /);
  const emptyIdentity = dialect.sqlToQuery(overtimeWhere({ role: "STAFF", employeeId: null }, { scope: "approval" })!);
  assert.match(emptyIdentity.sql, /false/);
  assert.throws(() => overtimeWhere({ role: "STAFF", employeeId: "owner" }, { scope: "all" }));
  assert.equal(dialect.sqlToQuery(overtimeWhere({ role: "ADMIN", employeeId: null }, { scope: "all" }) ?? sql`true`).sql, "true");
});
test("Staff export is denied before touching any database", async () => {
  await assert.rejects(loadOvertimeExport({ id: "staff", role: "STAFF", employeeId: "owner", username: "staff", name: "Staff", isActive: true }, {}), /Hanya Admin/);
});
test("notification routing adds overtime without changing HR routes", () => {
  for (const [type, path] of Object.entries({ OVERTIME: "/overtime", LEAVE: "/leave-management", BUSINESS_TRIP: "/business-trip", REIMBURSEMENT: "/reimbursement" })) {
    assert.equal(notificationPath({ entityType: type, entityId: "request & 1", id: "notif" }), `${path}?entityId=request+%26+1&notif=notif`);
  }
  assert.equal(notificationPath({ entityType: "UNKNOWN", id: "notif" }), "/dashboard");
});
