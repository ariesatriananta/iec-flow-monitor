export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { reimbursements } from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/server";

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  const body = await request.json();
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
          body.amount !== undefined ? Number(body.amount).toString() : undefined,
        description: body.description ?? undefined,
        receiptUrl: body.receiptUrl ?? undefined,
        status: body.status === "CANCELLED" ? "CANCELLED" : existing.status,
        updatedAt: new Date(),
      })
      .where(eq(reimbursements.id, params.id))
      .returning();

    return NextResponse.json(updated);
  }

  const nextStatus = body.status ?? existing.status;
  const approvedAt =
    nextStatus === "APPROVED" || nextStatus === "REJECTED" ? new Date() : null;
  const paidAt = nextStatus === "PAID" ? new Date() : existing.paidAt;

  const [updated] = await db
    .update(reimbursements)
    .set({
      category: body.category ?? undefined,
      amount: body.amount !== undefined ? Number(body.amount).toString() : undefined,
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
      paidProofUrl: body.paidProofUrl ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(reimbursements.id, params.id))
    .returning();

  return NextResponse.json(updated);
}
