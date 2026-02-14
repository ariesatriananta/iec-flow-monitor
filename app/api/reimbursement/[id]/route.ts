export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  reimbursementAttachments,
  reimbursements,
  settingsApprovalFlow,
} from "@/lib/db/schema";
import { requireAdmin, requireSessionUser } from "@/lib/auth/server";
import { createWorkflowEvent } from "@/lib/workflow-events";

const workflowStatusSchema = z.union([
  z.literal("SUBMITTED"),
  z.literal("WAITING_LEVEL_2"),
  z.literal("APPROVED"),
  z.literal("REJECTED"),
  z.literal("PAID"),
  z.literal("CANCELLED"),
]);

const attachmentSchema = z.object({
  url: z.string().trim().min(1).max(2000),
  key: z.string().trim().min(1).max(2000).optional(),
  fileName: z.string().trim().min(1).max(255).optional(),
  contentType: z.string().trim().min(1).max(128).optional(),
  size: z.number().int().min(0).max(20 * 1024 * 1024).optional(),
});

const staffUpdateSchema = z.object({
  category: z.string().trim().min(1).max(50).optional(),
  amount: z.number().positive().max(999999999999).optional(),
  description: z.string().trim().max(2000).optional(),
  receiptUrl: z.string().trim().min(1).max(2000).optional(),
  status: z.literal("CANCELLED").optional(),
});

const adminUpdateSchema = z.object({
  category: z.string().trim().min(1).max(50).optional(),
  amount: z.number().positive().max(999999999999).optional(),
  description: z.string().trim().max(2000).optional(),
  receiptUrl: z.string().trim().min(1).max(2000).optional(),
  status: workflowStatusSchema.optional(),
  adminNote: z.string().trim().max(2000).optional(),
  paidProofUrl: z.string().trim().min(1).max(2000).optional(),
  paidProofAttachments: z.array(attachmentSchema).max(20).optional(),
});

