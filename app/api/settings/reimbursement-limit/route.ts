export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { settingsReimbursementLimit } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/server";

type PositionLimit = {
  id: string;
  position: string;
  monthlyLimit: number;
};

const defaultPayload = {
  categoryLimit: {
    transport: 500000,
    meal: 300000,
    other: 500000,
  },
  positionLimit: [
    { id: "staff", position: "Staff", monthlyLimit: 1000000 },
    { id: "senior-staff", position: "Senior Staff", monthlyLimit: 1500000 },
  ] as PositionLimit[],
  maxFilesPerRequest: 10,
  maxFileSizeMb: 5,
} as const;

const currencyNumberSchema = z
  .number()
  .finite()
  .min(0, "Nilai limit tidak boleh negatif")
  .max(999999999999, "Nilai limit terlalu besar");

const positionLimitSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1, "ID posisi wajib diisi")
    .max(64, "ID posisi maksimal 64 karakter"),
  position: z
    .string()
    .trim()
    .min(1, "Nama jabatan wajib diisi")
    .max(100, "Nama jabatan maksimal 100 karakter"),
  monthlyLimit: currencyNumberSchema,
});

const payloadSchema = z.object({
  categoryLimit: z.object({
    transport: currencyNumberSchema,
    meal: currencyNumberSchema,
    other: currencyNumberSchema,
  }),
  positionLimit: z
    .array(positionLimitSchema)
    .min(1, "Minimal satu limit jabatan wajib diisi")
    .max(100, "Maksimal 100 limit jabatan"),
  maxFilesPerRequest: z
    .number()
    .int("Maksimal file harus bilangan bulat")
    .min(1, "Maksimal file minimal 1")
    .max(50, "Maksimal file tidak boleh lebih dari 50"),
  maxFileSizeMb: z
    .number()
    .int("Ukuran file harus bilangan bulat")
    .min(1, "Ukuran file minimal 1 MB")
    .max(20, "Ukuran file tidak boleh lebih dari 20 MB"),
});

const formatZodError = (error: z.ZodError) =>
  error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");

const parsePositionLimit = (value: string): PositionLimit[] => {
  try {
    const parsed = payloadSchema.shape.positionLimit.parse(JSON.parse(value));
    return parsed;
  } catch {
    return [...defaultPayload.positionLimit];
  }
};

export async function GET() {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const db = getDb();
  const [row] = await db.select().from(settingsReimbursementLimit).limit(1);
  if (!row) return NextResponse.json(defaultPayload);

  return NextResponse.json({
    categoryLimit: {
      transport: Number(row.transportLimit),
      meal: Number(row.mealLimit),
      other: Number(row.otherLimit),
    },
    positionLimit: parsePositionLimit(row.positionLimitJson),
    maxFilesPerRequest: row.maxFilesPerRequest,
    maxFileSizeMb: row.maxFileSizeMb,
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
    .insert(settingsReimbursementLimit)
    .values({
      id: "default",
      transportLimit: payload.categoryLimit.transport.toString(),
      mealLimit: payload.categoryLimit.meal.toString(),
      otherLimit: payload.categoryLimit.other.toString(),
      positionLimitJson: JSON.stringify(payload.positionLimit),
      maxFilesPerRequest: payload.maxFilesPerRequest,
      maxFileSizeMb: payload.maxFileSizeMb,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: settingsReimbursementLimit.id,
      set: {
        transportLimit: payload.categoryLimit.transport.toString(),
        mealLimit: payload.categoryLimit.meal.toString(),
        otherLimit: payload.categoryLimit.other.toString(),
        positionLimitJson: JSON.stringify(payload.positionLimit),
        maxFilesPerRequest: payload.maxFilesPerRequest,
        maxFileSizeMb: payload.maxFileSizeMb,
        updatedAt: now,
      },
    })
    .returning();

  return NextResponse.json({
    categoryLimit: {
      transport: Number(updated.transportLimit),
      meal: Number(updated.mealLimit),
      other: Number(updated.otherLimit),
    },
    positionLimit: payload.positionLimit,
    maxFilesPerRequest: updated.maxFilesPerRequest,
    maxFileSizeMb: updated.maxFileSizeMb,
  });
}

