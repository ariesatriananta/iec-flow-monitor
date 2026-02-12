import type { Reimbursement } from "@/types";
import { requestJson } from "@/lib/api/request";
import { parseReimbursement } from "@/lib/api/parse";

export interface ReimbursementAttachmentInput {
  url: string;
  key?: string;
  fileName?: string;
  contentType?: string;
  size?: number;
}

export async function fetchReimbursements(status?: string): Promise<Reimbursement[]> {
  const url = status
    ? `/api/reimbursement?status=${encodeURIComponent(status)}`
    : "/api/reimbursement";
  const data = await requestJson<Reimbursement[]>(url, { cache: "no-store" });
  return data.map(parseReimbursement);
}

export async function createReimbursement(payload: {
  category: string;
  amount: number;
  description?: string;
  receiptUrl?: string;
  attachments?: ReimbursementAttachmentInput[];
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

export async function deleteReimbursementAttachment(
  attachmentId: string
): Promise<void> {
  const response = await fetch(
    `/api/reimbursement/attachments/${encodeURIComponent(attachmentId)}`,
    {
      method: "DELETE",
    }
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Gagal menghapus attachment");
  }
}
