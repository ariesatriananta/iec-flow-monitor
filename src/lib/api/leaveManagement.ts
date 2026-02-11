import type { LeaveRequest } from "@/types";
import { requestJson } from "@/lib/api/request";
import { parseLeaveRequest } from "@/lib/api/parse";

export async function fetchLeaveRequests(status?: string): Promise<LeaveRequest[]> {
  const url = status ? `/api/leave-management?status=${encodeURIComponent(status)}` : "/api/leave-management";
  const data = await requestJson<LeaveRequest[]>(url, { cache: "no-store" });
  return data.map(parseLeaveRequest);
}

export async function createLeaveRequest(payload: {
  leaveType: string;
  reason: string;
  startDate: string;
  endDate: string;
}): Promise<LeaveRequest> {
  const data = await requestJson<LeaveRequest>("/api/leave-management", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return parseLeaveRequest(data);
}

export async function updateLeaveRequest(
  id: string,
  payload: Record<string, unknown>
): Promise<LeaveRequest> {
  const data = await requestJson<LeaveRequest>(`/api/leave-management/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return parseLeaveRequest(data);
}
