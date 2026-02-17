export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  reimbursementAttachments,
  reimbursementItems,
  reimbursements,
  settingsApprovalFlow,
} from "@/lib/db/schema";
import { requireAdmin, requireSessionUser } from "@/lib/auth/server";
import { createWorkflowEvent } from "@/lib/workflow-events";
import {
  createNotificationsForUsers,
  resolveUserIdsByEmployeeIds,
} from "@/lib/notifications";

const MAX_REIMBURSEMENT_FILES = 5;
const MAX_REIMBURSEMENT_FILE_SIZE_BYTES = 2 * 1024 * 1024;

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
  size: z.number().int().min(0).max(MAX_REIMBURSEMENT_FILE_SIZE_BYTES).optional(),
});

const editSchema = z.object({
  submissionDate: z
    .string()
    .trim()
    .refine(
      (value) => !Number.isNaN(new Date(value).getTime()),
      "Format tanggal pengajuan tidak valid"
    ),
  description: z.string().trim().max(2000).optional(),
  items: z
    .array(
      z.object({
        expenseDate: z
          .string()
          .trim()
          .refine(
            (value) => !Number.isNaN(new Date(value).getTime()),
            "Format tanggal item tidak valid"
          ),
        category: z.string().trim().min(1).max(50),
        clientName: z.string().trim().max(255).optional(),
        description: z.string().trim().max(2000).optional(),
        amount: z.number().positive().max(999999999999),
        attachment: attachmentSchema,
      })
    )
    .min(1)
    .max(MAX_REIMBURSEMENT_FILES),
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
  paidProofAttachments: z.array(attachmentSchema).max(MAX_REIMBURSEMENT_FILES).optional(),
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

  const parsedEditBody = editSchema.safeParse(rawBody);
  if (parsedEditBody.success) {
    const body = parsedEditBody.data;
    const isOwner =
      Boolean(auth.user.employeeId) && existing.employeeId === auth.user.employeeId;
    if (auth.user.role !== "ADMIN" && !isOwner) {
      return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
    }

    if (!["SUBMITTED", "REJECTED"].includes(existing.status)) {
      return NextResponse.json(
        {
          error:
            "Pengajuan hanya bisa diedit saat status SUBMITTED atau REJECTED",
        },
        { status: 400 }
      );
    }

    const now = new Date();
    const totalAmount = body.items.reduce((sum, item) => sum + item.amount, 0);
    const summaryCategory =
      body.items.length === 1 ? body.items[0].category : "MULTI_ITEM";
    const receiptUrlFromAttachment = body.items[0]?.attachment.url ?? null;

    const [updated] = await db
      .update(reimbursements)
      .set({
        submissionDate: new Date(body.submissionDate),
        description: body.description ?? null,
        category: summaryCategory,
        amount: totalAmount.toString(),
        itemCount: body.items.length,
        receiptUrl: receiptUrlFromAttachment,
        updatedAt: now,
      })
      .where(eq(reimbursements.id, params.id))
      .returning();

    await db
      .delete(reimbursementAttachments)
      .where(
        and(
          eq(reimbursementAttachments.reimbursementId, params.id),
          eq(reimbursementAttachments.purpose, "RECEIPT")
        )
      );
    await db
      .delete(reimbursementItems)
      .where(eq(reimbursementItems.reimbursementId, params.id));

    const itemRecords = body.items.map((item) => ({
      id: crypto.randomUUID(),
      reimbursementId: params.id,
      expenseDate: new Date(item.expenseDate),
      category: item.category,
      clientName: item.clientName ?? null,
      description: item.description ?? null,
      amount: item.amount.toString(),
      createdAt: now,
      updatedAt: now,
    }));
    await db.insert(reimbursementItems).values(itemRecords);

    await db.insert(reimbursementAttachments).values(
      body.items.map((item, index) => ({
        id: crypto.randomUUID(),
        reimbursementId: params.id,
        reimbursementItemId: itemRecords[index]?.id ?? null,
        purpose: "RECEIPT",
        fileUrl: item.attachment.url,
        fileKey: item.attachment.key ?? null,
        fileName: item.attachment.fileName ?? "attachment",
        contentType: item.attachment.contentType ?? null,
        fileSize: item.attachment.size ?? null,
        uploadedBy: auth.user.id,
        createdAt: now,
      }))
    );

    await createWorkflowEvent(db, {
      module: "REIMBURSEMENT",
      entityId: params.id,
      action: "EDITED",
      fromStatus: existing.status,
      toStatus: existing.status,
      note: "Pengajuan reimbursement diperbarui",
      actorUserId: auth.user.id,
      actorEmployeeId: auth.user.employeeId,
    });

    const attachments = await db
      .select()
      .from(reimbursementAttachments)
      .where(eq(reimbursementAttachments.reimbursementId, params.id));
    const itemsRaw = await db
      .select()
      .from(reimbursementItems)
      .where(eq(reimbursementItems.reimbursementId, params.id));
    const receiptAttachmentByItemId = new Map<string, (typeof attachments)[number]>();
    for (const attachment of attachments) {
      if (attachment.purpose === "RECEIPT" && attachment.reimbursementItemId) {
        receiptAttachmentByItemId.set(attachment.reimbursementItemId, attachment);
      }
    }
    const items = itemsRaw.map((item) => ({
      ...item,
      attachment: receiptAttachmentByItemId.get(item.id) ?? null,
    }));

    return NextResponse.json({ ...updated, items, attachments });
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

      const approverMap = await resolveUserIdsByEmployeeIds(db, [
        approverLevel1EmployeeId,
        approverLevel2EmployeeId,
      ]);
      const targetUserIds = [approverLevel1EmployeeId, approverLevel2EmployeeId]
        .map((employeeId) => (employeeId ? approverMap.get(employeeId) ?? null : null))
        .filter((userId): userId is string => Boolean(userId) && userId !== auth.user.id);
      await createNotificationsForUsers(db, targetUserIds, {
        type: "REIMBURSEMENT_CANCELLED",
        title: "Reimbursement Dibatalkan",
        message: "Pengaju membatalkan pengajuan reimbursement.",
        entityType: "REIMBURSEMENT",
        entityId: updated.id,
      });
    }

    const attachments = await db
      .select()
      .from(reimbursementAttachments)
      .where(eq(reimbursementAttachments.reimbursementId, params.id));
    const itemsRaw = await db
      .select()
      .from(reimbursementItems)
      .where(eq(reimbursementItems.reimbursementId, params.id));
    const receiptAttachmentByItemId = new Map<string, (typeof attachments)[number]>();
    for (const attachment of attachments) {
      if (attachment.purpose === "RECEIPT" && attachment.reimbursementItemId) {
        receiptAttachmentByItemId.set(attachment.reimbursementItemId, attachment);
      }
    }
    const items = itemsRaw.map((item) => ({
      ...item,
      attachment: receiptAttachmentByItemId.get(item.id) ?? null,
    }));

    return NextResponse.json({ ...updated, items, attachments });
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
  if (paidProofAttachments.length > 0) {
    const existingPaidProofCount = await db
      .select()
      .from(reimbursementAttachments)
      .where(
        eq(reimbursementAttachments.reimbursementId, params.id)
      );
    const persistedPaidProofCount = existingPaidProofCount.filter(
      (item) => item.purpose === "PAID_PROOF"
    ).length;
    if (persistedPaidProofCount + paidProofAttachments.length > MAX_REIMBURSEMENT_FILES) {
      return NextResponse.json(
        {
          error: `Maksimal ${MAX_REIMBURSEMENT_FILES} file bukti transfer per pengajuan.`,
        },
        { status: 400 }
      );
    }
  }
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

    const userByEmployee = await resolveUserIdsByEmployeeIds(db, [
      existing.employeeId,
      approverLevel2EmployeeId,
    ]);
    const requesterUserId = userByEmployee.get(existing.employeeId);
    const notificationTargets: string[] = [];

    if (requesterUserId && requesterUserId !== auth.user.id) {
      notificationTargets.push(requesterUserId);
    }
    if (updated.status === "WAITING_LEVEL_2" && approverLevel2EmployeeId) {
      const approverL2UserId = userByEmployee.get(approverLevel2EmployeeId);
      if (approverL2UserId && approverL2UserId !== auth.user.id) {
        notificationTargets.push(approverL2UserId);
      }
    }

    await createNotificationsForUsers(db, notificationTargets, {
      type: `REIMBURSEMENT_${updated.status}`,
      title:
        updated.status === "WAITING_LEVEL_2"
          ? "Reimbursement Menunggu Approval L2"
          : "Update Status Reimbursement",
      message:
        updated.status === "WAITING_LEVEL_2"
          ? "Ada reimbursement yang perlu Anda review di level 2."
          : `Status reimbursement berubah menjadi ${updated.status}.`,
      entityType: "REIMBURSEMENT",
      entityId: updated.id,
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
  const itemsRaw = await db
    .select()
    .from(reimbursementItems)
    .where(eq(reimbursementItems.reimbursementId, params.id));
  const receiptAttachmentByItemId = new Map<string, (typeof attachments)[number]>();
  for (const attachment of attachments) {
    if (attachment.purpose === "RECEIPT" && attachment.reimbursementItemId) {
      receiptAttachmentByItemId.set(attachment.reimbursementItemId, attachment);
    }
  }
  const items = itemsRaw.map((item) => ({
    ...item,
    attachment: receiptAttachmentByItemId.get(item.id) ?? null,
  }));

  return NextResponse.json({ ...updated, items, attachments });
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
  await db.delete(reimbursementItems).where(eq(reimbursementItems.reimbursementId, params.id));
  await db.delete(reimbursements).where(eq(reimbursements.id, params.id));

  return NextResponse.json({ ok: true });
}
