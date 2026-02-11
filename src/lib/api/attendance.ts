import type { AttendanceRecord } from "@/types";
import { requestJson } from "@/lib/api/request";
import { parseAttendanceRecord } from "@/lib/api/parse";

export async function fetchAttendance(params?: {
  userId?: string;
  from?: string;
  to?: string;
}): Promise<AttendanceRecord[]> {
  const search = new URLSearchParams();
  if (params?.userId) search.set("userId", params.userId);
  if (params?.from) search.set("from", params.from);
  if (params?.to) search.set("to", params.to);
  const query = search.toString();
  const url = query ? `/api/attendance?${query}` : "/api/attendance";
  const data = await requestJson<AttendanceRecord[]>(url, { cache: "no-store" });
  return data.map(parseAttendanceRecord);
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
