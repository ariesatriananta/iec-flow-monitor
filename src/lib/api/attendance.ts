import type { AttendanceRecord } from "@/types";
import { requestJson } from "@/lib/api/request";
import { parseAttendanceRecord } from "@/lib/api/parse";
import type { PaginatedResult } from "@/lib/api/pagination";

export async function fetchAttendance(params?: {
  userId?: string;
  from?: string;
  to?: string;
  status?: string;
  limit?: number;
  offset?: number;
  q?: string;
}): Promise<PaginatedResult<AttendanceRecord>> {
  const search = new URLSearchParams();
  if (params?.userId) search.set("userId", params.userId);
  if (params?.from) search.set("from", params.from);
  if (params?.to) search.set("to", params.to);
  if (params?.status) search.set("status", params.status);
  if (params?.limit) search.set("limit", String(params.limit));
  if (params?.offset) search.set("offset", String(params.offset));
  if (params?.q) search.set("q", params.q);
  const query = search.toString();
  const url = query ? `/api/attendance?${query}` : "/api/attendance";
  const data = await requestJson<PaginatedResult<AttendanceRecord>>(url, {
    cache: "no-store",
  });
  return {
    ...data,
    items: data.items.map(parseAttendanceRecord),
  };
}

export async function submitAttendance(payload: {
  action: "CHECK_IN" | "CHECK_OUT";
  location?: string;
  notes?: string;
  userId?: string;
}): Promise<AttendanceRecord> {
  const data = await requestJson<AttendanceRecord>("/api/attendance", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return parseAttendanceRecord(data);
}
