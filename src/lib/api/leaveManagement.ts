import type { LeaveRequest } from "@/types";
import { requestJson } from "@/lib/api/request";
import { parseLeaveRequest } from "@/lib/api/parse";
import type { PaginatedResult } from "@/lib/api/pagination";

export async function fetchLeaveRequests(params?: {
  status?: string;
  limit?: number;
  offset?: number;
  q?: string;
}): Promise<PaginatedResult<LeaveRequest>> {
  const search = new URLSearchParams();
  if (params?.status) search.set("status", params.status);
  if (params?.limit) search.set("limit", String(params.limit));
  if (params?.offset) search.set("offset", String(params.offset));
  if (params?.q) search.set("q", params.q);
  const query = search.toString();
  const url = query ? `/api/leave-management?${query}` : "/api/leave-management";
  const data = await requestJson<PaginatedResult<LeaveRequest>>(url, {
    cache: "no-store",
  });
  return {
    ...data,
    items: data.items.map(parseLeaveRequest),
  };
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
