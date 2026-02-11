export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { reimbursements, users } from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/server";

export async function GET(request: Request) {
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  const status = new URL(request.url).searchParams.get("status");
  const conditions = [];

  if (auth.user.role !== "ADMIN") {
    conditions.push(eq(reimbursements.userId, auth.user.id));
  }
  if (status) {
    conditions.push(eq(reimbursements.status, status));
  }

  const db = getDb();
  const baseQuery = db
    .select({ reimbursement: reimbursements, user: users })
    .from(reimbursements)
    .leftJoin(users, eq(reimbursements.userId, users.id));
  const rows =
    conditions.length > 0
      ? await baseQuery.where(and(...conditions))
      : await baseQuery;

  return NextResponse.json(
    rows.map(({ reimbursement, user }) => ({
      ...reimbursement,
      user: user
        ? {
            id: user.id,
            username: user.username,
            name: user.name,
            role: user.role,
          }
        : undefined,
    }))
  );
}

export async function POST(request: Request) {
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  const body = await request.json();
  if (!body?.category || body?.amount === undefined) {
    return NextResponse.json(
      { error: "Kategori dan nominal reimbursement wajib diisi" },
      { status: 400 }
    );
  }

  const amount = Number(body.amount);
  if (Number.isNaN(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "Nominal reimbursement tidak valid" },
      { status: 400 }
    );
  }

  const targetUserId =
    auth.user.role === "ADMIN" && body?.userId ? body.userId : auth.user.id;

  const now = new Date();
  const db = getDb();
  const [created] = await db
    .insert(reimbursements)
    .values({
      id: crypto.randomUUID(),
      userId: targetUserId,
      category: body.category,
      amount: amount.toString(),
      description: body.description ?? null,
      receiptUrl: body.receiptUrl ?? null,
      status: "SUBMITTED",
      adminNote: null,
      approvedBy: null,
      approvedAt: null,
      paidAt: null,
      paidProofUrl: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
