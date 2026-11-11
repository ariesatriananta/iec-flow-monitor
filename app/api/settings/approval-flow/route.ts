export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { employees, settingsApprovalFlow, users } from "@/lib/db/schema";
import { requireAdmin, requireSessionUser } from "@/lib/auth/server";
import { and, eq, inArray } from "drizzle-orm";

const defaultPayload = {
  leaveApprovalLevels: 2,
  leaveApproverLevel1EmployeeId: null,
  leaveApproverLevel2EmployeeId: null,
  reimbursementApprovalLevels: 2,
  reimbursementApproverLevel1EmployeeId: null,
  reimbursementApproverLevel2EmployeeId: null,
  businessTripApprovalLevels: 2,
  businessTripApproverLevel1EmployeeId: null,
  businessTripApproverLevel2EmployeeId: null,
  overtimeApprovalLevels: 2,
  overtimeApproverLevel1EmployeeId: null,
  overtimeApproverLevel2EmployeeId: null,
} as const;

const employeeIdSchema = z
  .string()
  .trim()
  .min(1, "Approver wajib dipilih")
  .max(128, "ID approver tidak valid");

const payloadSchema = z.object({
  leaveApprovalLevels: z.union([z.literal(1), z.literal(2)]),
  leaveApproverLevel1EmployeeId: employeeIdSchema,
  leaveApproverLevel2EmployeeId: employeeIdSchema.nullable(),
  reimbursementApprovalLevels: z.union([z.literal(1), z.literal(2)]),
  reimbursementApproverLevel1EmployeeId: employeeIdSchema,
  reimbursementApproverLevel2EmployeeId: employeeIdSchema.nullable(),
  businessTripApprovalLevels: z.union([z.literal(1), z.literal(2)]),
  businessTripApproverLevel1EmployeeId: employeeIdSchema,
  businessTripApproverLevel2EmployeeId: employeeIdSchema.nullable(),
  overtimeApprovalLevels: z.literal(2).optional(),
  overtimeApproverLevel1EmployeeId: employeeIdSchema.nullable().optional(),
  overtimeApproverLevel2EmployeeId: employeeIdSchema.nullable().optional(),
}).superRefine((value, ctx) => {
  const first = value.overtimeApproverLevel1EmployeeId;
  const second = value.overtimeApproverLevel2EmployeeId;
  if ((first !== undefined || second !== undefined) &&
      ((first === undefined || second === undefined) || Boolean(first) !== Boolean(second))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["overtimeApproverLevel2EmployeeId"],
      message: "Approval lembur harus berisi dua approver atau keduanya dikosongkan",
    });
  }
  if (first && first === second) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["overtimeApproverLevel2EmployeeId"],
      message: "Approver level 1 dan level 2 lembur harus berbeda",
    });
  }
  if (value.leaveApprovalLevels === 2 && !value.leaveApproverLevel2EmployeeId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["leaveApproverLevel2EmployeeId"],
      message: "Approver level 2 cuti wajib dipilih untuk flow 2 level",
    });
  }
  if (
    value.reimbursementApprovalLevels === 2 &&
    !value.reimbursementApproverLevel2EmployeeId
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reimbursementApproverLevel2EmployeeId"],
      message: "Approver level 2 reimbursement wajib dipilih untuk flow 2 level",
    });
  }
  if (
    value.businessTripApprovalLevels === 2 &&
    !value.businessTripApproverLevel2EmployeeId
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["businessTripApproverLevel2EmployeeId"],
      message: "Approver level 2 perjalanan dinas wajib dipilih untuk flow 2 level",
    });
  }
});

const formatZodError = (error: z.ZodError) =>
  error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");

const getApproverProfiles = async (ids: Array<string | null>) => {
  const employeeIds = Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
  if (employeeIds.length === 0) {
    return new Map<string, { id: string; fullName: string | null; title: string | null }>();
  }

  const db = getDb();
  const rows = await db
    .select({
      id: employees.id,
      fullName: employees.fullName,
      title: employees.title,
    })
    .from(employees)
    .where(inArray(employees.id, employeeIds));

  const map = new Map<string, { id: string; fullName: string | null; title: string | null }>();
  for (const row of rows) {
    map.set(row.id, row);
  }
  return map;
};

