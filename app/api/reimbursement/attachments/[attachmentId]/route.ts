export const dynamic = "force-dynamic";

import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { reimbursementAttachments, reimbursements } from "@/lib/db/schema";
import { deleteObjectFromR2, tryResolveObjectKeyFromUrl } from "@/lib/storage/r2";

export async function DELETE(
  _request: Request,
  { params }: { params: { attachmentId: string } }
) {
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  const db = getDb();
  const [attachment] = await db
    .select()
    .from(reimbursementAttachments)
    .where(eq(reimbursementAttachments.id, params.attachmentId))
    .limit(1);

  if (!attachment) {
    return NextResponse.json({ error: "Attachment tidak ditemukan" }, { status: 404 });
  }

  const [reimbursement] = await db
    .select()
    .from(reimbursements)
    .where(eq(reimbursements.id, attachment.reimbursementId))
    .limit(1);

  if (!reimbursement) {
    return NextResponse.json({ error: "Reimbursement tidak ditemukan" }, { status: 404 });
  }

  const isAdmin = auth.user.role === "ADMIN";
  if (!isAdmin) {
    const isOwnData =
      Boolean(auth.user.employeeId) && reimbursement.employeeId === auth.user.employeeId;
    const isEditable = reimbursement.status === "SUBMITTED";
    const isReceipt = attachment.purpose.toUpperCase() === "RECEIPT";
    if (!isOwnData || !isEditable || !isReceipt) {
      return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
    }
  }

  const fileKey = attachment.fileKey || tryResolveObjectKeyFromUrl(attachment.fileUrl);
  if (fileKey) {
    await deleteObjectFromR2(fileKey);
  }

  await db
    .delete(reimbursementAttachments)
    .where(eq(reimbursementAttachments.id, params.attachmentId));

  const [nextReceipt] = await db
    .select()
    .from(reimbursementAttachments)
    .where(
      and(
        eq(reimbursementAttachments.reimbursementId, reimbursement.id),
        eq(reimbursementAttachments.purpose, "RECEIPT")
      )
    )
    .limit(1);

  const [nextPaidProof] = await db
    .select()
    .from(reimbursementAttachments)
    .where(
      and(
        eq(reimbursementAttachments.reimbursementId, reimbursement.id),
        eq(reimbursementAttachments.purpose, "PAID_PROOF")
      )
    )
    .limit(1);

  await db
    .update(reimbursements)
    .set({
      receiptUrl: nextReceipt?.fileUrl ?? null,
      paidProofUrl: nextPaidProof?.fileUrl ?? null,
      updatedAt: new Date(),
    })
    .where(eq(reimbursements.id, reimbursement.id));

  return NextResponse.json({ success: true });
}
