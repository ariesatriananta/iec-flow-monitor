import { z } from "zod";

export const overtimeStatuses = ["SUBMITTED", "WAITING_LEVEL_2", "APPROVED", "REJECTED", "CANCELLED"] as const;
export const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus YYYY-MM-DD").refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return !value.startsWith("0000-") && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Tanggal tidak valid");
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Jam harus HH:mm");
export const createOvertimeSchema = z.object({
  clientId: z.string().trim().min(1).max(200),
  overtimeDate: dateOnlySchema,
  startTime: timeSchema,
  endTime: z.union([timeSchema, z.literal("24:00")]),
  endsNextDay: z.boolean(),
  description: z.string().trim().min(1, "Keterangan wajib diisi").max(5000),
}).strict().superRefine((input, ctx) => {
  const { durationMinutes } = calculateOvertimePeriod(input);
  if (durationMinutes < 1 || durationMinutes > 1440) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endTime"], message: "Durasi lembur harus lebih dari 0 dan maksimal 24 jam" });
});
export type CreateOvertimeInput = z.infer<typeof createOvertimeSchema>;

export function calculateOvertimePeriod(input: { overtimeDate: string; startTime: string; endTime: string; endsNextDay: boolean }) {
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const start = minutes(input.startTime);
  const end = input.endTime === "24:00" ? 1440 : minutes(input.endTime) + (input.endsNextDay ? 1440 : 0);
  const dayStart = new Date(`${input.overtimeDate}T00:00:00+07:00`).getTime();
  return { startsAt: new Date(dayStart + start * 60000), endsAt: new Date(dayStart + end * 60000), durationMinutes: end - start, endsNextDay: input.endsNextDay || input.endTime === "24:00" };
}

export const decisionSchema = z.object({ action: z.enum(["APPROVE", "REJECT", "CANCEL"]), note: z.string().trim().max(2000).optional() }).strict().superRefine((input, ctx) => {
  if (input.action === "REJECT" && !input.note) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["note"], message: "Alasan penolakan wajib diisi" });
});
export const listOvertimeSchema = z.object({
  scope: z.enum(["mine", "approval", "related", "all"]).default("mine"),
  status: z.enum(overtimeStatuses).optional(),
  fromDate: dateOnlySchema.optional(), toDate: dateOnlySchema.optional(),
  clientId: z.string().min(1).max(200).optional(), employeeId: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20), offset: z.coerce.number().int().min(0).default(0),
}).superRefine((input, ctx) => {
  if (input.fromDate && input.toDate && input.fromDate > input.toDate) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["toDate"], message: "Tanggal akhir lebih awal dari tanggal mulai" });
});

export class OvertimeError extends Error { constructor(message: string, public status = 400) { super(message); } }

export function canReadOvertimeRequest(row: { employeeId: string; approverLevel1EmployeeId: string; approverLevel2EmployeeId: string }, user: { role: string; employeeId: string | null }) {
  return user.role === "ADMIN" || !!user.employeeId && [row.employeeId, row.approverLevel1EmployeeId, row.approverLevel2EmployeeId].includes(user.employeeId);
}

export function overtimePeriodsOverlap(first: { startsAt: Date; endsAt: Date }, second: { startsAt: Date; endsAt: Date }) {
  return first.startsAt < second.endsAt && first.endsAt > second.startsAt;
}

export function resolveOvertimeDecision(row: { status: string; employeeId: string; approverLevel1EmployeeId: string; approverLevel2EmployeeId: string }, employeeId: string | null, action: "APPROVE" | "REJECT" | "CANCEL") {
  const pending = row.status === "SUBMITTED" || row.status === "WAITING_LEVEL_2";
  if (!pending) throw new OvertimeError("Pengajuan sudah diproses atau dibatalkan", 409);
  if (action === "CANCEL") {
    if (employeeId !== row.employeeId) throw new OvertimeError("Hanya pengaju yang boleh membatalkan", 403);
    return { status: "CANCELLED", level: null };
  }
  const level = row.status === "SUBMITTED" ? 1 : 2;
  const approverId = level === 1 ? row.approverLevel1EmployeeId : row.approverLevel2EmployeeId;
  if (employeeId !== approverId) throw new OvertimeError("Pengajuan tidak sedang menunggu persetujuan Anda", 403);
  return { status: action === "REJECT" ? "REJECTED" : level === 1 ? "WAITING_LEVEL_2" : "APPROVED", level };
}