export async function GET() {
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  const db = getDb();
  const [row] = await db.select().from(settingsApprovalFlow).limit(1);
  if (!row) {
    return NextResponse.json(defaultPayload);
  }

  const approverProfiles = await getApproverProfiles([
    row.leaveApproverLevel1EmployeeId,
    row.leaveApproverLevel2EmployeeId,
    row.reimbursementApproverLevel1EmployeeId,
    row.reimbursementApproverLevel2EmployeeId,
    row.businessTripApproverLevel1EmployeeId,
    row.businessTripApproverLevel2EmployeeId,
    row.overtimeApproverLevel1EmployeeId,
    row.overtimeApproverLevel2EmployeeId,
  ]);

  return NextResponse.json({
    overtimeApprovalLevels: 2,
    overtimeApproverLevel1EmployeeId: row.overtimeApproverLevel1EmployeeId,
    overtimeApproverLevel2EmployeeId: row.overtimeApproverLevel2EmployeeId,
    overtimeApproverLevel1Employee: row.overtimeApproverLevel1EmployeeId
      ? approverProfiles.get(row.overtimeApproverLevel1EmployeeId) ?? null : null,
    overtimeApproverLevel2Employee: row.overtimeApproverLevel2EmployeeId
      ? approverProfiles.get(row.overtimeApproverLevel2EmployeeId) ?? null : null,
    leaveApprovalLevels: row.leaveApprovalLevels,
    leaveApproverLevel1EmployeeId: row.leaveApproverLevel1EmployeeId,
    leaveApproverLevel2EmployeeId: row.leaveApproverLevel2EmployeeId,
    leaveApproverLevel1Employee: row.leaveApproverLevel1EmployeeId
      ? approverProfiles.get(row.leaveApproverLevel1EmployeeId) ?? null
      : null,
    leaveApproverLevel2Employee: row.leaveApproverLevel2EmployeeId
      ? approverProfiles.get(row.leaveApproverLevel2EmployeeId) ?? null
      : null,
    reimbursementApprovalLevels: row.reimbursementApprovalLevels,
    reimbursementApproverLevel1EmployeeId: row.reimbursementApproverLevel1EmployeeId,
    reimbursementApproverLevel2EmployeeId: row.reimbursementApproverLevel2EmployeeId,
    reimbursementApproverLevel1Employee: row.reimbursementApproverLevel1EmployeeId
      ? approverProfiles.get(row.reimbursementApproverLevel1EmployeeId) ?? null
      : null,
    reimbursementApproverLevel2Employee: row.reimbursementApproverLevel2EmployeeId
      ? approverProfiles.get(row.reimbursementApproverLevel2EmployeeId) ?? null
      : null,
    businessTripApprovalLevels: row.businessTripApprovalLevels,
    businessTripApproverLevel1EmployeeId: row.businessTripApproverLevel1EmployeeId,
    businessTripApproverLevel2EmployeeId: row.businessTripApproverLevel2EmployeeId,
    businessTripApproverLevel1Employee: row.businessTripApproverLevel1EmployeeId
      ? approverProfiles.get(row.businessTripApproverLevel1EmployeeId) ?? null
      : null,
    businessTripApproverLevel2Employee: row.businessTripApproverLevel2EmployeeId
      ? approverProfiles.get(row.businessTripApproverLevel2EmployeeId) ?? null
      : null,
  });
}

