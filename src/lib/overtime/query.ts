import { and, eq, gte, lte, or, sql, type SQL } from "drizzle-orm";
import { overtimeRequests } from "@/lib/db/schema";
import type { SessionUser } from "@/lib/auth/server";
import type { OvertimeQuery } from "@/types/overtime";
import { OvertimeError } from "./validation";

/** Shared by list and export: filters must never expand the selected access scope. */
export function overtimeWhere(user: Pick<SessionUser, "role" | "employeeId">, query: OvertimeQuery) {
  const conditions: SQL[] = [];
  const employeeId = user.employeeId;
  const scope = query.scope ?? "mine";
  if (scope === "all") {
    if (user.role !== "ADMIN") throw new OvertimeError("Hanya Admin yang dapat melihat semua pengajuan", 403);
  } else if (!employeeId) conditions.push(sql`false`);
  else if (scope === "mine") conditions.push(eq(overtimeRequests.employeeId, employeeId));
  else if (scope === "related") conditions.push(or(eq(overtimeRequests.approverLevel1EmployeeId, employeeId), eq(overtimeRequests.approverLevel2EmployeeId, employeeId))!);
  else conditions.push(or(and(eq(overtimeRequests.status, "SUBMITTED"), eq(overtimeRequests.approverLevel1EmployeeId, employeeId)), and(eq(overtimeRequests.status, "WAITING_LEVEL_2"), eq(overtimeRequests.approverLevel2EmployeeId, employeeId)))!);
  if (query.status) conditions.push(eq(overtimeRequests.status, query.status));
  if (query.fromDate) conditions.push(gte(overtimeRequests.overtimeDate, query.fromDate));
  if (query.toDate) conditions.push(lte(overtimeRequests.overtimeDate, query.toDate));
  if (query.clientId) conditions.push(eq(overtimeRequests.clientId, query.clientId));
  if (query.employeeId) conditions.push(eq(overtimeRequests.employeeId, query.employeeId));
  return and(...conditions);
}
