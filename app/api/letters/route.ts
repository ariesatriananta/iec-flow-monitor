export const dynamic = "force-dynamic"

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { clients, letters } from "@/lib/db/schema";
import { generateLetterNumber, getJakartaMonthYear } from "@/lib/numbering";

export async function GET() {
  const db = getDb();
  const rows = await db
    .select({ letter: letters, client: clients })
    .from(letters)
    .leftJoin(clients, eq(letters.clientId, clients.id));

  const data = rows.map(({ letter, client }) => ({
    ...letter,
    client: client ?? undefined,
  }));

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const body = await request.json();

  if (!body?.letterDate || !body?.letterType || !body?.subject || !body?.status) {
    return NextResponse.json(
      { error: "Data letter belum lengkap" },
      { status: 400 }
    );
  }

  const requiresClient = body.letterType !== "HRGA";
  if (requiresClient && !body?.clientId) {
    return NextResponse.json(
      { error: "Client wajib diisi untuk tipe surat ini" },
      { status: 400 }
    );
  }
  if (body.letterType === "HRGA" && !body?.hrgaCategory) {
    return NextResponse.json(
      { error: "Kategori HRGA wajib diisi" },
      { status: 400 }
    );
  }

  const now = new Date();
  const letterDate = new Date(body.letterDate);
  const { year } = getJakartaMonthYear(letterDate);
  const db = getDb();
  const existingLetters = await db
    .select({
      letterDate: letters.letterDate,
      seqNo: letters.seqNo,
      letterType: letters.letterType,
      hrgaCategory: letters.hrgaCategory,
    })
    .from(letters);

  const isHrga = body.letterType === "HRGA";
  const sameYearLetters = existingLetters.filter((letter) => {
    const letterYear = getJakartaMonthYear(new Date(letter.letterDate));
    if (letterYear.year !== year) return false;
    if (isHrga) {
      return (
        letter.letterType === "HRGA" &&
        letter.hrgaCategory === body.hrgaCategory
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
    letterDate,
    letterType: body.letterType,
    hrgaCategory: body.hrgaCategory,
  });

  const [created] = await db
    .insert(letters)
    .values({
      id: crypto.randomUUID(),
      letterDate,
      clientId: body.clientId ?? null,
      letterType: body.letterType,
      hrgaCategory: body.hrgaCategory ?? null,
      subject: body.subject,
      seqNo,
      letterNumber,
      status: body.status,
      notes: body.notes ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
