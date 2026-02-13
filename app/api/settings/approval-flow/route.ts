export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { settingsApprovalFlow, users } from "@/lib/db/schema";
import { requireAdmin, requireSessionUser } from "@/lib/auth/server";
import { eq } from "drizzle-orm";

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
}).superRefine((value, ctx) => {
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

export async function GET() {
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  const db = getDb();
  const [row] = await db.select().from(settingsApprovalFlow).limit(1);
  if (!row) {
    return NextResponse.json(defaultPayload);
  }

  return NextResponse.json({
    leaveApprovalLevels: row.leaveApprovalLevels,
    leaveApproverLevel1EmployeeId: row.leaveApproverLevel1EmployeeId,
    leaveApproverLevel2EmployeeId: row.leaveApproverLevel2EmployeeId,
    reimbursementApprovalLevels: row.reimbursementApprovalLevels,
    reimbursementApproverLevel1EmployeeId: row.reimbursementApproverLevel1EmployeeId,
    reimbursementApproverLevel2EmployeeId: row.reimbursementApproverLevel2EmployeeId,
    businessTripApprovalLevels: row.businessTripApprovalLevels,
    businessTripApproverLevel1EmployeeId: row.businessTripApproverLevel1EmployeeId,
    businessTripApproverLevel2EmployeeId: row.businessTripApproverLevel2EmployeeId,
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

  const now = new Date();
  const [updated] = await db
    .insert(settingsApprovalFlow)
    .values({
      id: "default",
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

  return NextResponse.json({
    leaveApprovalLevels: updated.leaveApprovalLevels,
    leaveApproverLevel1EmployeeId: updated.leaveApproverLevel1EmployeeId,
    leaveApproverLevel2EmployeeId: updated.leaveApproverLevel2EmployeeId,
    reimbursementApprovalLevels: updated.reimbursementApprovalLevels,
    reimbursementApproverLevel1EmployeeId: updated.reimbursementApproverLevel1EmployeeId,
    reimbursementApproverLevel2EmployeeId: updated.reimbursementApproverLevel2EmployeeId,
    businessTripApprovalLevels: updated.businessTripApprovalLevels,
    businessTripApproverLevel1EmployeeId: updated.businessTripApproverLevel1EmployeeId,
    businessTripApproverLevel2EmployeeId: updated.businessTripApproverLevel2EmployeeId,
  });
}
