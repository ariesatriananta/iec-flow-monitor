export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { and, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  employees,
  reimbursementAttachments,
  reimbursementItems,
  reimbursements,
  settingsApprovalFlow,
  users,
} from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/server";
import {
  createWorkflowEvent,
  fetchWorkflowEventsByEntityIds,
} from "@/lib/workflow-events";
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

const querySchema = z.object({
  status: workflowStatusSchema.optional(),
  queue: z.enum(["mine"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
  q: z.string().trim().max(100).optional(),
});

const createSchema = z.object({
  submissionDate: z
    .string()
    .trim()
    .refine((value) => !Number.isNaN(new Date(value).getTime()), "Format tanggal pengajuan tidak valid"),
  items: z
    .array(
      z.object({
        expenseDate: z
          .string()
          .trim()
          .refine((value) => !Number.isNaN(new Date(value).getTime()), "Format tanggal item tidak valid"),
        category: z.string().trim().min(1).max(50),
        clientName: z.string().trim().max(255).optional(),
        description: z.string().trim().max(2000).optional(),
        amount: z.number().positive().max(999999999999),
        attachment: attachmentSchema,
      })
    )
    .min(1)
    .max(MAX_REIMBURSEMENT_FILES),
  description: z.string().trim().max(2000).optional(),
});

const formatZodError = (error: z.ZodError) =>
  error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");

export async function GET(request: Request) {
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  const url = new URL(request.url);
  const parsedQuery = querySchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    queue: url.searchParams.get("queue") ?? undefined,
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

  const { status, queue, limit, offset, q } = parsedQuery.data;
  const conditions: SQL[] = [];
  const db = getDb();
  let isApproverLevel1 = false;
  let isApproverLevel2 = false;
  let isApprover = false;
  let reimbursementApprovalLevels: 1 | 2 = 2;

  if (!auth.user.employeeId) {
    if (queue === "mine") {
      return NextResponse.json(
        { error: "Akun belum terhubung ke employee" },
        { status: 403 }
      );
    }
  }

  if (auth.user.employeeId) {
    const [approvalFlow] = await db.select().from(settingsApprovalFlow).limit(1);
    reimbursementApprovalLevels = approvalFlow?.reimbursementApprovalLevels === 1 ? 1 : 2;
    isApproverLevel1 =
      auth.user.employeeId === (approvalFlow?.reimbursementApproverLevel1EmployeeId ?? null);
    isApproverLevel2 =
      reimbursementApprovalLevels === 2 &&
      auth.user.employeeId === (approvalFlow?.reimbursementApproverLevel2EmployeeId ?? null);
    isApprover = isApproverLevel1 || isApproverLevel2;
  }

  if (queue === "mine") {
    const queueConditions: SQL[] = [];
    if (isApproverLevel1) queueConditions.push(eq(reimbursements.status, "SUBMITTED"));
    if (isApproverLevel2 && reimbursementApprovalLevels === 2) {
      queueConditions.push(eq(reimbursements.status, "WAITING_LEVEL_2"));
    }
    if (queueConditions.length === 0) {
      conditions.push(sql`1 = 0`);
    } else if (queueConditions.length === 1) {
      conditions.push(queueConditions[0]);
    } else {
      conditions.push(or(...queueConditions) as SQL);
    }
  } else if (auth.user.role !== "ADMIN") {
    if (!auth.user.employeeId) {
      return NextResponse.json(
        { error: "Akun belum terhubung ke employee" },
        { status: 403 }
      );
    }
    if (!isApprover) {
      conditions.push(eq(reimbursements.employeeId, auth.user.employeeId));
    }
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

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const approverStatusPriority = sql<number>`
    case
      when ${reimbursements.status} = 'SUBMITTED' then 0
      when ${reimbursements.status} = 'WAITING_LEVEL_2' then 1
      when ${reimbursements.status} = 'REJECTED' then 2
      when ${reimbursements.status} = 'APPROVED' then 3
      when ${reimbursements.status} = 'PAID' then 4
      when ${reimbursements.status} = 'CANCELLED' then 5
      else 6
    end
  `;

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
        .orderBy(
          ...(isApprover ? [approverStatusPriority] : []),
          desc(reimbursements.createdAt)
        )
        .limit(limit)
        .offset(offset)
    : await db
        .select({ reimbursement: reimbursements, employee: employees, user: users })
        .from(reimbursements)
        .leftJoin(employees, eq(reimbursements.employeeId, employees.id))
        .leftJoin(users, eq(users.employeeId, employees.id))
        .orderBy(
          ...(isApprover ? [approverStatusPriority] : []),
          desc(reimbursements.createdAt)
        )
        .limit(limit)
        .offset(offset);

  const reimbursementIds = rows.map(({ reimbursement }) => reimbursement.id);
  const itemRows =
    reimbursementIds.length > 0
      ? await db
          .select()
          .from(reimbursementItems)
          .where(inArray(reimbursementItems.reimbursementId, reimbursementIds))
      : [];

  const attachments =
    reimbursementIds.length > 0
      ? await db
          .select()
          .from(reimbursementAttachments)
          .where(inArray(reimbursementAttachments.reimbursementId, reimbursementIds))
      : [];
  const attachmentsByReimbursementId = new Map<string, typeof attachments>();
  const receiptAttachmentByItemId = new Map<string, (typeof attachments)[number]>();

  for (const attachment of attachments) {
    const existing = attachmentsByReimbursementId.get(attachment.reimbursementId);
    if (existing) {
      existing.push(attachment);
    } else {
      attachmentsByReimbursementId.set(attachment.reimbursementId, [attachment]);
    }
    if (
      attachment.purpose === "RECEIPT" &&
      attachment.reimbursementItemId &&
      !receiptAttachmentByItemId.has(attachment.reimbursementItemId)
    ) {
      receiptAttachmentByItemId.set(attachment.reimbursementItemId, attachment);
    }
  }

  const itemsByReimbursementId = new Map<string, typeof itemRows>();
  for (const item of itemRows) {
    const withAttachment = {
      ...item,
      attachment: receiptAttachmentByItemId.get(item.id) ?? null,
    };
    const existing = itemsByReimbursementId.get(item.reimbursementId);
    if (existing) {
      existing.push(withAttachment);
    } else {
      itemsByReimbursementId.set(item.reimbursementId, [withAttachment]);
    }
  }

  const items = rows.map(({ reimbursement, employee, user }) => ({
    ...reimbursement,
    items: itemsByReimbursementId.get(reimbursement.id) ?? [],
    attachments: attachmentsByReimbursementId.get(reimbursement.id) ?? [],
    employee: employee
      ? {
          id: employee.id,
          employeeCode: employee.employeeCode,
          fullName: employee.fullName,
          title: employee.title,
          department: employee.department,
          bankAccountName: employee.bankAccountName,
          bankAccountNumber: employee.bankAccountNumber,
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
  const eventsByEntity = await fetchWorkflowEventsByEntityIds(
    db,
    "REIMBURSEMENT",
    items.map((item) => item.id)
  );
  const itemsWithEvents = items.map((item) => ({
    ...item,
    workflowEvents: eventsByEntity.get(item.id) ?? [],
  }));
  const hasMore = offset + items.length < total;

  return NextResponse.json({
    items: itemsWithEvents,
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
  const submissionDate = new Date(body.submissionDate);
  const totalAmount = body.items.reduce((sum, item) => sum + item.amount, 0);
  const summaryCategory = body.items.length === 1 ? body.items[0].category : "MULTI_ITEM";
  const receiptUrlFromAttachment = body.items[0]?.attachment.url ?? null;

  const db = getDb();
  const reimbursementId = crypto.randomUUID();
  const [created] = await db
    .insert(reimbursements)
    .values({
      id: reimbursementId,
      employeeId: targetEmployeeId,
      category: summaryCategory,
      amount: totalAmount.toString(),
      itemCount: body.items.length,
      submissionDate,
      description: body.description ?? null,
      receiptUrl: receiptUrlFromAttachment,
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

  await createWorkflowEvent(db, {
    module: "REIMBURSEMENT",
    entityId: created.id,
    action: "SUBMITTED",
    fromStatus: null,
    toStatus: created.status,
    note: body.description ?? null,
    actorUserId: auth.user.id,
    actorEmployeeId: auth.user.employeeId,
  });

  const [approvalFlow] = await db.select().from(settingsApprovalFlow).limit(1);
  const approverMap = await resolveUserIdsByEmployeeIds(db, [
    approvalFlow?.reimbursementApproverLevel1EmployeeId ?? null,
  ]);
  const approverUserId = approvalFlow?.reimbursementApproverLevel1EmployeeId
    ? approverMap.get(approvalFlow.reimbursementApproverLevel1EmployeeId)
    : null;
  if (approverUserId && approverUserId !== auth.user.id) {
    await createNotificationsForUsers(db, [approverUserId], {
      type: "REIMBURSEMENT_SUBMITTED",
      title: "Pengajuan Reimbursement Baru",
      message: "Ada pengajuan reimbursement baru yang menunggu approval level 1.",
      entityType: "REIMBURSEMENT",
      entityId: created.id,
    });
  }

  const itemRecords = body.items.map((item) => ({
      id: crypto.randomUUID(),
      reimbursementId,
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
      reimbursementId,
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

  const createdItemsRaw = await db
    .select()
    .from(reimbursementItems)
    .where(eq(reimbursementItems.reimbursementId, reimbursementId));
  const attachments = await db
    .select()
    .from(reimbursementAttachments)
    .where(eq(reimbursementAttachments.reimbursementId, reimbursementId));
  const receiptAttachmentByItemIdCreated = new Map<string, (typeof attachments)[number]>();
  for (const attachment of attachments) {
    if (attachment.purpose === "RECEIPT" && attachment.reimbursementItemId) {
      receiptAttachmentByItemIdCreated.set(attachment.reimbursementItemId, attachment);
    }
  }
  const createdItems = createdItemsRaw.map((item) => ({
    ...item,
    attachment: receiptAttachmentByItemIdCreated.get(item.id) ?? null,
  }));

  return NextResponse.json({ ...created, items: createdItems, attachments }, { status: 201 });
}
