import { requestJson } from "./request";

export interface SettingsPayload {
  companyName: string;
  companyAddress?: string | null;
  companyPhone?: string | null;
  companyEmail?: string | null;
  companyLogoUrl?: string | null;
  numberingPrefix: string;
  numberingReset: "YEARLY" | "MONTHLY";
  defaultPpnRate: number;
  defaultSignerName: string;
}

export interface ApprovalFlowPayload {
  leaveApprovalLevels: 1 | 2;
  leaveApproverLevel1EmployeeId: string | null;
  leaveApproverLevel2EmployeeId: string | null;
  reimbursementApprovalLevels: 1 | 2;
  reimbursementApproverLevel1EmployeeId: string | null;
  reimbursementApproverLevel2EmployeeId: string | null;
  businessTripApprovalLevels: 1 | 2;
  businessTripApproverLevel1EmployeeId: string | null;
  businessTripApproverLevel2EmployeeId: string | null;
}

export interface WorkSchedulePayload {
  timezone: string;
  checkInDeadline: string;
  workStart: string;
  workEnd: string;
  allowFlexibleCheckout: boolean;
  workingDays: {
    monday: boolean;
    tuesday: boolean;
    wednesday: boolean;
    thursday: boolean;
    friday: boolean;
    saturday: boolean;
    sunday: boolean;
  };
}

export interface PositionLimitPayload {
  id: string;
  position: string;
  monthlyLimit: number;
}

export interface ReimbursementLimitPayload {
  categoryLimit: {
    transport: number;
    meal: number;
    other: number;
  };
  positionLimit: PositionLimitPayload[];
  maxFilesPerRequest: number;
  maxFileSizeMb: number;
}

export async function fetchSettings(): Promise<SettingsPayload | null> {
  return requestJson<SettingsPayload | null>("/api/settings", {
    cache: "no-store",
  });
}

export async function updateSettings(
  payload: SettingsPayload
): Promise<SettingsPayload> {
  return requestJson<SettingsPayload>("/api/settings", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function fetchApprovalFlowSettings(): Promise<ApprovalFlowPayload> {
  return requestJson<ApprovalFlowPayload>("/api/settings/approval-flow", {
    cache: "no-store",
  });
}

export async function updateApprovalFlowSettings(
  payload: ApprovalFlowPayload
): Promise<ApprovalFlowPayload> {
  return requestJson<ApprovalFlowPayload>("/api/settings/approval-flow", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function fetchWorkScheduleSettings(): Promise<WorkSchedulePayload> {
  return requestJson<WorkSchedulePayload>("/api/settings/work-schedule", {
    cache: "no-store",
  });
}

export async function updateWorkScheduleSettings(
  payload: WorkSchedulePayload
): Promise<WorkSchedulePayload> {
  return requestJson<WorkSchedulePayload>("/api/settings/work-schedule", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function fetchReimbursementLimitSettings(): Promise<ReimbursementLimitPayload> {
  return requestJson<ReimbursementLimitPayload>(
    "/api/settings/reimbursement-limit",
    {
      cache: "no-store",
    }
  );
}

export async function updateReimbursementLimitSettings(
  payload: ReimbursementLimitPayload
): Promise<ReimbursementLimitPayload> {
  return requestJson<ReimbursementLimitPayload>("/api/settings/reimbursement-limit", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
