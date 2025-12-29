export const dynamic = "force-dynamic"

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { clients } from "@/lib/db/schema";

export async function GET() {
  const db = getDb();
  const data = await db.select().from(clients);
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const body = await request.json();

  if (!body?.name || !body?.code) {
    return NextResponse.json(
      { error: "name dan code wajib diisi" },
      { status: 400 }
    );
  }

  const now = new Date();
  const db = getDb();
  const [created] = await db
    .insert(clients)
    .values({
      id: crypto.randomUUID(),
      name: body.name,
      code: body.code,
      address: body.address ?? null,
      picName: body.picName ?? null,
      email: body.email ?? null,
      phone: body.phone ?? null,
      isActive: body.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
