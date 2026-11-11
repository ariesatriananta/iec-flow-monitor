import test from "node:test";
import assert from "node:assert/strict";
import { calculateOvertimePeriod, canReadOvertimeRequest, createOvertimeSchema, dateOnlySchema, decisionSchema, listOvertimeSchema, overtimePeriodsOverlap, resolveOvertimeDecision } from "./validation";

const input = { clientId: "client", overtimeDate: "2026-11-12", startTime: "18:00", endTime: "21:30", endsNextDay: false, description: "Audit" };
const row = { employeeId: "owner", approverLevel1EmployeeId: "l1", approverLevel2EmployeeId: "l2", status: "SUBMITTED" };
test("WIB times have stable UTC and minute duration", () => {
  const result = calculateOvertimePeriod(createOvertimeSchema.parse(input));
  assert.equal(result.startsAt.toISOString(), "2026-11-12T11:00:00.000Z");
  assert.equal(result.durationMinutes, 210);
});
test("overnight calculates end on next WIB day", () => {
  const result = calculateOvertimePeriod(createOvertimeSchema.parse({ ...input, startTime: "22:00", endTime: "02:00", endsNextDay: true }));
  assert.equal(result.durationMinutes, 240);
  assert.equal(result.endsAt.toISOString(), "2026-11-12T19:00:00.000Z");
});
test("24:00 normalizes once with either flag", () => {
  for (const endsNextDay of [false, true]) {
    const result = calculateOvertimePeriod(createOvertimeSchema.parse({ ...input, endTime: "24:00", endsNextDay }));
    assert.equal(result.durationMinutes, 360);
    assert.equal(result.endsNextDay, true);
  }
});
test("valid real dates only; historical and future accepted", () => {
  for (const value of ["0000-01-01", "2026-02-29", "2026-04-31", "2026-1-01", "bad"]) assert.equal(dateOnlySchema.safeParse(value).success, false);
  for (const value of ["2024-02-29", "2020-01-01", "2030-11-12"]) assert.equal(dateOnlySchema.safeParse(value).success, true);
});
test("positive duration capped at 24h", () => {
  for (const change of [{ endTime: "18:00" }, { endTime: "17:00" }, { endTime: "19:00", endsNextDay: true }]) assert.equal(createOvertimeSchema.safeParse({ ...input, ...change }).success, false);
  assert.equal(createOvertimeSchema.safeParse({ ...input, endTime: "18:00", endsNextDay: true }).success, true);
});
test("reject malformed times and spoofed identity/status/total", () => {
  for (const change of [{ startTime: "24:00" }, { endTime: "23:60" }, { endsNextDay: "false" }, { employeeId: "other" }, { status: "APPROVED" }, { durationMinutes: 1 }, { description: "  " }]) assert.equal(createOvertimeSchema.safeParse({ ...input, ...change }).success, false);
});
test("owner and assigned approvers read, unrelated staff denied, admin reads", () => {
  for (const employeeId of ["owner", "l1", "l2"]) assert.equal(canReadOvertimeRequest(row, { role: "STAFF", employeeId }), true);
  assert.equal(canReadOvertimeRequest(row, { role: "STAFF", employeeId: "other" }), false);
  assert.equal(canReadOvertimeRequest(row, { role: "STAFF", employeeId: null }), false);
  assert.equal(canReadOvertimeRequest(row, { role: "ADMIN", employeeId: null }), true);
});
test("two sequential levels, no level skipping or admin bypass", () => {
  assert.deepEqual(resolveOvertimeDecision(row, "l1", "APPROVE"), { status: "WAITING_LEVEL_2", level: 1 });
  assert.deepEqual(resolveOvertimeDecision({ ...row, status: "WAITING_LEVEL_2" }, "l2", "APPROVE"), { status: "APPROVED", level: 2 });
  for (const employeeId of ["l2", "owner", "admin", null]) assert.throws(() => resolveOvertimeDecision(row, employeeId, "APPROVE"));
});
test("self approval allowed but level one still advances to level two", () => {
  assert.equal(resolveOvertimeDecision({ ...row, approverLevel1EmployeeId: "owner" }, "owner", "APPROVE").status, "WAITING_LEVEL_2");
});
test("rejection requires reason and is available at either assigned level", () => {
  assert.equal(decisionSchema.safeParse({ action: "REJECT", note: " " }).success, false);
  assert.equal(decisionSchema.safeParse({ action: "REJECT", note: "Tidak sesuai" }).success, true);
  assert.equal(resolveOvertimeDecision(row, "l1", "REJECT").status, "REJECTED");
  assert.equal(resolveOvertimeDecision({ ...row, status: "WAITING_LEVEL_2" }, "l2", "REJECT").status, "REJECTED");
});
test("only owner cancels pending, terminal requests cannot be processed twice", () => {
  assert.equal(resolveOvertimeDecision(row, "owner", "CANCEL").status, "CANCELLED");
  assert.throws(() => resolveOvertimeDecision(row, "l1", "CANCEL"));
  for (const status of ["APPROVED", "REJECTED", "CANCELLED"]) assert.throws(() => resolveOvertimeDecision({ ...row, status }, "l1", "APPROVE"));
});
test("half open intervals: adjacent allowed, cross-midnight overlap found", () => {
  const first = calculateOvertimePeriod({ ...input, startTime: "22:00", endTime: "02:00", endsNextDay: true });
  const adjacent = calculateOvertimePeriod({ ...input, overtimeDate: "2026-11-13", startTime: "02:00", endTime: "03:00" });
  const overlap = calculateOvertimePeriod({ ...input, overtimeDate: "2026-11-13", startTime: "01:59", endTime: "03:00" });
  assert.equal(overtimePeriodsOverlap(first, adjacent), false);
  assert.equal(overtimePeriodsOverlap(first, overlap), true);
});
test("list bounded pagination and ordered date filters", () => {
  assert.equal(listOvertimeSchema.parse({}).scope, "mine");
  for (const value of [{ limit: 101 }, { offset: -1 }, { scope: "unknown" }, { fromDate: "2026-11-13", toDate: "2026-11-12" }]) assert.equal(listOvertimeSchema.safeParse(value).success, false);
});
