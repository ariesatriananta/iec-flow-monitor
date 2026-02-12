export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { settingsWorkSchedule } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/server";

const defaultPayload = {
  timezone: "Asia/Jakarta",
  checkInDeadline: "10:00",
  workStart: "08:00",
  workEnd: "17:00",
  allowFlexibleCheckout: true,
  workingDays: {
    monday: true,
    tuesday: true,
    wednesday: true,
    thursday: true,
    friday: true,
    saturday: false,
    sunday: false,
  },
};

const hhmmSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Format jam harus HH:mm");

const workingDaysSchema = z.object({
  monday: z.boolean(),
  tuesday: z.boolean(),
  wednesday: z.boolean(),
  thursday: z.boolean(),
  friday: z.boolean(),
  saturday: z.boolean(),
  sunday: z.boolean(),
});

const payloadSchema = z.object({
  timezone: z
    .string()
    .trim()
    .min(3, "Timezone minimal 3 karakter")
    .max(64, "Timezone maksimal 64 karakter"),
  checkInDeadline: hhmmSchema,
  workStart: hhmmSchema,
  workEnd: hhmmSchema,
  allowFlexibleCheckout: z.boolean(),
  workingDays: workingDaysSchema,
});

const formatZodError = (error: z.ZodError) =>
  error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");

export async function GET() {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const db = getDb();
  const [row] = await db.select().from(settingsWorkSchedule).limit(1);
  if (!row) return NextResponse.json(defaultPayload);

  let workingDays = defaultPayload.workingDays;
  try {
    const parsed = workingDaysSchema.parse(JSON.parse(row.workingDaysJson));
    workingDays = parsed;
  } catch {
    workingDays = defaultPayload.workingDays;
  }

  return NextResponse.json({
    timezone: row.timezone,
    checkInDeadline: row.checkInDeadline,
    workStart: row.workStart,
    workEnd: row.workEnd,
    allowFlexibleCheckout: row.allowFlexibleCheckout,
    workingDays,
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
  const now = new Date();
  const db = getDb();
  const [updated] = await db
    .insert(settingsWorkSchedule)
    .values({
      id: "default",
      timezone: payload.timezone,
      checkInDeadline: payload.checkInDeadline,
      workStart: payload.workStart,
      workEnd: payload.workEnd,
      allowFlexibleCheckout: payload.allowFlexibleCheckout,
      workingDaysJson: JSON.stringify(payload.workingDays),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: settingsWorkSchedule.id,
      set: {
        timezone: payload.timezone,
        checkInDeadline: payload.checkInDeadline,
        workStart: payload.workStart,
        workEnd: payload.workEnd,
        allowFlexibleCheckout: payload.allowFlexibleCheckout,
        workingDaysJson: JSON.stringify(payload.workingDays),
        updatedAt: now,
      },
    })
    .returning();

  return NextResponse.json({
    timezone: updated.timezone,
    checkInDeadline: updated.checkInDeadline,
    workStart: updated.workStart,
    workEnd: updated.workEnd,
    allowFlexibleCheckout: updated.allowFlexibleCheckout,
    workingDays: payload.workingDays,
  });
}
