import { z } from "zod";
import { getJakartaMonthYear } from "../numbering";

export const CONSOLIDATED_LETTER_TYPE = "SURAT_PENGANTAR_KONSOLIDASIAN";
export const CONSOLIDATED_LETTER_SUBJECT = "Surat Pengantar Konsolidasian";

export class ConsolidatedLetterError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ConsolidatedLetterError";
  }
}

export const consolidatedDateOnlySchema = z.string().refine((value) => {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) || value.startsWith("0000")) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Tanggal harus berupa tanggal kalender yang valid (YYYY-MM-DD)");

const letterDateSchema = z.string().refine((value) => {
  if (consolidatedDateOnlySchema.safeParse(value).success) return true;
  return consolidatedDateOnlySchema.safeParse(value.slice(0, 10)).success
    && z.string().datetime({ offset: true }).safeParse(value).success;
}, "Tanggal surat tidak valid");

const requiredText = z.string().trim().min(1, "Wajib diisi");
const fields = z.object({
  letterDate: letterDateSchema,
  clientId: requiredText,
  letterType: z.literal(CONSOLIDATED_LETTER_TYPE).optional(),
  subject: z.string().optional(),
  status: z.enum(["ACTIVE", "VOID", "CANCELLED"]).default("ACTIVE"),
  notes: z.string().nullable().optional(),
  opinionDate: consolidatedDateOnlySchema,
  opinionNumber: requiredText,
  hrgaCategory: z.null().optional(),
}).strict();

export const createConsolidatedLetterSchema = fields;
export const updateConsolidatedLetterSchema = fields.partial().extend({
  seqNo: z.number().int().positive().optional(),
  letterNumber: z.string().optional(),
}).strict();

export function parseConsolidatedInput<T extends z.ZodTypeAny>(schema: T, body: unknown): z.output<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new ConsolidatedLetterError(400, `${issue.path.join(".") || "Data surat"}: ${issue.message}`);
  }
  return result.data;
}

export function consolidatedLetterDate(value: string): Date {
  return new Date(value.length === 10 ? `${value}T00:00:00+07:00` : value);
}

export function consolidatedNumberingChange(previous: Date, next: Date) {
  const before = getJakartaMonthYear(previous);
  const after = getJakartaMonthYear(next);
  return {
    year: after.year,
    allocateSequence: before.year !== after.year,
    regenerateNumber: before.year !== after.year || before.month !== after.month,
  };
}
