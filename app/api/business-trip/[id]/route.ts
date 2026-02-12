export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { businessTrips } from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/server";

const dateStringSchema = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(new Date(value).getTime()), "Format tanggal tidak valid");

const staffUpdateSchema = z.object({
  destinationCity: z.string().trim().min(1).max(100).optional(),
  companyName: z.string().trim().min(1).max(150).optional(),
  purpose: z.string().trim().max(2000).optional(),
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.optional(),
  status: z.literal("CANCELLED").optional(),
});

const adminUpdateSchema = z.object({
  destinationCity: z.string().trim().min(1).max(100).optional(),
  companyName: z.string().trim().min(1).max(150).optional(),
  purpose: z.string().trim().max(2000).optional(),
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.optional(),
  status: z
    .union([
      z.literal("SUBMITTED"),
      z.literal("APPROVED"),
      z.literal("REJECTED"),
      z.literal("CANCELLED"),
    ])
    .optional(),
  adminNote: z.string().trim().max(2000).optional(),
});

const formatZodError = (error: z.ZodError) =>
  error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  const rawBody = await request.json().catch(() => null);
  const db = getDb();

  const [existing] = await db
    .select()
    .from(businessTrips)
    .where(eq(businessTrips.id, params.id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Perjalanan dinas tidak ditemukan" }, { status: 404 });
  }

  if (auth.user.role !== "ADMIN") {
    const parsedBody = staffUpdateSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: `Payload tidak valid: ${formatZodError(parsedBody.error)}` },
        { status: 400 }
      );
    }

    const body = parsedBody.data;
    if (existing.userId !== auth.user.id) {
      return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
    }

    if (existing.status !== "SUBMITTED") {
      return NextResponse.json(
        { error: "Pengajuan yang sudah diproses tidak bisa diubah" },
        { status: 400 }
      );
    }

    const startDate = body.startDate ? new Date(body.startDate) : existing.startDate;
    const endDate = body.endDate ? new Date(body.endDate) : existing.endDate;
    if (endDate < startDate) {
      return NextResponse.json(
        { error: "Rentang tanggal perjalanan tidak valid" },
        { status: 400 }
      );
    }

    const [updated] = await db
      .update(businessTrips)
      .set({
        destinationCity: body.destinationCity ?? undefined,
        companyName: body.companyName ?? undefined,
        purpose: body.purpose ?? undefined,
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        endDate: body.endDate ? new Date(body.endDate) : undefined,
        status: body.status === "CANCELLED" ? "CANCELLED" : existing.status,
        updatedAt: new Date(),
      })
      .where(eq(businessTrips.id, params.id))
      .returning();

    return NextResponse.json(updated);
  }

  const parsedBody = adminUpdateSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: `Payload tidak valid: ${formatZodError(parsedBody.error)}` },
      { status: 400 }
    );
  }

  const body = parsedBody.data;
  const nextStatus = body.status ?? existing.status;
  const startDate = body.startDate ? new Date(body.startDate) : existing.startDate;
  const endDate = body.endDate ? new Date(body.endDate) : existing.endDate;
  if (endDate < startDate) {
    return NextResponse.json(
      { error: "Rentang tanggal perjalanan tidak valid" },
      { status: 400 }
    );
  }

  const approvedAt =
    nextStatus === "APPROVED" || nextStatus === "REJECTED" ? new Date() : null;

  const [updated] = await db
    .update(businessTrips)
    .set({
      destinationCity: body.destinationCity ?? undefined,
      companyName: body.companyName ?? undefined,
      purpose: body.purpose ?? undefined,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      endDate: body.endDate ? new Date(body.endDate) : undefined,
      status: nextStatus,
      adminNote: body.adminNote ?? undefined,
      approvedBy:
        nextStatus === "APPROVED" || nextStatus === "REJECTED"
          ? auth.user.id
          : null,
      approvedAt,
      updatedAt: new Date(),
    })
    .where(eq(businessTrips.id, params.id))
    .returning();

  return NextResponse.json(updated);
}

