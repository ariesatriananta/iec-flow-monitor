import type { Client } from "@/types";
import { requestJson } from "./request";
import { parseClient } from "./parse";

export async function fetchClients(): Promise<Client[]> {
  const data = await requestJson<Client[]>("/api/clients", {
    cache: "no-store",
  });
  return data.map(parseClient);
}

export async function fetchClient(id: string): Promise<Client> {
  const data = await requestJson<Client>(`/api/clients/${id}`, {
    cache: "no-store",
  });
  return parseClient(data);
}

export async function createClient(payload: {
  name: string;
  npwp?: string;
  address?: string;
  picName?: string;
  email?: string;
  phone?: string;
  isActive?: boolean;
}): Promise<Client> {
  const data = await requestJson<Client>("/api/clients", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return parseClient(data);
}

export async function updateClient(
  id: string,
  payload: {
    name: string;
    npwp?: string;
    address?: string;
    picName?: string;
    email?: string;
    phone?: string;
    isActive?: boolean;
  }
): Promise<Client> {
  const data = await requestJson<Client>(`/api/clients/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return parseClient(data);
}

export async function deleteClient(id: string): Promise<Client> {
  const data = await requestJson<Client>(`/api/clients/${id}`, {
    method: "DELETE",
  });
  return parseClient(data);
}
