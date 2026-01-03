import type { DashboardKPI, DashboardMonthlyDatum } from "@/types";
import { requestJson } from "./request";

export async function fetchDashboardKPI(): Promise<DashboardKPI> {
  return requestJson<DashboardKPI>("/api/dashboard/kpi", { cache: "no-store" });
}

export async function fetchDashboardMonthly(): Promise<DashboardMonthlyDatum[]> {
  return requestJson<DashboardMonthlyDatum[]>("/api/dashboard/monthly", {
    cache: "no-store",
  });
}
