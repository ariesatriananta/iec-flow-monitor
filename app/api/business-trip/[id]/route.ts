export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { businessTrips } from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/server";

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  const body = await request.json();
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
    if (existing.userId !== auth.user.id) {
      return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
    }

    if (existing.status !== "SUBMITTED") {
      return NextResponse.json(
        { error: "Pengajuan yang sudah diproses tidak bisa diubah" },
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

  const nextStatus = body.status ?? existing.status;
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
