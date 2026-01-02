export const dynamic = "force-dynamic"

import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  clients,
  letters,
  letterAssignments,
  letterAssignmentMembers,
} from "@/lib/db/schema";
import { generateLetterNumber, getJakartaMonthYear } from "@/lib/numbering";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const db = getDb();
  type AssignmentPayload = {
    id: string;
    letterId: string;
    title: string;
    auditPeriodText: string;
    createdAt: Date;
    updatedAt: Date;
    members: Array<{
      id: string;
      assignmentId: string;
      name: string;
      role: string;
      order: number;
      createdAt: Date;
      updatedAt: Date;
    }>;
  };
  const [row] = await db
    .select({ letter: letters, client: clients })
    .from(letters)
    .leftJoin(clients, eq(letters.clientId, clients.id))
    .where(eq(letters.id, params.id))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Letter tidak ditemukan" }, { status: 404 });
  }

  let assignment: AssignmentPayload | null = null;
  if (row.letter.letterType === "SURAT_TUGAS") {
    const [assignmentRow] = await db
      .select()
      .from(letterAssignments)
      .where(eq(letterAssignments.letterId, row.letter.id))
      .limit(1);
    if (assignmentRow) {
      const members = await db
        .select()
        .from(letterAssignmentMembers)
        .where(eq(letterAssignmentMembers.assignmentId, assignmentRow.id))
        .orderBy(asc(letterAssignmentMembers.order));
      assignment = {
        ...assignmentRow,
        members,
      };
    }
  }

  return NextResponse.json({
    ...row.letter,
    client: row.client ?? undefined,
    assignment,
  });
}

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
  if (body.assignment && nextLetterType === "SURAT_TUGAS") {
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

  const updateData: {
    letterDate?: Date;
    letterType?: string;
    hrgaCategory?: string | null;
    clientId?: string | null;
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

  if (body.assignment && nextLetterType === "SURAT_TUGAS") {
    const assignmentPayload = body.assignment;
    const now = new Date();
    const updated = await db.transaction(async (tx) => {
      const [saved] = await tx
        .update(letters)
        .set(updateData)
        .where(eq(letters.id, params.id))
        .returning();

      const [existingAssignment] = await tx
        .select({ id: letterAssignments.id })
        .from(letterAssignments)
        .where(eq(letterAssignments.letterId, params.id))
        .limit(1);

      const assignmentId = existingAssignment?.id ?? crypto.randomUUID();
      if (existingAssignment) {
        await tx
          .update(letterAssignments)
          .set({
            title: assignmentPayload.title,
            auditPeriodText: assignmentPayload.auditPeriodText,
            updatedAt: now,
          })
          .where(eq(letterAssignments.id, assignmentId));
      } else {
        await tx.insert(letterAssignments).values({
          id: assignmentId,
          letterId: params.id,
          title: assignmentPayload.title,
          auditPeriodText: assignmentPayload.auditPeriodText,
          createdAt: now,
          updatedAt: now,
        });
      }

      await tx
        .delete(letterAssignmentMembers)
        .where(eq(letterAssignmentMembers.assignmentId, assignmentId));

      const members = Array.isArray(assignmentPayload.members)
        ? assignmentPayload.members
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

      return saved;
    });

    return NextResponse.json(updated);
  }

  const [updated] = await db
    .update(letters)
    .set(updateData)
    .where(eq(letters.id, params.id))
    .returning();

  return NextResponse.json(updated);
}
