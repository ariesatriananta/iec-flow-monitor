export const dynamic = "force-dynamic"

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { letters } from "@/lib/db/schema";
import { generateLetterNumber, getJakartaMonthYear } from "@/lib/numbering";

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
  const [existing] = await db
    .select({
      id: letters.id,
      letterDate: letters.letterDate,
      letterType: letters.letterType,
      hrgaCategory: letters.hrgaCategory,
      clientId: letters.clientId,
    })
    .from(letters)
    .where(eq(letters.id, params.id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Letter tidak ditemukan" }, { status: 404 });
  }

  const nextLetterType = body.letterType ?? existing.letterType;
  const nextHrgaCategory = body.hrgaCategory ?? existing.hrgaCategory;
  const nextLetterDate = body.letterDate
    ? new Date(body.letterDate)
    : new Date(existing.letterDate);
  const nextClientId = body.clientId ?? existing.clientId;

  if (nextLetterType === "HRGA" && !nextHrgaCategory) {
    return NextResponse.json(
      { error: "Kategori HRGA wajib diisi" },
      { status: 400 }
    );
  }
  if (nextLetterType !== "HRGA" && !nextClientId) {
    return NextResponse.json(
      { error: "Client wajib diisi untuk tipe surat ini" },
      { status: 400 }
    );
  }

  const updateData: {
    letterDate?: Date;
    letterType?: string;
    hrgaCategory?: string | null;
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
  if (body.hrgaCategory !== undefined) {
    updateData.hrgaCategory = body.hrgaCategory;
  }
  if (body.clientId !== undefined) {
    updateData.clientId = body.clientId;
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

  const shouldRegenerate =
    body.letterDate !== undefined ||
    body.letterType !== undefined ||
    body.hrgaCategory !== undefined;
  if (shouldRegenerate) {
    const { year } = getJakartaMonthYear(nextLetterDate);
    const allLetters = await db
      .select({
        id: letters.id,
        letterDate: letters.letterDate,
        seqNo: letters.seqNo,
        letterType: letters.letterType,
        hrgaCategory: letters.hrgaCategory,
      })
      .from(letters);
    const sameYearLetters = allLetters.filter((letter) => {
      if (letter.id === existing.id) return false;
      const letterYear = getJakartaMonthYear(new Date(letter.letterDate)).year;
      if (letterYear !== year) return false;
      if (nextLetterType === "HRGA") {
        return (
          letter.letterType === "HRGA" &&
          letter.hrgaCategory === nextHrgaCategory
        );
      }
      return letter.letterType !== "HRGA";
    });
    const maxSeq = sameYearLetters.reduce(
      (acc, letter) => Math.max(acc, letter.seqNo ?? 0),
      0
    );
    const seqNo = maxSeq + 1;
    const letterNumber = generateLetterNumber({
      seqNo,
      letterDate: nextLetterDate,
      letterType: nextLetterType,
      hrgaCategory: nextHrgaCategory ?? undefined,
    });
    updateData.seqNo = seqNo;
    updateData.letterNumber = letterNumber;
  }

  const [updated] = await db
    .update(letters)
    .set(updateData)
    .where(eq(letters.id, params.id))
    .returning();

  return NextResponse.json(updated);
}
