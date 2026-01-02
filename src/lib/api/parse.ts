"use client";

import type {
  Client,
  Contract,
  Termin,
  Invoice,
  Letter,
  LetterAssignment,
  LetterAssignmentMember,
} from "@/types";

const toDate = (value: string | Date): Date => {
  return value instanceof Date ? value : new Date(value);
};

const toNumber = (value: string | number | null | undefined): number => {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : Number(value);
};

export const parseClient = (data: Client): Client => ({
  ...data,
  createdAt: toDate(data.createdAt),
  updatedAt: toDate(data.updatedAt),
});

export const parseTermin = (data: Termin): Termin => ({
  ...data,
  terminAmount: toNumber(data.terminAmount),
  dueDate: data.dueDate ? toDate(data.dueDate) : undefined,
  paymentReceivedDate: data.paymentReceivedDate
    ? toDate(data.paymentReceivedDate)
    : undefined,
  createdAt: toDate(data.createdAt),
  updatedAt: toDate(data.updatedAt),
});

export const parseInvoice = (data: Invoice): Invoice => ({
  ...data,
  amount: toNumber(data.amount),
  invoiceDate: toDate(data.invoiceDate),
  createdAt: toDate(data.createdAt),
  updatedAt: toDate(data.updatedAt),
});

export const parseLetter = (data: Letter): Letter => ({
  ...data,
  letterDate: toDate(data.letterDate),
  createdAt: toDate(data.createdAt),
  updatedAt: toDate(data.updatedAt),
  client: data.client ? parseClient(data.client) : undefined,
  assignment: data.assignment ? parseLetterAssignment(data.assignment) : undefined,
});

const parseLetterAssignmentMember = (
  data: LetterAssignmentMember
): LetterAssignmentMember => ({
  ...data,
  createdAt: toDate(data.createdAt),
  updatedAt: toDate(data.updatedAt),
});

const parseLetterAssignment = (data: LetterAssignment): LetterAssignment => ({
  ...data,
  createdAt: toDate(data.createdAt),
  updatedAt: toDate(data.updatedAt),
  members: data.members ? data.members.map(parseLetterAssignmentMember) : undefined,
});

export const parseContract = (data: Contract): Contract => ({
  ...data,
  proposalDate: toDate(data.proposalDate),
  contractValue: toNumber(data.contractValue),
  createdAt: toDate(data.createdAt),
  updatedAt: toDate(data.updatedAt),
  client: data.client ? parseClient(data.client) : undefined,
  termins: data.termins ? data.termins.map(parseTermin) : undefined,
});
