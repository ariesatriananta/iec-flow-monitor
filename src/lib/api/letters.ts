import type { Letter } from "@/types";
import { requestJson } from "./request";
import { parseLetter } from "./parse";

export async function fetchLetters(): Promise<Letter[]> {
  const data = await requestJson<Letter[]>("/api/letters", {
    cache: "no-store",
  });
  return data.map(parseLetter);
}

export async function createLetter(payload: {
  clientId?: string | null;
  letterDate: Date;
  letterType: string;
  hrgaCategory?: string | null;
  subject: string;
  status: string;
  notes?: string;
}): Promise<Letter> {
  const data = await requestJson<Letter>("/api/letters", {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      clientId: payload.clientId ?? undefined,
      letterDate: payload.letterDate.toISOString(),
    }),
  });
  return parseLetter(data);
}

export async function updateLetter(
  id: string,
  payload: {
    letterDate?: Date;
    letterType?: string;
    hrgaCategory?: string | null;
    clientId?: string | null;
    subject?: string;
    seqNo?: number;
    letterNumber?: string;
    status?: string;
    notes?: string | null;
  }
): Promise<Letter> {
  const data = await requestJson<Letter>(`/api/letters/${id}`, {
    method: "PUT",
    body: JSON.stringify({
      ...payload,
      clientId: payload.clientId ?? undefined,
      letterDate: payload.letterDate ? payload.letterDate.toISOString() : undefined,
    }),
  });
  return parseLetter(data);
}
