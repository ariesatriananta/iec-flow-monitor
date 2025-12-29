import type { Termin } from "@/types";
import { requestJson } from "./request";
import { parseTermin } from "./parse";

export async function fetchTermins(contractId: string): Promise<Termin[]> {
  const data = await requestJson<Termin[]>(
    `/api/termins?contractId=${encodeURIComponent(contractId)}`,
    { cache: "no-store" }
  );
  return data.map(parseTermin);
}

export async function createTermin(payload: {
  contractId: string;
  terminName: string;
  terminAmount: number;
  dueDate?: Date;
  status?: string;
  invoiceId?: string;
  paymentReceivedDate?: Date;
}): Promise<Termin> {
  const data = await requestJson<Termin>("/api/termins", {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      dueDate: payload.dueDate ? payload.dueDate.toISOString() : undefined,
      paymentReceivedDate: payload.paymentReceivedDate
        ? payload.paymentReceivedDate.toISOString()
        : undefined,
    }),
  });
  return parseTermin(data);
}

export async function updateTermin(
  id: string,
  payload: {
    terminName?: string;
    terminAmount?: number;
    dueDate?: Date;
    invoiceId?: string | null;
    paymentReceivedDate?: Date | null;
    status?: string;
  }
): Promise<Termin> {
  const data = await requestJson<Termin>(`/api/termins/${id}`, {
    method: "PUT",
    body: JSON.stringify({
      ...payload,
      dueDate: payload.dueDate ? payload.dueDate.toISOString() : undefined,
      paymentReceivedDate: payload.paymentReceivedDate
        ? payload.paymentReceivedDate.toISOString()
        : undefined,
    }),
  });
  return parseTermin(data);
}

export async function deleteTermin(id: string): Promise<void> {
  await requestJson(`/api/termins/${id}`, {
    method: "DELETE",
  });
}
