import type { BusinessTrip } from "@/types";
import { requestJson } from "@/lib/api/request";
import { parseBusinessTrip } from "@/lib/api/parse";
import type { PaginatedResult } from "@/lib/api/pagination";

export async function fetchBusinessTrips(params?: {
  status?: string;
  limit?: number;
  offset?: number;
  q?: string;
}): Promise<PaginatedResult<BusinessTrip>> {
  const search = new URLSearchParams();
  if (params?.status) search.set("status", params.status);
  if (params?.limit) search.set("limit", String(params.limit));
  if (params?.offset) search.set("offset", String(params.offset));
  if (params?.q) search.set("q", params.q);
  const query = search.toString();
  const url = query ? `/api/business-trip?${query}` : "/api/business-trip";
  const data = await requestJson<PaginatedResult<BusinessTrip>>(url, {
    cache: "no-store",
  });
  return {
    ...data,
    items: data.items.map(parseBusinessTrip),
  };
}

export async function createBusinessTrip(payload: {
  destinationCity: string;
  companyName: string;
  purpose?: string;
  startDate: string;
  endDate: string;
}): Promise<BusinessTrip> {
  const data = await requestJson<BusinessTrip>("/api/business-trip", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return parseBusinessTrip(data);
}

export async function updateBusinessTrip(
  id: string,
  payload: Record<string, unknown>
): Promise<BusinessTrip> {
  const data = await requestJson<BusinessTrip>(`/api/business-trip/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return parseBusinessTrip(data);
}

export async function deleteBusinessTrip(id: string): Promise<void> {
  await requestJson<{ ok: boolean }>(`/api/business-trip/${id}`, {
    method: "DELETE",
  });
}
