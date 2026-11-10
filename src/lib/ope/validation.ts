import { z } from "zod";

export const OPE_TYPES = ["BUSINESS_TRIP", "MEALS"] as const;
export const OPE_STATUSES = ["DRAFT", "ISSUED", "PAID", "VOID"] as const;
export const MAX_OPE_AMOUNT = 999_999_999_999_999;

const integerInput = (min: number) => z.preprocess(
  (value) => typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value) : value,
  z.number().int().min(min).max(MAX_OPE_AMOUNT),
);
const dateInput = z.string().refine((value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(value);
  if (!match || Number(match[1]) < 1) return false;
  const calendarDate = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (!Number.isFinite(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== value.slice(0, 10)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime());
}, "Tanggal tidak valid").transform((value) => {
  if (value.length === 10) return new Date(`${value}T00:00:00.000Z`);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((entry) => entry.type === type)!.value;
  return new Date(`${part("year").padStart(4, "0")}-${part("month")}-${part("day")}T00:00:00.000Z`);
});
const common = {
  documentDate: dateInput,
  subject: z.string().trim().min(1).max(1000),
  notes: z.string().trim().max(10000).nullable().optional(),
  usePpn: z.boolean().default(false),
  usePph23: z.boolean().default(false),
};
export const opeInputSchema = z.discriminatedUnion("type", [
  z.object({
    ...common,
    type: z.literal("BUSINESS_TRIP"),
    clientId: z.string().min(1),
    items: z.array(z.object({
      employeeId: z.string().min(1),
      description: z.string().trim().max(1000).optional(),
      days: integerInput(1).pipe(z.number().max(2_147_483_647)),
      rate: integerInput(1),
    })).min(1).max(500),
  }),
  z.object({
    ...common,
    type: z.literal("MEALS"),
    items: z.array(z.object({
      expenseDate: dateInput,
      clientId: z.string().min(1),
      description: z.string().trim().min(1).max(1000),
      amount: integerInput(1),
    })).min(1).max(500),
  }),
]);

export type OpeInput = z.infer<typeof opeInputSchema>;

export class OpeError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function calculateOpeTotals(amounts: number[], usePpn: boolean, usePph23: boolean) {
  if (!amounts.length || amounts.some((amount) => !Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_OPE_AMOUNT)) {
    throw new OpeError("Nominal detail tidak valid atau melebihi batas");
  }
  const subtotal = amounts.reduce((sum, amount) => sum + BigInt(amount), BigInt(0));
  const ppnAmount = usePpn ? (subtotal * BigInt(11) + BigInt(50)) / BigInt(100) : BigInt(0);
  const pph23Amount = usePph23 ? (subtotal * BigInt(2) + BigInt(50)) / BigInt(100) : BigInt(0);
  const total = subtotal + ppnAmount - pph23Amount;
  if (subtotal > BigInt(MAX_OPE_AMOUNT) || total > BigInt(MAX_OPE_AMOUNT)) {
    throw new OpeError("Total dokumen melebihi batas nominal");
  }
  return {
    subtotal: subtotal.toString(), ppnAmount: ppnAmount.toString(),
    pph23Amount: pph23Amount.toString(), total: total.toString(),
    ppnRate: usePpn ? "11.00" : "0.00", pph23Rate: usePph23 ? "2.00" : "0.00",
  };
}

export function generateOpeNumber(type: OpeInput["type"], year: number, seqNo: number) {
  return `OPE/${type === "BUSINESS_TRIP" ? "BT" : "ML"}/${year}/${String(seqNo).padStart(4, "0")}`;
}

export function canTransitionOpe(from: string, to: string) {
  return (from === "DRAFT" && (to === "ISSUED" || to === "VOID")) ||
    (from === "ISSUED" && (to === "PAID" || to === "VOID"));
}
