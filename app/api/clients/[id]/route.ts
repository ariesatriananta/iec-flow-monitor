export const dynamic = "force-dynamic"

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { clients } from "@/lib/db/schema";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const db = getDb();
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, params.id))
    .limit(1);

  if (!client) {
    return NextResponse.json({ error: "Client tidak ditemukan" }, { status: 404 });
  }

  return NextResponse.json(client);
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body = await request.json();

  if (!body?.name) {
    return NextResponse.json(
      { error: "name wajib diisi" },
      { status: 400 }
    );
  }

  const db = getDb();
  const [updated] = await db
    .update(clients)
    .set({
      name: body.name,
      address: body.address ?? null,
      picName: body.picName ?? null,
      email: body.email ?? null,
      phone: body.phone ?? null,
      isActive: body.isActive ?? true,
      updatedAt: new Date(),
    })
    .where(eq(clients.id, params.id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Client tidak ditemukan" }, { status: 404 });
  }

  return NextResponse.json(updated);
}
