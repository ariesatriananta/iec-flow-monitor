import type { Contract } from "@/types";
import { requestJson } from "./request";
import { parseContract } from "./parse";

export async function fetchContracts(): Promise<Contract[]> {
  const data = await requestJson<Contract[]>("/api/contracts", {
    cache: "no-store",
  });
  return data.map(parseContract);
}

export async function fetchContract(id: string): Promise<Contract> {
  const data = await requestJson<Contract>(`/api/contracts/${id}`, {
    cache: "no-store",
  });
  return parseContract(data);
}

export async function createContract(payload: {
  clientId: string;
  proposalDate: Date;
  serviceCode: string;
  engagementNo: number;
  seqNo: number;
  proposalNumber: string;
  contractTitle?: string;
  contractValue: number;
  paymentStatus: string;
  status: string;
  notes?: string;
}): Promise<Contract> {
  const data = await requestJson<Contract>("/api/contracts", {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      proposalDate: payload.proposalDate.toISOString(),
    }),
  });
  return parseContract(data);
}

export async function updateContract(
  id: string,
  payload: {
    contractTitle?: string;
    contractValue?: number;
    paymentStatus?: string;
    status?: string;
    notes?: string;
  }
): Promise<Contract> {
  const data = await requestJson<Contract>(`/api/contracts/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return parseContract(data);
}
