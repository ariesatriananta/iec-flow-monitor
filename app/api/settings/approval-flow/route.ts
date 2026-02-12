export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { settingsApprovalFlow } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/server";

const defaultPayload = {
  leaveApprovalLevels: 2,
  leaveApproverLevel1Role: "ADMIN_1",
  leaveApproverLevel2Role: "ADMIN_2",
  reimbursementApprovalLevels: 2,
  reimbursementApproverLevel1Role: "ADMIN_1",
  reimbursementApproverLevel2Role: "ADMIN_2",
  businessTripApprovalLevels: 2,
  businessTripApproverLevel1Role: "ADMIN_1",
  businessTripApproverLevel2Role: "ADMIN_2",
} as const;

const roleSchema = z
  .string()
  .trim()
  .min(1, "Role approver wajib diisi")
  .max(64, "Role approver maksimal 64 karakter");

const payloadSchema = z.object({
  leaveApprovalLevels: z.union([z.literal(1), z.literal(2)]),
  leaveApproverLevel1Role: roleSchema,
  leaveApproverLevel2Role: roleSchema,
  reimbursementApprovalLevels: z.union([z.literal(1), z.literal(2)]),
  reimbursementApproverLevel1Role: roleSchema,
  reimbursementApproverLevel2Role: roleSchema,
  businessTripApprovalLevels: z.union([z.literal(1), z.literal(2)]),
  businessTripApproverLevel1Role: roleSchema,
  businessTripApproverLevel2Role: roleSchema,
});

const formatZodError = (error: z.ZodError) =>
  error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");

export async function GET() {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const db = getDb();
  const [row] = await db.select().from(settingsApprovalFlow).limit(1);
  if (!row) {
    return NextResponse.json(defaultPayload);
  }

  return NextResponse.json({
    leaveApprovalLevels: row.leaveApprovalLevels,
    leaveApproverLevel1Role: row.leaveApproverLevel1Role,
    leaveApproverLevel2Role: row.leaveApproverLevel2Role,
    reimbursementApprovalLevels: row.reimbursementApprovalLevels,
    reimbursementApproverLevel1Role: row.reimbursementApproverLevel1Role,
    reimbursementApproverLevel2Role: row.reimbursementApproverLevel2Role,
    businessTripApprovalLevels: row.businessTripApprovalLevels,
    businessTripApproverLevel1Role: row.businessTripApproverLevel1Role,
    businessTripApproverLevel2Role: row.businessTripApproverLevel2Role,
  });
}

export async function PUT(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const rawBody = await request.json().catch(() => null);
  const parsed = payloadSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Payload tidak valid: ${formatZodError(parsed.error)}` },
      { status: 400 }
    );
  }

  const payload = parsed.data;
  const now = new Date();
  const db = getDb();
  const [updated] = await db
    .insert(settingsApprovalFlow)
    .values({
      id: "default",
      leaveApprovalLevels: payload.leaveApprovalLevels,
      leaveApproverLevel1Role: payload.leaveApproverLevel1Role,
      leaveApproverLevel2Role: payload.leaveApproverLevel2Role,
      reimbursementApprovalLevels: payload.reimbursementApprovalLevels,
      reimbursementApproverLevel1Role: payload.reimbursementApproverLevel1Role,
      reimbursementApproverLevel2Role: payload.reimbursementApproverLevel2Role,
      businessTripApprovalLevels: payload.businessTripApprovalLevels,
      businessTripApproverLevel1Role: payload.businessTripApproverLevel1Role,
      businessTripApproverLevel2Role: payload.businessTripApproverLevel2Role,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: settingsApprovalFlow.id,
      set: {
        leaveApprovalLevels: payload.leaveApprovalLevels,
        leaveApproverLevel1Role: payload.leaveApproverLevel1Role,
        leaveApproverLevel2Role: payload.leaveApproverLevel2Role,
        reimbursementApprovalLevels: payload.reimbursementApprovalLevels,
        reimbursementApproverLevel1Role: payload.reimbursementApproverLevel1Role,
        reimbursementApproverLevel2Role: payload.reimbursementApproverLevel2Role,
        businessTripApprovalLevels: payload.businessTripApprovalLevels,
        businessTripApproverLevel1Role: payload.businessTripApproverLevel1Role,
        businessTripApproverLevel2Role: payload.businessTripApproverLevel2Role,
        updatedAt: now,
      },
    })
    .returning();

  return NextResponse.json({
    leaveApprovalLevels: updated.leaveApprovalLevels,
    leaveApproverLevel1Role: updated.leaveApproverLevel1Role,
    leaveApproverLevel2Role: updated.leaveApproverLevel2Role,
    reimbursementApprovalLevels: updated.reimbursementApprovalLevels,
    reimbursementApproverLevel1Role: updated.reimbursementApproverLevel1Role,
    reimbursementApproverLevel2Role: updated.reimbursementApproverLevel2Role,
    businessTripApprovalLevels: updated.businessTripApprovalLevels,
    businessTripApproverLevel1Role: updated.businessTripApproverLevel1Role,
    businessTripApproverLevel2Role: updated.businessTripApproverLevel2Role,
  });
}

