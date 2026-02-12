export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { reimbursementAttachments, reimbursements } from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/server";

const workflowStatusSchema = z.union([
  z.literal("SUBMITTED"),
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

  if (auth.user.role !== "ADMIN") {
    const parsedBody = staffUpdateSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: `Payload tidak valid: ${formatZodError(parsedBody.error)}` },
        { status: 400 }
      );
    }

    const body = parsedBody.data;
    if (existing.userId !== auth.user.id) {
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
  const nextStatus = body.status ?? existing.status;
  const paidProofUrlFromPayload =
    body.paidProofUrl ?? paidProofAttachments[0]?.url ?? existing.paidProofUrl;
  if (nextStatus === "PAID" && !paidProofUrlFromPayload) {
    return NextResponse.json(
      { error: "Bukti transfer wajib diisi sebelum mark paid" },
      { status: 400 }
    );
  }

  const approvedAt =
    nextStatus === "APPROVED" || nextStatus === "REJECTED" ? new Date() : null;
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
        nextStatus === "APPROVED" || nextStatus === "REJECTED" || nextStatus === "PAID"
          ? auth.user.id
          : null,
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

