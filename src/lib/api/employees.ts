import type { Employee } from "@/types";
import { requestJson } from "@/lib/api/request";
import { parseEmployee } from "@/lib/api/parse";
import type { PaginatedResult } from "@/lib/api/pagination";

export async function fetchEmployees(params?: {
  limit?: number;
  offset?: number;
  q?: string;
}): Promise<PaginatedResult<Employee>> {
  const search = new URLSearchParams();
  if (params?.limit) search.set("limit", String(params.limit));
  if (params?.offset) search.set("offset", String(params.offset));
  if (params?.q) search.set("q", params.q);
  const query = search.toString();
  const url = query ? `/api/employees?${query}` : "/api/employees";
  const data = await requestJson<PaginatedResult<Employee>>(url, { cache: "no-store" });
  return {
    ...data,
    items: data.items.map(parseEmployee),
  };
}

export async function createEmployee(payload: {
  title?: string;
  department?: string;
  workLocation?: string;
  phone?: string;
  email?: string;
  isActive?: boolean;
}): Promise<Employee> {
  const data = await requestJson<Employee>("/api/employees", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return parseEmployee(data);
}

export async function updateEmployee(
  id: string,
  payload: Partial<{
    title: string;
    department: string;
    workLocation: string;
    phone: string;
    email: string;
    isActive: boolean;
  }>
): Promise<Employee> {
  const data = await requestJson<Employee>(`/api/employees/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return parseEmployee(data);
}
