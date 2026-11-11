import test from "node:test";
import assert from "node:assert/strict";
import { planOvertimeNotifications, resolveOvertimeNotificationRecipients } from "./notification-policy";

const row = { employeeId: "owner", employeeName: "Nama Pengaju", overtimeDate: "2026-11-12", approverLevel1EmployeeId: "l1", approverLevel2EmployeeId: "l2", status: "SUBMITTED" };

test("submit targets snapshot L1 only, including self-approval", () => {
  assert.deepEqual(planOvertimeNotifications(row, null).map(plan => plan.employeeId), ["l1"]);
  assert.deepEqual(planOvertimeNotifications({ ...row, approverLevel1EmployeeId: "owner" }, null).map(plan => plan.employeeId), ["owner"]);
});
test("L1 approval targets L2 and informs owner without duplicate self-approval notice", () => {
  assert.deepEqual(planOvertimeNotifications({ ...row, status: "WAITING_LEVEL_2" }, "SUBMITTED").map(plan => plan.employeeId), ["l2", "owner"]);
  const plans = planOvertimeNotifications({ ...row, approverLevel2EmployeeId: "owner", status: "WAITING_LEVEL_2" }, "SUBMITTED");
  assert.equal(plans.length, 1);
  assert.equal(plans[0].type, "OVERTIME_WAITING_LEVEL_2");
});
test("final approval and rejection notify owner only", () => {
  for (const [fromStatus, status] of [["WAITING_LEVEL_2", "APPROVED"], ["SUBMITTED", "REJECTED"], ["WAITING_LEVEL_2", "REJECTED"]]) {
    assert.deepEqual(planOvertimeNotifications({ ...row, status }, fromStatus).map(plan => plan.employeeId), ["owner"]);
  }
});
test("cancel informs current level and prior L1, not cancelling owner or unused L2", () => {
  assert.deepEqual(planOvertimeNotifications({ ...row, status: "CANCELLED" }, "SUBMITTED").map(plan => plan.employeeId), ["l1"]);
  assert.deepEqual(planOvertimeNotifications({ ...row, status: "CANCELLED" }, "WAITING_LEVEL_2").map(plan => plan.employeeId), ["l1", "l2"]);
  assert.deepEqual(planOvertimeNotifications({ ...row, status: "CANCELLED", approverLevel1EmployeeId: "owner" }, "WAITING_LEVEL_2").map(plan => plan.employeeId), ["l2"]);
});
test("recipient resolution excludes inactive/unassigned accounts and deduplicates user IDs", () => {
  const plans = planOvertimeNotifications(row, null);
  const accounts = [{ id: "active", employeeId: "l1", isActive: true }, { id: "inactive", employeeId: "l1", isActive: false }, { id: "foreign", employeeId: "other", isActive: true }, { id: "admin", employeeId: null, isActive: true }, { id: "second-account", employeeId: "l1", isActive: true }];
  assert.deepEqual(resolveOvertimeNotificationRecipients([...plans, ...plans], [...accounts, accounts[0]]).map(item => item.userId), ["active", "second-account"]);
});
test("unsupported or final repeat transitions do not create notices", () => {
  assert.deepEqual(planOvertimeNotifications({ ...row, status: "APPROVED" }, "APPROVED"), []);
  assert.deepEqual(planOvertimeNotifications(row, "SUBMITTED"), []);
});
