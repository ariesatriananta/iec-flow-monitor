export const dynamic = "force-dynamic"

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { clients, letters } from "@/lib/db/schema";

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

  if (
    !body?.clientId ||
    !body?.letterDate ||
    !body?.letterType ||
    !body?.subject ||
    body?.seqNo === undefined ||
    !body?.letterNumber ||
    !body?.status
  ) {
    return NextResponse.json(
      { error: "Data letter belum lengkap" },
      { status: 400 }
    );
  }

  const now = new Date();
  const db = getDb();
  const [created] = await db
    .insert(letters)
    .values({
      id: crypto.randomUUID(),
      letterDate: new Date(body.letterDate),
      clientId: body.clientId,
      letterType: body.letterType,
      subject: body.subject,
      seqNo: Number(body.seqNo),
      letterNumber: body.letterNumber,
      status: body.status,
      notes: body.notes ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
