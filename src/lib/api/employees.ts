import type { Employee } from "@/types";
import { requestJson } from "@/lib/api/request";
import { parseEmployee } from "@/lib/api/parse";

export async function fetchEmployees(): Promise<Employee[]> {
  const data = await requestJson<Employee[]>("/api/employees", { cache: "no-store" });
  return data.map(parseEmployee);
}
