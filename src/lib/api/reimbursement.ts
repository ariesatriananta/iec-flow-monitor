import type { Reimbursement } from "@/types";
import { requestJson } from "@/lib/api/request";
import { parseReimbursement } from "@/lib/api/parse";

export async function fetchReimbursements(status?: string): Promise<Reimbursement[]> {
  const url = status ? `/api/reimbursement?status=${encodeURIComponent(status)}` : "/api/reimbursement";
  const data = await requestJson<Reimbursement[]>(url, { cache: "no-store" });
  return data.map(parseReimbursement);
}

export async function createReimbursement(payload: {
  category: string;
  amount: number;
  description?: string;
  receiptUrl?: string;
}): Promise<Reimbursement> {
  const data = await requestJson<Reimbursement>("/api/reimbursement", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return parseReimbursement(data);
}

export async function updateReimbursement(
  id: string,
  payload: Record<string, unknown>
): Promise<Reimbursement> {
  const data = await requestJson<Reimbursement>(`/api/reimbursement/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return parseReimbursement(data);
}
