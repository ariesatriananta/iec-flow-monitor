export const dynamic = "force-dynamic"

import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { clients } from "@/lib/db/schema";

export async function GET() {
  const db = getDb();
  const data = await db.select().from(clients);
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const body = await request.json();
  const npwp = typeof body?.npwp === "string" ? body.npwp.trim() : "";

  if (!body?.name) {
    return NextResponse.json(
      { error: "name wajib diisi" },
      { status: 400 }
    );
  }

  if (npwp && !/^\d{2}\.\d{3}\.\d{3}\.\d-\d{3}\.\d{3}$/.test(npwp)) {
    return NextResponse.json(
      { error: "Format NPWP tidak valid" },
      { status: 400 }
    );
  }

  const now = new Date();
  const db = getDb();
  const [maxRow] = await db
    .select({ maxCode: sql<number>`max(${clients.code}::int)` })
    .from(clients)
    .where(sql`${clients.code} ~ '^[0-9]+$'`);
  const nextCode = ((maxRow?.maxCode ?? 0) + 1).toString();
  const [created] = await db
    .insert(clients)
    .values({
      id: crypto.randomUUID(),
      name: body.name,
      code: nextCode,
      npwp: npwp || null,
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
