export const dynamic = "force-dynamic"

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { letters } from "@/lib/db/schema";

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body = await request.json();

  if (!body) {
    return NextResponse.json(
      { error: "Data update tidak boleh kosong" },
      { status: 400 }
    );
  }

  const db = getDb();
  const updateData: {
    letterDate?: Date;
    letterType?: string;
    subject?: string;
    seqNo?: number;
    letterNumber?: string;
    status?: string;
    notes?: string | null;
    updatedAt: Date;
  } = {
    updatedAt: new Date(),
  };

  if (body.letterDate !== undefined) {
    updateData.letterDate = new Date(body.letterDate);
  }
  if (body.letterType !== undefined) {
    updateData.letterType = body.letterType;
  }
  if (body.subject !== undefined) {
    updateData.subject = body.subject;
  }
  if (body.seqNo !== undefined) {
    updateData.seqNo = Number(body.seqNo);
  }
  if (body.letterNumber !== undefined) {
    updateData.letterNumber = body.letterNumber;
  }
  if (body.status !== undefined) {
    updateData.status = body.status;
  }
  if (body.notes !== undefined) {
    updateData.notes = body.notes ?? null;
  }

  const [updated] = await db
    .update(letters)
    .set(updateData)
    .where(eq(letters.id, params.id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Letter tidak ditemukan" }, { status: 404 });
  }

  return NextResponse.json(updated);
}
