import type { Invoice } from "@/types";
import { requestJson } from "./request";
import { parseInvoice } from "./parse";

export async function fetchInvoices(contractId?: string): Promise<Invoice[]> {
  const url = contractId
    ? `/api/invoices?contractId=${encodeURIComponent(contractId)}`
    : "/api/invoices";
  const data = await requestJson<Invoice[]>(url, { cache: "no-store" });
  return data.map(parseInvoice);
}

export async function createInvoice(payload: {
  contractId: string;
  terminId: string;
  invoiceDate: Date;
  seqNo: number;
  invoiceNumber: string;
  amount: number;
  status: string;
}): Promise<Invoice> {
  const data = await requestJson<Invoice>("/api/invoices", {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      invoiceDate: payload.invoiceDate.toISOString(),
    }),
  });
  return parseInvoice(data);
}

export async function updateInvoice(
  id: string,
  payload: {
    invoiceDate?: Date;
    seqNo?: number;
    invoiceNumber?: string;
    amount?: number;
    status?: string;
  }
): Promise<Invoice> {
  const data = await requestJson<Invoice>(`/api/invoices/${id}`, {
    method: "PUT",
    body: JSON.stringify({
      ...payload,
      invoiceDate: payload.invoiceDate ? payload.invoiceDate.toISOString() : undefined,
    }),
  });
  return parseInvoice(data);
}