export async function PUT(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const db = getDb();

  const rawBody = await request.json().catch(() => null);
  const parsed = payloadSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Payload tidak valid: ${formatZodError(parsed.error)}` },
      { status: 400 }
    );
  }

  const payload = parsed.data;
  const candidateIds = [
    payload.leaveApproverLevel1EmployeeId,
    payload.leaveApproverLevel2EmployeeId,
    payload.reimbursementApproverLevel1EmployeeId,
    payload.reimbursementApproverLevel2EmployeeId,
    payload.businessTripApproverLevel1EmployeeId,
    payload.businessTripApproverLevel2EmployeeId,
    payload.overtimeApproverLevel1EmployeeId,
    payload.overtimeApproverLevel2EmployeeId,
  ].filter((id): id is string => Boolean(id));
  const uniqueCandidateIds = Array.from(new Set(candidateIds));

  for (const employeeId of uniqueCandidateIds) {
    const [linkedUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.employeeId, employeeId))
      .limit(1);
    if (!linkedUser) {
      return NextResponse.json(
        {
          error: `Employee approver ${employeeId} belum terhubung ke user login`,
        },
        { status: 400 }
      );
    }
  }

  for (const employeeId of [payload.overtimeApproverLevel1EmployeeId, payload.overtimeApproverLevel2EmployeeId]) {
    if (!employeeId) continue;
    const [activeApprover] = await db
      .select({ id: employees.id })
      .from(employees)
      .innerJoin(users, eq(users.employeeId, employees.id))
      .where(and(eq(employees.id, employeeId), eq(employees.isActive, true), eq(users.isActive, true)))
      .limit(1);
    if (!activeApprover) {
      return NextResponse.json({ error: "Approver lembur harus karyawan aktif dengan akun login aktif" }, { status: 400 });
    }
  }

  // Older clients omit these keys: preserve the existing overtime configuration.
  const overtimeUpdate = payload.overtimeApproverLevel1EmployeeId !== undefined
    ? {
        overtimeApproverLevel1EmployeeId: payload.overtimeApproverLevel1EmployeeId,
        overtimeApproverLevel2EmployeeId: payload.overtimeApproverLevel2EmployeeId ?? null,
      }
    : {};
  const now = new Date();
  const [updated] = await db
    .insert(settingsApprovalFlow)
    .values({
      id: "default",
      ...overtimeUpdate,
      leaveApprovalLevels: payload.leaveApprovalLevels,
      leaveApproverLevel1Role: "PERSON_BASED",
      leaveApproverLevel2Role: "PERSON_BASED",
      leaveApproverLevel1EmployeeId: payload.leaveApproverLevel1EmployeeId,
      leaveApproverLevel2EmployeeId:
        payload.leaveApprovalLevels === 2 ? payload.leaveApproverLevel2EmployeeId : null,
      reimbursementApprovalLevels: payload.reimbursementApprovalLevels,
      reimbursementApproverLevel1Role: "PERSON_BASED",
      reimbursementApproverLevel2Role: "PERSON_BASED",
      reimbursementApproverLevel1EmployeeId: payload.reimbursementApproverLevel1EmployeeId,
      reimbursementApproverLevel2EmployeeId:
        payload.reimbursementApprovalLevels === 2
          ? payload.reimbursementApproverLevel2EmployeeId
          : null,
      businessTripApprovalLevels: payload.businessTripApprovalLevels,
      businessTripApproverLevel1Role: "PERSON_BASED",
      businessTripApproverLevel2Role: "PERSON_BASED",
      businessTripApproverLevel1EmployeeId: payload.businessTripApproverLevel1EmployeeId,
      businessTripApproverLevel2EmployeeId:
        payload.businessTripApprovalLevels === 2
          ? payload.businessTripApproverLevel2EmployeeId
          : null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: settingsApprovalFlow.id,
      set: {
        ...overtimeUpdate,
        leaveApprovalLevels: payload.leaveApprovalLevels,
        leaveApproverLevel1Role: "PERSON_BASED",
        leaveApproverLevel2Role: "PERSON_BASED",
        leaveApproverLevel1EmployeeId: payload.leaveApproverLevel1EmployeeId,
        leaveApproverLevel2EmployeeId:
          payload.leaveApprovalLevels === 2 ? payload.leaveApproverLevel2EmployeeId : null,
        reimbursementApprovalLevels: payload.reimbursementApprovalLevels,
        reimbursementApproverLevel1Role: "PERSON_BASED",
        reimbursementApproverLevel2Role: "PERSON_BASED",
        reimbursementApproverLevel1EmployeeId:
          payload.reimbursementApproverLevel1EmployeeId,
        reimbursementApproverLevel2EmployeeId:
          payload.reimbursementApprovalLevels === 2
            ? payload.reimbursementApproverLevel2EmployeeId
            : null,
        businessTripApprovalLevels: payload.businessTripApprovalLevels,
        businessTripApproverLevel1Role: "PERSON_BASED",
        businessTripApproverLevel2Role: "PERSON_BASED",
        businessTripApproverLevel1EmployeeId: payload.businessTripApproverLevel1EmployeeId,
        businessTripApproverLevel2EmployeeId:
          payload.businessTripApprovalLevels === 2
            ? payload.businessTripApproverLevel2EmployeeId
            : null,
        updatedAt: now,
      },
    })
    .returning();

  const approverProfiles = await getApproverProfiles([
    updated.leaveApproverLevel1EmployeeId,
    updated.leaveApproverLevel2EmployeeId,
    updated.reimbursementApproverLevel1EmployeeId,
    updated.reimbursementApproverLevel2EmployeeId,
    updated.businessTripApproverLevel1EmployeeId,
    updated.businessTripApproverLevel2EmployeeId,
    updated.overtimeApproverLevel1EmployeeId,
    updated.overtimeApproverLevel2EmployeeId,
  ]);

  return NextResponse.json({
    overtimeApprovalLevels: 2,
    overtimeApproverLevel1EmployeeId: updated.overtimeApproverLevel1EmployeeId,
    overtimeApproverLevel2EmployeeId: updated.overtimeApproverLevel2EmployeeId,
    overtimeApproverLevel1Employee: updated.overtimeApproverLevel1EmployeeId
      ? approverProfiles.get(updated.overtimeApproverLevel1EmployeeId) ?? null : null,
    overtimeApproverLevel2Employee: updated.overtimeApproverLevel2EmployeeId
      ? approverProfiles.get(updated.overtimeApproverLevel2EmployeeId) ?? null : null,
    leaveApprovalLevels: updated.leaveApprovalLevels,
    leaveApproverLevel1EmployeeId: updated.leaveApproverLevel1EmployeeId,
    leaveApproverLevel2EmployeeId: updated.leaveApproverLevel2EmployeeId,
    leaveApproverLevel1Employee: updated.leaveApproverLevel1EmployeeId
      ? approverProfiles.get(updated.leaveApproverLevel1EmployeeId) ?? null
      : null,
    leaveApproverLevel2Employee: updated.leaveApproverLevel2EmployeeId
      ? approverProfiles.get(updated.leaveApproverLevel2EmployeeId) ?? null
      : null,
    reimbursementApprovalLevels: updated.reimbursementApprovalLevels,
    reimbursementApproverLevel1EmployeeId: updated.reimbursementApproverLevel1EmployeeId,
    reimbursementApproverLevel2EmployeeId: updated.reimbursementApproverLevel2EmployeeId,
    reimbursementApproverLevel1Employee: updated.reimbursementApproverLevel1EmployeeId
      ? approverProfiles.get(updated.reimbursementApproverLevel1EmployeeId) ?? null
      : null,
    reimbursementApproverLevel2Employee: updated.reimbursementApproverLevel2EmployeeId
      ? approverProfiles.get(updated.reimbursementApproverLevel2EmployeeId) ?? null
      : null,
    businessTripApprovalLevels: updated.businessTripApprovalLevels,
    businessTripApproverLevel1EmployeeId: updated.businessTripApproverLevel1EmployeeId,
    businessTripApproverLevel2EmployeeId: updated.businessTripApproverLevel2EmployeeId,
    businessTripApproverLevel1Employee: updated.businessTripApproverLevel1EmployeeId
      ? approverProfiles.get(updated.businessTripApproverLevel1EmployeeId) ?? null
      : null,
    businessTripApproverLevel2Employee: updated.businessTripApproverLevel2EmployeeId
      ? approverProfiles.get(updated.businessTripApproverLevel2EmployeeId) ?? null
      : null,
  });
}
