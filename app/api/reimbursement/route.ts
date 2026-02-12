export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { and, eq, inArray, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  reimbursementAttachments,
  reimbursements,
  users,
} from "@/lib/db/schema";
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

const querySchema = z.object({
  status: workflowStatusSchema.optional(),
});

const createSchema = z.object({
  userId: z.string().trim().min(1).max(128).optional(),
  category: z.string().trim().min(1).max(50),
  amount: z.number().positive().max(999999999999),
  description: z.string().trim().max(2000).optional(),
  receiptUrl: z.string().trim().min(1).max(2000).optional(),
  attachments: z.array(attachmentSchema).max(20).optional(),
});

const formatZodError = (error: z.ZodError) =>
  error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");

export async function GET(request: Request) {
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  const url = new URL(request.url);
  const parsedQuery = querySchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
  });
  if (!parsedQuery.success) {
    return NextResponse.json(
      { error: `Query tidak valid: ${formatZodError(parsedQuery.error)}` },
      { status: 400 }
    );
  }

  const { status } = parsedQuery.data;
  const conditions: SQL[] = [];

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

  const reimbursementIds = rows.map(({ reimbursement }) => reimbursement.id);
  const attachments =
    reimbursementIds.length > 0
      ? await db
          .select()
          .from(reimbursementAttachments)
          .where(inArray(reimbursementAttachments.reimbursementId, reimbursementIds))
      : [];
  const attachmentsByReimbursementId = new Map<string, typeof attachments>();

  for (const attachment of attachments) {
    const existing = attachmentsByReimbursementId.get(attachment.reimbursementId);
    if (existing) {
      existing.push(attachment);
    } else {
      attachmentsByReimbursementId.set(attachment.reimbursementId, [attachment]);
    }
  }

  return NextResponse.json(
    rows.map(({ reimbursement, user }) => ({
      ...reimbursement,
      attachments: attachmentsByReimbursementId.get(reimbursement.id) ?? [],
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

  const rawBody = await request.json().catch(() => null);
  const parsedBody = createSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: `Payload tidak valid: ${formatZodError(parsedBody.error)}` },
      { status: 400 }
    );
  }

  const body = parsedBody.data;
  const targetUserId =
    auth.user.role === "ADMIN" && body.userId ? body.userId : auth.user.id;

  const now = new Date();
  const incomingAttachments = body.attachments ?? [];
  const receiptUrlFromAttachment = incomingAttachments[0]?.url ?? null;

  if (!body.receiptUrl && incomingAttachments.length === 0) {
    return NextResponse.json(
      { error: "Minimal satu bukti reimbursement wajib diupload" },
      { status: 400 }
    );
  }

  const db = getDb();
  const reimbursementId = crypto.randomUUID();
  const [created] = await db
    .insert(reimbursements)
    .values({
      id: reimbursementId,
      userId: targetUserId,
      category: body.category,
      amount: body.amount.toString(),
      description: body.description ?? null,
      receiptUrl: body.receiptUrl ?? receiptUrlFromAttachment,
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

  if (incomingAttachments.length > 0) {
    await db.insert(reimbursementAttachments).values(
      incomingAttachments.map((item) => ({
        id: crypto.randomUUID(),
        reimbursementId,
        purpose: "RECEIPT",
        fileUrl: item.url,
        fileKey: item.key ?? null,
        fileName: item.fileName ?? "attachment",
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
    .where(eq(reimbursementAttachments.reimbursementId, reimbursementId));

  return NextResponse.json({ ...created, attachments }, { status: 201 });
}