const formatZodError = (error: z.ZodError) =>
  error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  const rawBody = await request.json().catch(() => null);
  const db = getDb();

  const [existing] = await db
    .select()
    .from(reimbursements)
    .where(eq(reimbursements.id, params.id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Reimbursement tidak ditemukan" }, { status: 404 });
  }

  const [approvalFlow] = await db.select().from(settingsApprovalFlow).limit(1);
  const approvalLevels = approvalFlow?.reimbursementApprovalLevels ?? 2;
  const approverLevel1EmployeeId =
    approvalFlow?.reimbursementApproverLevel1EmployeeId ?? null;
  const approverLevel2EmployeeId =
    approvalFlow?.reimbursementApproverLevel2EmployeeId ?? null;
  const isApproverLevel1 =
    Boolean(auth.user.employeeId) && auth.user.employeeId === approverLevel1EmployeeId;
  const isApproverLevel2 =
    approvalLevels === 2 &&
    Boolean(auth.user.employeeId) &&
    auth.user.employeeId === approverLevel2EmployeeId;
  const isApprover = isApproverLevel1 || isApproverLevel2;

  if (!isApprover) {
    const parsedBody = staffUpdateSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: `Payload tidak valid: ${formatZodError(parsedBody.error)}` },
        { status: 400 }
      );
    }

    const body = parsedBody.data;
    if (!auth.user.employeeId || existing.employeeId !== auth.user.employeeId) {
      return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
    }

    if (existing.status !== "SUBMITTED") {
      return NextResponse.json(
        { error: "Pengajuan yang sudah diproses tidak bisa diubah" },
        { status: 400 }
      );
    }

    const [updated] = await db
      .update(reimbursements)
      .set({
        category: body.category ?? undefined,
        amount:
          body.amount !== undefined ? body.amount.toString() : undefined,
        description: body.description ?? undefined,
        receiptUrl: body.receiptUrl ?? undefined,
        status: body.status === "CANCELLED" ? "CANCELLED" : existing.status,
        updatedAt: new Date(),
      })
      .where(eq(reimbursements.id, params.id))
      .returning();

    if (updated.status !== existing.status && updated.status === "CANCELLED") {
      await createWorkflowEvent(db, {
        module: "REIMBURSEMENT",
        entityId: updated.id,
        action: "CANCELLED",
        fromStatus: existing.status,
        toStatus: updated.status,
        note: "Dibatalkan oleh pengaju",
        actorUserId: auth.user.id,
        actorEmployeeId: auth.user.employeeId,
      });
    }

    const attachments = await db
      .select()
      .from(reimbursementAttachments)
      .where(eq(reimbursementAttachments.reimbursementId, params.id));

    return NextResponse.json({ ...updated, attachments });
  }

  const parsedBody = adminUpdateSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: `Payload tidak valid: ${formatZodError(parsedBody.error)}` },
      { status: 400 }
    );
  }

  const body = parsedBody.data;
  const paidProofAttachments = body.paidProofAttachments ?? [];
  const requestedStatus = body.status ?? existing.status;
  let nextStatus = requestedStatus;
  let approvedBy: string | null | undefined = undefined;
  let approvedAt: Date | null | undefined = undefined;

  if (requestedStatus === "APPROVED" || requestedStatus === "REJECTED") {
    if (existing.status === "SUBMITTED") {
      if (!isApproverLevel1) {
        return NextResponse.json(
          { error: "Anda bukan approver level 1 untuk reimbursement ini" },
          { status: 403 }
        );
      }

      if (requestedStatus === "APPROVED" && approvalLevels === 2) {
        nextStatus = "WAITING_LEVEL_2";
        approvedBy = null;
        approvedAt = null;
      } else {
        nextStatus = requestedStatus;
        approvedBy = auth.user.id;
        approvedAt = new Date();
      }
    } else if (existing.status === "WAITING_LEVEL_2") {
      if (approvalLevels !== 2) {
        return NextResponse.json(
          { error: "Konfigurasi approval level reimbursement tidak sesuai" },
          { status: 400 }
        );
      }
      if (!isApproverLevel2) {
        return NextResponse.json(
          { error: "Anda bukan approver level 2 untuk reimbursement ini" },
          { status: 403 }
        );
      }

      nextStatus = requestedStatus;
      approvedBy = auth.user.id;
      approvedAt = new Date();
    } else {
      return NextResponse.json(
        { error: "Status saat ini tidak bisa diproses approval/reject" },
        { status: 400 }
      );
    }
  } else if (requestedStatus === "PAID") {
    const canMarkPaid =
      approvalLevels === 2 ? isApproverLevel2 : isApproverLevel1;
    if (!canMarkPaid) {
      return NextResponse.json(
        { error: "Anda bukan approver final untuk mark paid reimbursement ini" },
        { status: 403 }
      );
    }
    if (existing.status !== "APPROVED") {
      return NextResponse.json(
        { error: "Hanya reimbursement APPROVED yang bisa di-mark paid" },
        { status: 400 }
      );
    }
  } else if (
    requestedStatus === "WAITING_LEVEL_2" &&
    existing.status !== "WAITING_LEVEL_2"
  ) {
    return NextResponse.json(
      { error: "Status WAITING_LEVEL_2 tidak dapat di-set manual" },
      { status: 400 }
    );
  } else if (requestedStatus === "SUBMITTED" && existing.status !== "SUBMITTED") {
    return NextResponse.json(
      { error: "Status SUBMITTED tidak dapat dikembalikan manual" },
      { status: 400 }
    );
  }

  const paidProofUrlFromPayload =
    body.paidProofUrl ?? paidProofAttachments[0]?.url ?? existing.paidProofUrl;
  if (nextStatus === "PAID" && !paidProofUrlFromPayload) {
    return NextResponse.json(
      { error: "Bukti transfer wajib diisi sebelum mark paid" },
      { status: 400 }
    );
  }

  const paidAt = nextStatus === "PAID" ? new Date() : existing.paidAt;

  const [updated] = await db
    .update(reimbursements)
    .set({
      category: body.category ?? undefined,
      amount: body.amount !== undefined ? body.amount.toString() : undefined,
      description: body.description ?? undefined,
      receiptUrl: body.receiptUrl ?? undefined,
      status: nextStatus,
      adminNote: body.adminNote ?? undefined,
      approvedBy:
        nextStatus === "PAID" ? auth.user.id : approvedBy,
      approvedAt:
        nextStatus === "PAID"
          ? existing.approvedAt ?? new Date()
          : approvedAt,
      paidAt,
      paidProofUrl: paidProofUrlFromPayload ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(reimbursements.id, params.id))
    .returning();

  if (updated.status !== existing.status) {
    let action = "STATUS_CHANGED";
    let level: number | null = null;

    if (updated.status === "WAITING_LEVEL_2") {
      action = "APPROVED_L1";
      level = 1;
    } else if (updated.status === "APPROVED") {
      action = existing.status === "WAITING_LEVEL_2" ? "APPROVED_L2" : "APPROVED";
      level = existing.status === "WAITING_LEVEL_2" ? 2 : 1;
    } else if (updated.status === "REJECTED") {
      action = existing.status === "WAITING_LEVEL_2" ? "REJECTED_L2" : "REJECTED_L1";
      level = existing.status === "WAITING_LEVEL_2" ? 2 : 1;
    } else if (updated.status === "PAID") {
      action = "MARKED_PAID";
      level = approvalLevels === 2 ? 2 : 1;
    } else if (updated.status === "CANCELLED") {
      action = "CANCELLED";
    }

    await createWorkflowEvent(db, {
      module: "REIMBURSEMENT",
      entityId: updated.id,
      level,
      action,
      fromStatus: existing.status,
      toStatus: updated.status,
      note: body.adminNote ?? null,
      actorUserId: auth.user.id,
      actorEmployeeId: auth.user.employeeId,
    });
  }

  if (paidProofAttachments.length > 0) {
    const now = new Date();
    await db.insert(reimbursementAttachments).values(
      paidProofAttachments.map((item) => ({
        id: crypto.randomUUID(),
        reimbursementId: params.id,
        purpose: "PAID_PROOF",
        fileUrl: item.url,
        fileKey: item.key ?? null,
        fileName: item.fileName ?? "paid-proof",
        contentType: item.contentType ?? null,
        fileSize: item.size ?? null,
        uploadedBy: auth.user.id,
        createdAt: now,
      }))
    );
  }

  const attachments = await db
    .select()
    .from(reimbursementAttachments)
    .where(eq(reimbursementAttachments.reimbursementId, params.id));

  return NextResponse.json({ ...updated, attachments });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const db = getDb();
  const [existing] = await db
    .select()
    .from(reimbursements)
    .where(eq(reimbursements.id, params.id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Reimbursement tidak ditemukan" }, { status: 404 });
  }

  if (existing.status !== "CANCELLED") {
    return NextResponse.json(
      { error: "Hard delete hanya diizinkan untuk status CANCELLED" },
      { status: 400 }
    );
  }

  await createWorkflowEvent(db, {
    module: "REIMBURSEMENT",
    entityId: existing.id,
    action: "HARD_DELETED",
    fromStatus: existing.status,
    toStatus: null,
    note: "Hard delete oleh admin",
    actorUserId: auth.user.id,
    actorEmployeeId: auth.user.employeeId,
  });

  await db.delete(reimbursementAttachments).where(eq(reimbursementAttachments.reimbursementId, params.id));
  await db.delete(reimbursements).where(eq(reimbursements.id, params.id));

  return NextResponse.json({ ok: true });
}
