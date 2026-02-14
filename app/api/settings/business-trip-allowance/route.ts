export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { settingsBusinessTripAllowance } from "@/lib/db/schema";
import { requireAdmin, requireSessionUser } from "@/lib/auth/server";
import {
  BUSINESS_TRIP_TITLES,
  DEFAULT_BUSINESS_TRIP_COMPENSATION_SETTINGS,
  normalizeOpeRules,
  normalizeTransportOptions,
  type OpeRule,
  type TransportOption,
} from "@/lib/business-trip-allowance";

const opeRuleSchema = z.object({
  id: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(120),
  titles: z.array(z.enum(BUSINESS_TRIP_TITLES)).min(1),
  dailyAllowance: z.number().finite().min(0).max(999999999999),
});

const transportOptionSchema = z.object({
  id: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(120),
  amount: z.number().finite().min(0).max(999999999999),
});

const payloadSchema = z.object({
  opeRules: z.array(opeRuleSchema).min(1).max(50),
  mealPerDay: z.number().finite().min(0).max(999999999999),
  laundryPerWeek: z.number().finite().min(0).max(999999999999),
  laundryMinDays: z.number().int().min(0).max(31),
  transportOptions: z.array(transportOptionSchema).min(1).max(100),
});

const formatZodError = (error: z.ZodError) =>
  error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");

const slugifyId = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "item";

const ensureUniqueId = (base: string, used: Set<string>) => {
  let next = base;
  let counter = 2;
  while (used.has(next)) {
    const suffix = `-${counter}`;
    const maxBaseLength = Math.max(1, 64 - suffix.length);
    next = `${base.slice(0, maxBaseLength)}${suffix}`;
    counter += 1;
  }
  used.add(next);
  return next;
};

const sanitizeOpeRules = (rules: OpeRule[]) => {
  const usedIds = new Set<string>();
  return normalizeOpeRules(rules).map((rule) => ({
    ...rule,
    id: ensureUniqueId(slugifyId(rule.label), usedIds),
  }));
};

const sanitizeTransportOptions = (options: TransportOption[]) => {
  const usedIds = new Set<string>();
  return normalizeTransportOptions(options).map((item) => ({
    ...item,
    id: ensureUniqueId(slugifyId(item.label), usedIds),
  }));
};

const findDuplicateTitles = (rules: OpeRule[]) => {
  const firstOwner = new Map<string, string>();
  const duplicates: string[] = [];
  for (const rule of rules) {
    for (const title of rule.titles) {
      const key = title.trim().toLowerCase();
      if (!key) continue;
      if (firstOwner.has(key) && firstOwner.get(key) !== rule.label) {
        duplicates.push(title);
      } else {
        firstOwner.set(key, rule.label);
      }
    }
  }
  return Array.from(new Set(duplicates));
};

const parseOpeRules = (value: string | null | undefined): OpeRule[] => {
  if (!value) return DEFAULT_BUSINESS_TRIP_COMPENSATION_SETTINGS.opeRules;
  try {
    const parsed = z.array(opeRuleSchema).parse(JSON.parse(value));
    return parsed;
  } catch {
    return DEFAULT_BUSINESS_TRIP_COMPENSATION_SETTINGS.opeRules;
  }
};

const parseTransportOptions = (value: string | null | undefined): TransportOption[] => {
  if (!value) return DEFAULT_BUSINESS_TRIP_COMPENSATION_SETTINGS.transportOptions;
  try {
    const parsed = z.array(transportOptionSchema).parse(JSON.parse(value));
    return parsed;
  } catch {
    return DEFAULT_BUSINESS_TRIP_COMPENSATION_SETTINGS.transportOptions;
  }
};

export async function GET() {
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  const db = getDb();
  const [row] = await db.select().from(settingsBusinessTripAllowance).limit(1);
  if (!row) {
    return NextResponse.json(DEFAULT_BUSINESS_TRIP_COMPENSATION_SETTINGS);
  }

  return NextResponse.json({
    opeRules: parseOpeRules(row.allowanceRuleJson),
    mealPerDay: Number(row.mealPerDay),
    laundryPerWeek: Number(row.laundryPerWeek),
    laundryMinDays: row.laundryMinDays,
    transportOptions: parseTransportOptions(row.transportOptionJson),
  });
}

export async function PUT(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const rawBody = await request.json().catch(() => null);
  const parsed = payloadSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Payload tidak valid: ${formatZodError(parsed.error)}` },
      { status: 400 }
    );
  }

  const payload = parsed.data;
  const opeRules = sanitizeOpeRules(payload.opeRules);
  const transportOptions = sanitizeTransportOptions(payload.transportOptions);
  if (opeRules.length === 0 || transportOptions.length === 0) {
    return NextResponse.json(
      { error: "Rule OPE dan opsi transport minimal harus memiliki satu item valid" },
      { status: 400 }
    );
  }

  const duplicateTitles = findDuplicateTitles(opeRules);
  if (duplicateTitles.length > 0) {
    return NextResponse.json(
      {
        error: `Title tidak boleh ada di lebih dari satu rule OPE: ${duplicateTitles.join(", ")}`,
      },
      { status: 400 }
    );
  }

  const now = new Date();
  const db = getDb();
  const [updated] = await db
    .insert(settingsBusinessTripAllowance)
    .values({
      id: "default",
      allowanceRuleJson: JSON.stringify(opeRules),
      mealPerDay: payload.mealPerDay.toString(),
      laundryPerWeek: payload.laundryPerWeek.toString(),
      laundryMinDays: payload.laundryMinDays,
      transportOptionJson: JSON.stringify(transportOptions),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: settingsBusinessTripAllowance.id,
      set: {
        allowanceRuleJson: JSON.stringify(opeRules),
        mealPerDay: payload.mealPerDay.toString(),
        laundryPerWeek: payload.laundryPerWeek.toString(),
        laundryMinDays: payload.laundryMinDays,
        transportOptionJson: JSON.stringify(transportOptions),
        updatedAt: now,
      },
    })
    .returning();

  return NextResponse.json({
    opeRules: parseOpeRules(updated.allowanceRuleJson),
    mealPerDay: Number(updated.mealPerDay),
    laundryPerWeek: Number(updated.laundryPerWeek),
    laundryMinDays: updated.laundryMinDays,
    transportOptions: parseTransportOptions(updated.transportOptionJson),
  });
}
