export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { and, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  employees,
  reimbursementAttachments,
  reimbursements,
  users,
} from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/server";

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

const querySchema = z.object({
  status: workflowStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
  q: z.string().trim().max(100).optional(),
});

const createSchema = z.object({
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
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
  });
  if (!parsedQuery.success) {
    return NextResponse.json(
      { error: `Query tidak valid: ${formatZodError(parsedQuery.error)}` },
      { status: 400 }
    );
  }

  const { status, limit, offset, q } = parsedQuery.data;
  const conditions: SQL[] = [];

  if (auth.user.role !== "ADMIN") {
    if (!auth.user.employeeId) {
      return NextResponse.json(
        { error: "Akun belum terhubung ke employee" },
        { status: 403 }
      );
    }
    conditions.push(eq(reimbursements.employeeId, auth.user.employeeId));
  }
  if (status) {
    conditions.push(eq(reimbursements.status, status));
  }
  const search = q?.trim().toLowerCase();
  if (search) {
    const like = `%${search}%`;
    conditions.push(
      or(
        sql`lower(coalesce(${employees.fullName}, '')) like ${like}`,
        sql`lower(coalesce(${users.name}, '')) like ${like}`,
        sql`lower(${reimbursements.category}) like ${like}`,
        sql`lower(coalesce(${reimbursements.description}, '')) like ${like}`,
        sql`lower(${reimbursements.status}) like ${like}`,
        sql`cast(${reimbursements.amount} as text) like ${like}`
      ) as SQL
    );
  }

  const db = getDb();
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const totalResult = whereClause
    ? await db
        .select({ count: sql<string>`count(*)` })
        .from(reimbursements)
        .leftJoin(employees, eq(reimbursements.employeeId, employees.id))
        .leftJoin(users, eq(users.employeeId, employees.id))
        .where(whereClause)
    : await db
        .select({ count: sql<string>`count(*)` })
        .from(reimbursements)
        .leftJoin(employees, eq(reimbursements.employeeId, employees.id))
        .leftJoin(users, eq(users.employeeId, employees.id));
  const total = Number(totalResult[0]?.count ?? 0);

  const rows = whereClause
    ? await db
        .select({ reimbursement: reimbursements, employee: employees, user: users })
        .from(reimbursements)
        .leftJoin(employees, eq(reimbursements.employeeId, employees.id))
        .leftJoin(users, eq(users.employeeId, employees.id))
        .where(whereClause)
        .orderBy(desc(reimbursements.createdAt))
        .limit(limit)
        .offset(offset)
    : await db
        .select({ reimbursement: reimbursements, employee: employees, user: users })
        .from(reimbursements)
        .leftJoin(employees, eq(reimbursements.employeeId, employees.id))
        .leftJoin(users, eq(users.employeeId, employees.id))
        .orderBy(desc(reimbursements.createdAt))
        .limit(limit)
        .offset(offset);

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

  const items = rows.map(({ reimbursement, employee, user }) => ({
    ...reimbursement,
    attachments: attachmentsByReimbursementId.get(reimbursement.id) ?? [],
    employee: employee
      ? {
          id: employee.id,
          employeeCode: employee.employeeCode,
          fullName: employee.fullName,
          title: employee.title,
          department: employee.department,
        }
      : undefined,
    user: user
      ? {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role,
        }
      : undefined,
  }));
  const hasMore = offset + items.length < total;

  return NextResponse.json({
    items,
    total,
    limit,
    offset,
    hasMore,
    nextOffset: hasMore ? offset + items.length : null,
  });
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
  const targetEmployeeId = auth.user.employeeId;
  if (!targetEmployeeId) {
    return NextResponse.json(
      { error: "Akun belum terhubung ke employee" },
      { status: 403 }
    );
  }

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
      employeeId: targetEmployeeId,
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
