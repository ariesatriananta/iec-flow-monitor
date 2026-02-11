import type { BusinessTrip } from "@/types";
import { requestJson } from "@/lib/api/request";
import { parseBusinessTrip } from "@/lib/api/parse";

export async function fetchBusinessTrips(status?: string): Promise<BusinessTrip[]> {
  const url = status ? `/api/business-trip?status=${encodeURIComponent(status)}` : "/api/business-trip";
  const data = await requestJson<BusinessTrip[]>(url, { cache: "no-store" });
  return data.map(parseBusinessTrip);
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
