import type { Reimbursement } from "@/types";
import { requestJson } from "@/lib/api/request";
import { parseReimbursement } from "@/lib/api/parse";
import type { PaginatedResult } from "@/lib/api/pagination";

export interface ReimbursementAttachmentInput {
  url: string;
  key?: string;
  fileName?: string;
  contentType?: string;
  size?: number;
}

export interface ReimbursementItemInput {
  expenseDate: string;
  category: string;
  clientName?: string;
  description?: string;
  amount: number;
  attachment: ReimbursementAttachmentInput;
}

export async function fetchReimbursements(params?: {
  status?: string;
  limit?: number;
  offset?: number;
  q?: string;
  queue?: "mine";
}): Promise<PaginatedResult<Reimbursement>> {
  const search = new URLSearchParams();
  if (params?.status) search.set("status", params.status);
  if (params?.limit) search.set("limit", String(params.limit));
  if (params?.offset) search.set("offset", String(params.offset));
  if (params?.q) search.set("q", params.q);
  if (params?.queue) search.set("queue", params.queue);
  const query = search.toString();
  const url = query ? `/api/reimbursement?${query}` : "/api/reimbursement";
  const data = await requestJson<PaginatedResult<Reimbursement>>(url, {
    cache: "no-store",
  });
  return {
    ...data,
    items: data.items.map(parseReimbursement),
  };
}

export async function createReimbursement(payload: {
  submissionDate: string;
  items: ReimbursementItemInput[];
  description?: string;
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

export async function editReimbursement(
  id: string,
  payload: {
    submissionDate: string;
    description?: string;
    items: ReimbursementItemInput[];
  }
): Promise<Reimbursement> {
  const data = await requestJson<Reimbursement>(`/api/reimbursement/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return parseReimbursement(data);
}

export async function deleteReimbursement(id: string): Promise<void> {
  await requestJson<{ ok: boolean }>(`/api/reimbursement/${id}`, {
    method: "DELETE",
  });
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
