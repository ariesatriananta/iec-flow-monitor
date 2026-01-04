export const dynamic = "force-dynamic"

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { clients, letters, letterAssignments, letterAssignmentMembers } from "@/lib/db/schema";
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
  if (body.letterType === "SURAT_TUGAS") {
    const assignment = body.assignment;
    if (!assignment?.title || !assignment?.auditPeriodText) {
      return NextResponse.json(
        { error: "Data surat tugas belum lengkap" },
        { status: 400 }
      );
    }
    if (!Array.isArray(assignment.members) || assignment.members.length === 0) {
      return NextResponse.json(
        { error: "Minimal satu anggota tim wajib diisi" },
        { status: 400 }
      );
    }
    const invalidMember = assignment.members.some(
      (member: { name?: string; role?: string }) =>
        !member?.name?.trim() || !member?.role?.trim()
    );
    if (invalidMember) {
      return NextResponse.json(
        { error: "Nama dan peran anggota tim wajib diisi" },
        { status: 400 }
      );
    }
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
      return letter.letterType === "HRGA";
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

  const result = await db.transaction(async (tx) => {
    const [created] = await tx
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

    if (body.letterType === "SURAT_TUGAS") {
      const assignmentId = crypto.randomUUID();
      const assignment = body.assignment;
      const [_createdAssignment] = await tx
        .insert(letterAssignments)
        .values({
          id: assignmentId,
          letterId: created.id,
          title: assignment.title,
          auditPeriodText: assignment.auditPeriodText,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      const members = Array.isArray(assignment.members)
        ? assignment.members
        : [];
      if (members.length > 0) {
        await tx.insert(letterAssignmentMembers).values(
          members.map((member, index) => ({
            id: crypto.randomUUID(),
            assignmentId,
            name: member.name,
            role: member.role,
            order: index + 1,
            createdAt: now,
            updatedAt: now,
          }))
        );
      }
      void _createdAssignment;
    }

    return created;
  });

  return NextResponse.json(result, { status: 201 });
}
