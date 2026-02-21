import { and, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  attendanceRecords,
  businessTrips,
  leaveRequests,
  reimbursements,
  settingsApprovalFlow,
  workflowEvents,
} from "@/lib/db/schema";

type EmployeeDeletionRow = {
  id: string;
  isActive: boolean;
  hasLinkedUser: boolean;
};

export type EmployeeHardDeleteEligibility = {
  canHardDelete: boolean;
  reasons: string[];
};

const toCountMap = (
  rows: Array<{ employeeId: string | null; count: number | string }>
) => {
  const mapped = new Map<string, number>();
  for (const row of rows) {
    if (!row.employeeId) continue;
    mapped.set(row.employeeId, Number(row.count ?? 0));
  }
  return mapped;
};

export async function buildEmployeeHardDeleteEligibilityMap(
  db: ReturnType<typeof getDb>,
  employees: EmployeeDeletionRow[]
): Promise<Map<string, EmployeeHardDeleteEligibility>> {
  const result = new Map<string, EmployeeHardDeleteEligibility>();
  if (employees.length === 0) return result;

  const employeeIds = employees.map((row) => row.id);

  const [
    attendanceRows,
    leaveRows,
    tripRows,
    reimbursementRows,
    workflowEventRows,
    approvalFlowRows,
  ] = await Promise.all([
    db
      .select({
        employeeId: attendanceRecords.employeeId,
        count: sql<number>`count(*)`,
      })
      .from(attendanceRecords)
      .where(inArray(attendanceRecords.employeeId, employeeIds))
      .groupBy(attendanceRecords.employeeId),
    db
      .select({
        employeeId: leaveRequests.employeeId,
        count: sql<number>`count(*)`,
      })
      .from(leaveRequests)
      .where(inArray(leaveRequests.employeeId, employeeIds))
      .groupBy(leaveRequests.employeeId),
    db
      .select({
        employeeId: businessTrips.employeeId,
        count: sql<number>`count(*)`,
      })
      .from(businessTrips)
      .where(inArray(businessTrips.employeeId, employeeIds))
      .groupBy(businessTrips.employeeId),
    db
      .select({
        employeeId: reimbursements.employeeId,
        count: sql<number>`count(*)`,
      })
      .from(reimbursements)
      .where(inArray(reimbursements.employeeId, employeeIds))
      .groupBy(reimbursements.employeeId),
    db
      .select({
        employeeId: workflowEvents.actorEmployeeId,
        count: sql<number>`count(*)`,
      })
      .from(workflowEvents)
      .where(
        and(
          isNotNull(workflowEvents.actorEmployeeId),
          inArray(workflowEvents.actorEmployeeId, employeeIds)
        )
      )
      .groupBy(workflowEvents.actorEmployeeId),
    db
      .select({
        leaveApproverLevel1EmployeeId: settingsApprovalFlow.leaveApproverLevel1EmployeeId,
        leaveApproverLevel2EmployeeId: settingsApprovalFlow.leaveApproverLevel2EmployeeId,
        reimbursementApproverLevel1EmployeeId:
          settingsApprovalFlow.reimbursementApproverLevel1EmployeeId,
        reimbursementApproverLevel2EmployeeId:
          settingsApprovalFlow.reimbursementApproverLevel2EmployeeId,
        businessTripApproverLevel1EmployeeId:
          settingsApprovalFlow.businessTripApproverLevel1EmployeeId,
        businessTripApproverLevel2EmployeeId:
          settingsApprovalFlow.businessTripApproverLevel2EmployeeId,
      })
      .from(settingsApprovalFlow),
  ]);

  const attendanceCountByEmployeeId = toCountMap(attendanceRows);
  const leaveCountByEmployeeId = toCountMap(leaveRows);
  const tripCountByEmployeeId = toCountMap(tripRows);
  const reimbursementCountByEmployeeId = toCountMap(reimbursementRows);
  const workflowEventCountByEmployeeId = toCountMap(workflowEventRows);

  const approverEmployeeIds = new Set<string>();
  for (const row of approvalFlowRows) {
    if (row.leaveApproverLevel1EmployeeId) {
      approverEmployeeIds.add(row.leaveApproverLevel1EmployeeId);
    }
    if (row.leaveApproverLevel2EmployeeId) {
      approverEmployeeIds.add(row.leaveApproverLevel2EmployeeId);
    }
    if (row.reimbursementApproverLevel1EmployeeId) {
      approverEmployeeIds.add(row.reimbursementApproverLevel1EmployeeId);
    }
    if (row.reimbursementApproverLevel2EmployeeId) {
      approverEmployeeIds.add(row.reimbursementApproverLevel2EmployeeId);
    }
    if (row.businessTripApproverLevel1EmployeeId) {
      approverEmployeeIds.add(row.businessTripApproverLevel1EmployeeId);
    }
    if (row.businessTripApproverLevel2EmployeeId) {
      approverEmployeeIds.add(row.businessTripApproverLevel2EmployeeId);
    }
  }

  for (const employee of employees) {
    const reasons: string[] = [];
    if (employee.hasLinkedUser) {
      reasons.push("Masih terhubung ke akun user login.");
    }
    if ((attendanceCountByEmployeeId.get(employee.id) ?? 0) > 0) {
      reasons.push("Sudah memiliki riwayat absensi.");
    }
    if ((leaveCountByEmployeeId.get(employee.id) ?? 0) > 0) {
      reasons.push("Sudah memiliki pengajuan cuti.");
    }
    if ((tripCountByEmployeeId.get(employee.id) ?? 0) > 0) {
      reasons.push("Sudah memiliki pengajuan perjalanan dinas.");
    }
    if ((reimbursementCountByEmployeeId.get(employee.id) ?? 0) > 0) {
      reasons.push("Sudah memiliki pengajuan reimbursement.");
    }
    if ((workflowEventCountByEmployeeId.get(employee.id) ?? 0) > 0) {
      reasons.push("Sudah tercatat pada riwayat aksi workflow.");
    }
    if (approverEmployeeIds.has(employee.id)) {
      reasons.push("Masih ditetapkan sebagai approver di Approval Flow.");
    }

    result.set(employee.id, {
      canHardDelete: reasons.length === 0,
      reasons,
    });
  }

  return result;
}
