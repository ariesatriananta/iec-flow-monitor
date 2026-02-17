import type { DashboardKPI, DashboardMonthlyDatum, StaffDashboardSummary } from "@/types";
import { requestJson } from "./request";

export async function fetchDashboardKPI(): Promise<DashboardKPI> {
  return requestJson<DashboardKPI>("/api/dashboard/kpi", { cache: "no-store" });
}

export async function fetchDashboardMonthly(): Promise<DashboardMonthlyDatum[]> {
  return requestJson<DashboardMonthlyDatum[]>("/api/dashboard/monthly", {
    cache: "no-store",
  });
}

export async function fetchStaffDashboardSummary(): Promise<StaffDashboardSummary> {
  return requestJson<StaffDashboardSummary>("/api/dashboard/staff", {
    cache: "no-store",
  });
}
