export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { and, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  businessTrips,
  employees,
  settingsApprovalFlow,
  settingsBusinessTripAllowance,
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
import {
  calculateBusinessTripCompensation,
  DEFAULT_BUSINESS_TRIP_COMPENSATION_SETTINGS,
  normalizeOpeRules,
  normalizeTransportOptions,
  type BusinessTripCompensationSettings,
  type OpeRule,
  type TransportOption,
} from "@/lib/business-trip-allowance";

const workflowStatusSchema = z.union([
  z.literal("SUBMITTED"),
  z.literal("WAITING_LEVEL_2"),
  z.literal("APPROVED"),
  z.literal("PAID"),
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
  destinationCity: z.string().trim().min(1).max(100),
  companyName: z.string().trim().min(1).max(150),
  purpose: z.string().trim().max(2000).optional(),
  startDate: dateStringSchema,
  endDate: dateStringSchema,
  isOutOfTownOvernight: z.boolean().optional().default(false),
  transportOptionId: z.string().trim().min(1).max(64),
});

const formatZodError = (error: z.ZodError) =>
  error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");

const ACTIVE_TRIP_STATUSES = ["SUBMITTED", "WAITING_LEVEL_2", "APPROVED"] as const;

const parseOpeRules = (value: string | null | undefined): OpeRule[] => {
  if (!value) return DEFAULT_BUSINESS_TRIP_COMPENSATION_SETTINGS.opeRules;
  try {
    const parsed = JSON.parse(value) as OpeRule[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return DEFAULT_BUSINESS_TRIP_COMPENSATION_SETTINGS.opeRules;
    }
    return normalizeOpeRules(parsed);
  } catch {
    return DEFAULT_BUSINESS_TRIP_COMPENSATION_SETTINGS.opeRules;
  }
};

const parseTransportOptions = (value: string | null | undefined): TransportOption[] => {
  if (!value) return DEFAULT_BUSINESS_TRIP_COMPENSATION_SETTINGS.transportOptions;
  try {
    const parsed = JSON.parse(value) as TransportOption[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return DEFAULT_BUSINESS_TRIP_COMPENSATION_SETTINGS.transportOptions;
    }
    return normalizeTransportOptions(parsed);
  } catch {
    return DEFAULT_BUSINESS_TRIP_COMPENSATION_SETTINGS.transportOptions;
  }
};

const parseCompensationSettings = (
  row: typeof settingsBusinessTripAllowance.$inferSelect | undefined
): BusinessTripCompensationSettings => {
  if (!row) return DEFAULT_BUSINESS_TRIP_COMPENSATION_SETTINGS;
  return {
    opeRules: parseOpeRules(row.allowanceRuleJson),
    mealPerDay: Number(row.mealPerDay),
    laundryPerWeek: Number(row.laundryPerWeek),
    laundryMinDays: row.laundryMinDays,
    transportOptions: parseTransportOptions(row.transportOptionJson),
  }
};

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
  let approvalLevels: 1 | 2 = 2;

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
    approvalLevels = approvalFlow?.businessTripApprovalLevels === 1 ? 1 : 2;
    isApproverLevel1 =
      auth.user.employeeId === (approvalFlow?.businessTripApproverLevel1EmployeeId ?? null);
    isApproverLevel2 =
      approvalLevels === 2 &&
      auth.user.employeeId === (approvalFlow?.businessTripApproverLevel2EmployeeId ?? null);
    isApprover = isApproverLevel1 || isApproverLevel2;
  }

  if (queue === "mine") {
    const queueConditions: SQL[] = [];
    if (isApproverLevel1) queueConditions.push(eq(businessTrips.status, "SUBMITTED"));
    if (isApproverLevel2 && approvalLevels === 2) {
      queueConditions.push(eq(businessTrips.status, "WAITING_LEVEL_2"));
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
      conditions.push(eq(businessTrips.employeeId, auth.user.employeeId));
    }
  }
  if (status) {
    conditions.push(eq(businessTrips.status, status));
  }
  const search = q?.trim().toLowerCase();
  if (search) {
    const like = `%${search}%`;
    conditions.push(
      or(
        sql`lower(coalesce(${employees.fullName}, '')) like ${like}`,
        sql`lower(coalesce(${users.name}, '')) like ${like}`,
        sql`lower(${businessTrips.destinationCity}) like ${like}`,
        sql`lower(${businessTrips.companyName}) like ${like}`,
        sql`lower(coalesce(${businessTrips.purpose}, '')) like ${like}`,
        sql`lower(${businessTrips.status}) like ${like}`
      ) as SQL
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const approverStatusPriority = sql<number>`
    case
      when ${businessTrips.status} = 'SUBMITTED' then 0
      when ${businessTrips.status} = 'WAITING_LEVEL_2' then 1
      when ${businessTrips.status} = 'REJECTED' then 2
      when ${businessTrips.status} = 'APPROVED' then 3
      when ${businessTrips.status} = 'PAID' then 4
      when ${businessTrips.status} = 'CANCELLED' then 5
      else 6
    end
  `;

  const totalResult = whereClause
    ? await db
        .select({ count: sql<string>`count(*)` })
        .from(businessTrips)
        .leftJoin(employees, eq(businessTrips.employeeId, employees.id))
        .leftJoin(users, eq(users.employeeId, employees.id))
        .where(whereClause)
    : await db
        .select({ count: sql<string>`count(*)` })
        .from(businessTrips)
        .leftJoin(employees, eq(businessTrips.employeeId, employees.id))
        .leftJoin(users, eq(users.employeeId, employees.id));
  const total = Number(totalResult[0]?.count ?? 0);

  const rows = whereClause
    ? await db
        .select({ trip: businessTrips, employee: employees, user: users })
        .from(businessTrips)
        .leftJoin(employees, eq(businessTrips.employeeId, employees.id))
        .leftJoin(users, eq(users.employeeId, employees.id))
        .where(whereClause)
        .orderBy(
          ...(isApprover ? [approverStatusPriority] : []),
          desc(businessTrips.createdAt)
        )
        .limit(limit)
        .offset(offset)
    : await db
        .select({ trip: businessTrips, employee: employees, user: users })
        .from(businessTrips)
        .leftJoin(employees, eq(businessTrips.employeeId, employees.id))
        .leftJoin(users, eq(users.employeeId, employees.id))
        .orderBy(
          ...(isApprover ? [approverStatusPriority] : []),
          desc(businessTrips.createdAt)
        )
        .limit(limit)
        .offset(offset);

  const items = rows.map(({ trip, employee, user }) => ({
    ...trip,
    compensationBreakdown: (() => {
      if (!trip.compensationBreakdownJson) return null;
      try {
        return JSON.parse(trip.compensationBreakdownJson);
      } catch {
        return null;
      }
    })(),
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
    "BUSINESS_TRIP",
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
      { error: "Rentang tanggal perjalanan tidak valid" },
      { status: 400 }
    );
  }

  const now = new Date();
  const db = getDb();
  const [employee] = await db
    .select({
      id: employees.id,
      title: employees.title,
    })
    .from(employees)
    .where(eq(employees.id, targetEmployeeId))
    .limit(1);
  if (!employee) {
    return NextResponse.json(
      { error: "Data employee tidak ditemukan" },
      { status: 404 }
    );
  }

  const [overlap] = await db
    .select({ id: businessTrips.id })
    .from(businessTrips)
    .where(
      and(
        eq(businessTrips.employeeId, targetEmployeeId),
        inArray(businessTrips.status, [...ACTIVE_TRIP_STATUSES]),
        sql`${businessTrips.startDate} <= ${endDate}`,
        sql`${businessTrips.endDate} >= ${startDate}`
      )
    )
    .limit(1);
  if (overlap) {
    return NextResponse.json(
      {
        error:
          "Tanggal perjalanan dinas bentrok dengan pengajuan lain yang masih aktif.",
      },
      { status: 400 }
    );
  }

  const [allowanceSetting] = await db
    .select()
    .from(settingsBusinessTripAllowance)
    .limit(1);
  const compensationSettings = parseCompensationSettings(allowanceSetting);
  const compensation = calculateBusinessTripCompensation({
    employeeTitle: employee.title,
    startDate,
    endDate,
    isOutOfTownOvernight: body.isOutOfTownOvernight,
    transportOptionId: body.transportOptionId,
    settings: compensationSettings,
  });
  const allowanceDaily = compensation.ope.daily;
  const allowanceDays = compensation.days;
  const allowanceTotal = compensation.ope.total;

  const [created] = await db
    .insert(businessTrips)
    .values({
      id: crypto.randomUUID(),
      employeeId: targetEmployeeId,
      destinationCity: body.destinationCity,
      companyName: body.companyName,
      purpose: body.purpose ?? null,
      startDate,
      endDate,
      status: "SUBMITTED",
      adminNote: null,
      allowanceRuleId: compensation.ope.ruleId,
      allowanceRuleLabel: compensation.ope.ruleLabel,
      allowanceDaily: allowanceDaily.toString(),
      allowanceDays,
      allowanceTotal: allowanceTotal.toString(),
      isOutOfTownOvernight: body.isOutOfTownOvernight,
      transportOptionId: body.transportOptionId,
      compensationBreakdownJson: JSON.stringify(compensation),
      compensationTotal: compensation.total.toString(),
      approvedBy: null,
      approvedAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  await createWorkflowEvent(db, {
    module: "BUSINESS_TRIP",
    entityId: created.id,
    action: "SUBMITTED",
    fromStatus: null,
    toStatus: created.status,
    note: body.purpose ?? null,
    actorUserId: auth.user.id,
    actorEmployeeId: auth.user.employeeId,
  });

  const [approvalFlow] = await db.select().from(settingsApprovalFlow).limit(1);
  const approverMap = await resolveUserIdsByEmployeeIds(db, [
    approvalFlow?.businessTripApproverLevel1EmployeeId ?? null,
  ]);
  const approverUserId = approvalFlow?.businessTripApproverLevel1EmployeeId
    ? approverMap.get(approvalFlow.businessTripApproverLevel1EmployeeId)
    : null;
  if (approverUserId && approverUserId !== auth.user.id) {
    await createNotificationsForUsers(db, [approverUserId], {
      type: "BUSINESS_TRIP_SUBMITTED",
      title: "Pengajuan Perjalanan Dinas Baru",
      message: "Ada pengajuan perjalanan dinas baru yang menunggu approval level 1.",
      entityType: "BUSINESS_TRIP",
      entityId: created.id,
    });
  }

  return NextResponse.json(
    {
      ...created,
      compensationBreakdown: compensation,
    },
    { status: 201 }
  );
}
