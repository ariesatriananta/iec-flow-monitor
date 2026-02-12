export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { and, desc, eq, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { employees, users } from "@/lib/db/schema";
import { requireAdmin, requireSessionUser } from "@/lib/auth/server";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
  q: z.string().trim().max(100).optional(),
});

const employeeGenderSchema = z.enum(["MALE", "FEMALE"]);

const createEmployeeSchema = z.object({
  fullName: z.string().trim().min(1, "fullName wajib diisi"),
  nip: z.string().trim().min(1, "nip wajib diisi"),
  gender: employeeGenderSchema,
  title: z.string().trim().min(1, "title wajib dipilih"),
  department: z.string().trim().min(1, "department wajib dipilih"),
  workLocation: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.string().trim().email("Format email tidak valid").optional().or(z.literal("")),
  bankAccountName: z.string().trim().optional(),
  bankAccountNumber: z.string().trim().optional(),
  isActive: z.boolean().optional(),
});

const formatZodError = (error: z.ZodError) =>
  error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");

const EMPLOYEE_CODE_PREFIX = "EM";
const EMPLOYEE_CODE_PAD = 3;
const MAX_EMPLOYEE_CODE_ATTEMPT = 5;

const generateNextEmployeeCode = async () => {
  const db = getDb();
  const [row] = await db
    .select({
      maxSeq: sql<number>`coalesce(max((substring(${employees.employeeCode} from '^EM([0-9]+)$'))::integer), 0)`,
    })
    .from(employees);

  const next = Number(row?.maxSeq ?? 0) + 1;
  return `${EMPLOYEE_CODE_PREFIX}${String(next).padStart(EMPLOYEE_CODE_PAD, "0")}`;
};

export async function GET(request: Request) {
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  const url = new URL(request.url);
  const parsedQuery = querySchema.safeParse({
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

  const { limit, offset, q } = parsedQuery.data;
  const db = getDb();
  const conditions: SQL[] = [];
  if (auth.user.role !== "ADMIN") {
    conditions.push(eq(users.id, auth.user.id));
  }

  const search = q?.trim().toLowerCase();
  if (search) {
    const like = `%${search}%`;
    conditions.push(
      or(
        sql`lower(${employees.employeeCode}) like ${like}`,
        sql`lower(coalesce(${employees.fullName}, '')) like ${like}`,
        sql`lower(coalesce(${employees.nip}, '')) like ${like}`,
        sql`lower(coalesce(${employees.gender}, '')) like ${like}`,
        sql`lower(coalesce(${employees.department}, '')) like ${like}`,
        sql`lower(coalesce(${employees.title}, '')) like ${like}`,
        sql`lower(coalesce(${employees.workLocation}, '')) like ${like}`,
        sql`lower(coalesce(${employees.phone}, '')) like ${like}`,
        sql`lower(coalesce(${employees.email}, '')) like ${like}`,
        sql`lower(coalesce(${users.name}, '')) like ${like}`,
        sql`lower(coalesce(${users.username}, '')) like ${like}`
      ) as SQL
    );
  }
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const totalResult = whereClause
    ? await db
        .select({ count: sql<string>`count(*)` })
        .from(employees)
        .leftJoin(users, eq(users.employeeId, employees.id))
        .where(whereClause)
    : await db
        .select({ count: sql<string>`count(*)` })
        .from(employees)
        .leftJoin(users, eq(users.employeeId, employees.id));
  const total = Number(totalResult[0]?.count ?? 0);

  const rows = whereClause
    ? await db
        .select({ employee: employees, user: users })
        .from(employees)
        .leftJoin(users, eq(users.employeeId, employees.id))
        .where(whereClause)
        .orderBy(desc(employees.updatedAt))
        .limit(limit)
        .offset(offset)
    : await db
        .select({ employee: employees, user: users })
        .from(employees)
        .leftJoin(users, eq(users.employeeId, employees.id))
        .orderBy(desc(employees.updatedAt))
        .limit(limit)
        .offset(offset);

  const items = rows.map(({ employee, user }) => ({
    ...employee,
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

  return NextResponse.json(
    {
      items,
      total,
      limit,
      offset,
      hasMore,
      nextOffset: hasMore ? offset + items.length : null,
    }
  );
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const body = await request.json();
  const parsedBody = createEmployeeSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: `Body tidak valid: ${formatZodError(parsedBody.error)}` },
      { status: 400 }
    );
  }

  const input = parsedBody.data;
  const db = getDb();

  let created: typeof employees.$inferSelect | undefined;

  for (let attempt = 1; attempt <= MAX_EMPLOYEE_CODE_ATTEMPT; attempt += 1) {
    const now = new Date();
    const employeeCode = await generateNextEmployeeCode();

    try {
      [created] = await db
        .insert(employees)
        .values({
          id: crypto.randomUUID(),
          employeeCode,
          fullName: input.fullName,
          nip: input.nip,
          gender: input.gender,
          title: input.title,
          department: input.department,
          workLocation: input.workLocation || null,
          phone: input.phone || null,
          email: input.email || null,
          bankAccountName: input.bankAccountName || null,
          bankAccountNumber: input.bankAccountNumber || null,
          isActive: input.isActive ?? true,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      break;
    } catch (error) {
      const isUniqueCodeConflict =
        attempt < MAX_EMPLOYEE_CODE_ATTEMPT &&
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "23505";
      if (!isUniqueCodeConflict) {
        throw error;
      }
    }
  }

  if (!created) {
    return NextResponse.json(
      { error: "Gagal generate employee code, silakan coba lagi" },
      { status: 500 }
    );
  }

  return NextResponse.json(created, { status: 201 });
}
