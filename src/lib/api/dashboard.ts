import type { DashboardKPI } from "@/types";
import { requestJson } from "./request";

export async function fetchDashboardKPI(): Promise<DashboardKPI> {
  return requestJson<DashboardKPI>("/api/dashboard/kpi", { cache: "no-store" });
}
