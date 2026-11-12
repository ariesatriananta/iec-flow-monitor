import { requestJson } from "./request";
import type { CreateOvertimePayload, OvertimeAction, OvertimeClientOption, OvertimeEvent, OvertimeQuery, OvertimeRequest } from "@/types/overtime";

type WireRequest = Omit<OvertimeRequest, "startsAt" | "endsAt" | "createdAt" | "updatedAt" | "workflowEvents"> & {
  startsAt: string; endsAt: string; createdAt: string; updatedAt: string;
  workflowEvents?: (Omit<OvertimeEvent, "createdAt"> & { createdAt: string })[];
};
const parseOvertime = (row: WireRequest): OvertimeRequest => ({
  ...row,
  startsAt: new Date(row.startsAt), endsAt: new Date(row.endsAt),
  createdAt: new Date(row.createdAt), updatedAt: new Date(row.updatedAt),
  workflowEvents: row.workflowEvents?.map((event) => ({ ...event, createdAt: new Date(event.createdAt) })),
});

export async function fetchOvertimeRequests(params: OvertimeQuery = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined) search.set(key, String(value));
  const result = await requestJson<{ items: WireRequest[]; total: number; limit: number; offset: number }>(`/api/overtime?${search}`, { cache: "no-store" });
  return { ...result, items: result.items.map(parseOvertime) };
}

export async function fetchOvertimeRequest(id: string) {
  return parseOvertime(await requestJson<WireRequest>(`/api/overtime/${encodeURIComponent(id)}`, { cache: "no-store" }));
}

export async function createOvertimeRequest(payload: CreateOvertimePayload) {
  return parseOvertime(await requestJson<WireRequest>("/api/overtime", { method: "POST", body: JSON.stringify(payload) }));
}

export async function decideOvertimeRequest(id: string, payload: { action: OvertimeAction; note?: string }) {
  return parseOvertime(await requestJson<WireRequest>(`/api/overtime/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) }));
}

export async function fetchOvertimeClientOptions(): Promise<OvertimeClientOption[]> {
  const result = await requestJson<{ items: (Omit<OvertimeClientOption, "latestContractCreatedAt"> & { latestContractCreatedAt: string })[] }>("/api/overtime/client-options", { cache: "no-store" });
  if (!result || !Array.isArray(result.items)) throw new Error("Format data client tidak valid. Silakan coba lagi atau hubungi Admin.");
  return result.items.map((row) => ({ ...row, latestContractCreatedAt: new Date(row.latestContractCreatedAt) }));
}

export async function downloadOvertimeExport(params: Omit<OvertimeQuery, "limit" | "offset">) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined) search.set(key, String(value));
  const response = await fetch(`/api/overtime/export?${search}`, { cache: "no-store" });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || "Gagal mengekspor pengajuan Overtime");
  }
  const blob = await response.blob();
  const filename = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "Overtime.xlsx";
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  // Defer revocation so browsers have time to start the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
