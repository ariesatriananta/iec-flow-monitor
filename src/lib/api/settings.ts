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
