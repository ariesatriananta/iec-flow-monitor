export type OvertimeStatus = "SUBMITTED" | "WAITING_LEVEL_2" | "APPROVED" | "REJECTED" | "CANCELLED";
export type OvertimeScope = "mine" | "approval" | "related" | "all";
export type OvertimeAction = "APPROVE" | "REJECT" | "CANCEL";

export interface OvertimeRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  clientId: string | null;
  clientName: string;
  /** Calendar date in Asia/Jakarta; keep YYYY-MM-DD as a string. */
  overtimeDate: string;
  startTime: string;
  endTime: string;
  endsNextDay: boolean;
  startsAt: Date;
  endsAt: Date;
  durationMinutes: number;
  description: string;
  status: OvertimeStatus;
  approverLevel1EmployeeId: string;
  approverLevel1Name: string;
  approverLevel2EmployeeId: string;
  approverLevel2Name: string;
  createdAt: Date;
  updatedAt: Date;
  permissions: { canCancel: boolean; canApprove: boolean };
  workflowEvents?: OvertimeEvent[];
}

export interface OvertimeEvent {
  id: string;
  module: string;
  entityId: string;
  level: number | null;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  actorUserId: string | null;
  actorEmployeeId: string | null;
  actorName: string | null;
  createdAt: Date;
}

export interface CreateOvertimePayload {
  clientId: string;
  overtimeDate: string;
  startTime: string;
  endTime: string;
  endsNextDay: boolean;
  description: string;
}

export interface OvertimeClientOption {
  id: string;
  name: string;
  code: string;
  latestContractCreatedAt: Date;
}

export interface OvertimeQuery {
  scope?: OvertimeScope;
  status?: OvertimeStatus;
  fromDate?: string;
  toDate?: string;
  clientId?: string;
  employeeId?: string;
  limit?: number;
  offset?: number;
}
