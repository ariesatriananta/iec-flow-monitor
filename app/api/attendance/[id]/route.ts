export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { attendanceRecords } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/server";

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const body = await request.json();
  if (!body) {
    return NextResponse.json({ error: "Data update kosong" }, { status: 400 });
  }

  const db = getDb();
  const [updated] = await db
    .update(attendanceRecords)
    .set({
      checkInAt: body.checkInAt ? new Date(body.checkInAt) : undefined,
      checkOutAt: body.checkOutAt ? new Date(body.checkOutAt) : undefined,
      checkInLocation: body.checkInLocation ?? undefined,
      checkOutLocation: body.checkOutLocation ?? undefined,
      status: body.status ?? undefined,
      notes: body.notes ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(attendanceRecords.id, params.id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Attendance tidak ditemukan" }, { status: 404 });
  }

  return NextResponse.json(updated);
}
