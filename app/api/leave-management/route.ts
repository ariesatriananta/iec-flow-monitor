export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { and, desc, eq, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { employees, leaveRequests, settingsApprovalFlow, users } from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/server";
import {
  createWorkflowEvent,
  fetchWorkflowEventsByEntityIds,
} from "@/lib/workflow-events";
import {
  createNotificationsForUsers,
  resolveUserIdsByEmployeeIds,
} from "@/lib/notifications";

const workflowStatusSchema = z.union([
  z.literal("SUBMITTED"),
  z.literal("WAITING_LEVEL_2"),
  z.literal("APPROVED"),
  z.literal("REJECTED"),
  z.literal("CANCELLED"),
]);

const dateStringSchema = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(new Date(value).getTime()), "Format tanggal tidak valid");

const querySchema = z.object({
  status: workflowStatusSchema.optional(),
  queue: z.enum(["mine"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
  q: z.string().trim().max(100).optional(),
});

const createSchema = z.object({
  leaveType: z.string().trim().min(1).max(50),
  reason: z.string().trim().min(1).max(2000),
  startDate: dateStringSchema,
  endDate: dateStringSchema,
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
  let leaveApprovalLevels: 1 | 2 = 2;

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
    leaveApprovalLevels = approvalFlow?.leaveApprovalLevels === 1 ? 1 : 2;
    isApproverLevel1 =
      auth.user.employeeId === (approvalFlow?.leaveApproverLevel1EmployeeId ?? null);
    isApproverLevel2 =
      leaveApprovalLevels === 2 &&
      auth.user.employeeId === (approvalFlow?.leaveApproverLevel2EmployeeId ?? null);
    isApprover = isApproverLevel1 || isApproverLevel2;
  }

  if (queue === "mine") {
    const queueConditions: SQL[] = [];
    if (isApproverLevel1) queueConditions.push(eq(leaveRequests.status, "SUBMITTED"));
    if (isApproverLevel2 && leaveApprovalLevels === 2) {
      queueConditions.push(eq(leaveRequests.status, "WAITING_LEVEL_2"));
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
      conditions.push(eq(leaveRequests.employeeId, auth.user.employeeId));
    }
  }
  if (status) {
    conditions.push(eq(leaveRequests.status, status));
  }
  const search = q?.trim().toLowerCase();
  if (search) {
    const like = `%${search}%`;
    conditions.push(
      or(
        sql`lower(coalesce(${employees.fullName}, '')) like ${like}`,
        sql`lower(coalesce(${users.name}, '')) like ${like}`,
        sql`lower(${leaveRequests.leaveType}) like ${like}`,
        sql`lower(${leaveRequests.reason}) like ${like}`,
        sql`lower(${leaveRequests.status}) like ${like}`
      ) as SQL
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const approverStatusPriority = sql<number>`
    case
      when ${leaveRequests.status} = 'SUBMITTED' then 0
      when ${leaveRequests.status} = 'WAITING_LEVEL_2' then 1
      when ${leaveRequests.status} = 'REJECTED' then 2
      when ${leaveRequests.status} = 'APPROVED' then 3
      when ${leaveRequests.status} = 'CANCELLED' then 4
      else 5
    end
  `;

  const totalResult = whereClause
    ? await db
        .select({ count: sql<string>`count(*)` })
        .from(leaveRequests)
        .leftJoin(employees, eq(leaveRequests.employeeId, employees.id))
        .leftJoin(users, eq(users.employeeId, employees.id))
        .where(whereClause)
    : await db
        .select({ count: sql<string>`count(*)` })
        .from(leaveRequests)
        .leftJoin(employees, eq(leaveRequests.employeeId, employees.id))
        .leftJoin(users, eq(users.employeeId, employees.id));
  const total = Number(totalResult[0]?.count ?? 0);

  const rows = whereClause
    ? await db
        .select({ request: leaveRequests, employee: employees, user: users })
        .from(leaveRequests)
        .leftJoin(employees, eq(leaveRequests.employeeId, employees.id))
        .leftJoin(users, eq(users.employeeId, employees.id))
        .where(whereClause)
        .orderBy(
          ...(isApprover ? [approverStatusPriority] : []),
          desc(leaveRequests.createdAt)
        )
        .limit(limit)
        .offset(offset)
    : await db
        .select({ request: leaveRequests, employee: employees, user: users })
        .from(leaveRequests)
        .leftJoin(employees, eq(leaveRequests.employeeId, employees.id))
        .leftJoin(users, eq(users.employeeId, employees.id))
        .orderBy(
          ...(isApprover ? [approverStatusPriority] : []),
          desc(leaveRequests.createdAt)
        )
        .limit(limit)
        .offset(offset);

  const items = rows.map(({ request, employee, user }) => ({
    ...request,
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
  const eventsByEntity = await fetchWorkflowEventsByEntityIds(
    db,
    "LEAVE",
    items.map((item) => item.id)
  );
  const itemsWithEvents = items.map((item) => ({
    ...item,
    workflowEvents: eventsByEntity.get(item.id) ?? [],
  }));
  const hasMore = offset + items.length < total;

  return NextResponse.json(
    {
      items: itemsWithEvents,
      total,
      limit,
      offset,
      hasMore,
      nextOffset: hasMore ? offset + items.length : null,
    }
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
  const targetEmployeeId = auth.user.employeeId;
  if (!targetEmployeeId) {
    return NextResponse.json(
      { error: "Akun belum terhubung ke employee" },
      { status: 403 }
    );
  }

  const startDate = new Date(body.startDate);
  const endDate = new Date(body.endDate);
  if (endDate < startDate) {
    return NextResponse.json(
      { error: "Rentang tanggal cuti tidak valid" },
      { status: 400 }
    );
  }

  const now = new Date();
  const db = getDb();
  const [created] = await db
    .insert(leaveRequests)
    .values({
      id: crypto.randomUUID(),
      employeeId: targetEmployeeId,
      leaveType: body.leaveType,
      reason: body.reason,
      startDate,
      endDate,
      status: "SUBMITTED",
      adminNote: null,
      approvedBy: null,
      approvedAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  await createWorkflowEvent(db, {
    module: "LEAVE",
    entityId: created.id,
    action: "SUBMITTED",
    fromStatus: null,
    toStatus: created.status,
    note: body.reason,
    actorUserId: auth.user.id,
    actorEmployeeId: auth.user.employeeId,
  });

  const [approvalFlow] = await db.select().from(settingsApprovalFlow).limit(1);
  const approverMap = await resolveUserIdsByEmployeeIds(db, [
    approvalFlow?.leaveApproverLevel1EmployeeId ?? null,
  ]);
  const approverUserId = approvalFlow?.leaveApproverLevel1EmployeeId
    ? approverMap.get(approvalFlow.leaveApproverLevel1EmployeeId)
    : null;
  if (approverUserId && approverUserId !== auth.user.id) {
    await createNotificationsForUsers(db, [approverUserId], {
      type: "LEAVE_SUBMITTED",
      title: "Pengajuan Cuti Baru",
      message: "Ada pengajuan cuti baru yang menunggu approval level 1.",
      entityType: "LEAVE",
      entityId: created.id,
    });
  }

  return NextResponse.json(created, { status: 201 });
}
