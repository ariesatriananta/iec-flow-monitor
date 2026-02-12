import type { Employee } from "@/types";
import { requestJson } from "@/lib/api/request";
import { parseEmployee } from "@/lib/api/parse";

export async function fetchEmployees(): Promise<Employee[]> {
  const data = await requestJson<Employee[]>("/api/employees", { cache: "no-store" });
  return data.map(parseEmployee);
}

export async function createEmployee(payload: {
  userId: string;
  employeeCode: string;
  position?: string;
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
    employeeCode: string;
    position: string;
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
