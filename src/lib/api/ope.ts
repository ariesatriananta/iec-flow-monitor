import { requestJson } from "./request";
import type { OpeClientOption, OpeDocument, OpeInput, OpeItem, OpeStatus, OpeType } from "@/types/ope";

type WireItem = Omit<OpeItem, "rate" | "amount" | "expenseDate"> & {
  rate: string | number | null;
  amount: string | number;
  expenseDate: string | null;
};
type MoneyKey = "ppnRate" | "pph23Rate" | "subtotal" | "ppnAmount" | "pph23Amount" | "total";
type WireDocument = Omit<OpeDocument, MoneyKey | "items" | "documentDate" | "createdAt" | "updatedAt"> &
  Record<MoneyKey, string | number> & {
    documentDate: string;
    createdAt: string;
    updatedAt: string;
    items?: WireItem[];
  };

const parseOpe = (row: WireDocument): OpeDocument => ({
  ...row,
  documentDate: new Date(row.documentDate),
  createdAt: new Date(row.createdAt),
  updatedAt: new Date(row.updatedAt),
  ppnRate: Number(row.ppnRate),
  pph23Rate: Number(row.pph23Rate),
  subtotal: Number(row.subtotal),
  ppnAmount: Number(row.ppnAmount),
  pph23Amount: Number(row.pph23Amount),
  total: Number(row.total),
  items: row.items?.map((item) => ({
    ...item,
    rate: item.rate === null ? null : Number(item.rate),
    amount: Number(item.amount),
    expenseDate: item.expenseDate ? new Date(item.expenseDate) : null,
  })),
});

export async function fetchOpeDocuments(params: {
  type?: OpeType;
  status?: OpeStatus | "NON_VOID";
  limit?: number;
  offset?: number;
} = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value));
  }
  const result = await requestJson<{ items: WireDocument[]; total: number; limit: number; offset: number }>(
    `/api/ope?${query}`, { cache: "no-store" },
  );
  return { ...result, items: result.items.map(parseOpe) };
}

export async function fetchOpeDocument(id: string): Promise<OpeDocument> {
  return parseOpe(await requestJson<WireDocument>(`/api/ope/${encodeURIComponent(id)}`, { cache: "no-store" }));
}

export async function createOpeDocument(payload: OpeInput): Promise<OpeDocument> {
  return parseOpe(await requestJson<WireDocument>("/api/ope", {
    method: "POST", body: JSON.stringify(payload),
  }));
}

export async function updateOpeDocument(id: string, payload: OpeInput | { status: OpeStatus }): Promise<OpeDocument> {
  return parseOpe(await requestJson<WireDocument>(`/api/ope/${encodeURIComponent(id)}`, {
    method: "PUT", body: JSON.stringify(payload),
  }));
}

export async function fetchOpeClientOptions(): Promise<OpeClientOption[]> {
  const rows = await requestJson<(Omit<OpeClientOption, "latestContractDate"> & { latestContractDate: string })[]>(
    "/api/ope/client-options", { cache: "no-store" },
  );
  return rows.map((row) => ({ ...row, latestContractDate: new Date(row.latestContractDate) }));
}
