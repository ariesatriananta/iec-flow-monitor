export const dynamic = "force-dynamic"

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { clients, contracts, invoices, letters, termins } from "@/lib/db/schema";

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

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const db = getDb();

  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.id, params.id))
    .limit(1);

  if (!client) {
    return NextResponse.json({ error: "Client tidak ditemukan" }, { status: 404 });
  }

  const [contract] = await db
    .select({ id: contracts.id })
    .from(contracts)
    .where(eq(contracts.clientId, params.id))
    .limit(1);

  if (contract) {
    return NextResponse.json(
      { error: "Sedang digunakan di data Contracts" },
      { status: 400 }
    );
  }

  const [letter] = await db
    .select({ id: letters.id })
    .from(letters)
    .where(eq(letters.clientId, params.id))
    .limit(1);

  if (letter) {
    return NextResponse.json(
      { error: "Sedang digunakan di data Letters" },
      { status: 400 }
    );
  }

  const [termin] = await db
    .select({ id: termins.id })
    .from(termins)
    .innerJoin(contracts, eq(termins.contractId, contracts.id))
    .where(eq(contracts.clientId, params.id))
    .limit(1);

  if (termin) {
    return NextResponse.json(
      { error: "Sedang digunakan di data Termins" },
      { status: 400 }
    );
  }

  const [invoice] = await db
    .select({ id: invoices.id })
    .from(invoices)
    .innerJoin(contracts, eq(invoices.contractId, contracts.id))
    .where(eq(contracts.clientId, params.id))
    .limit(1);

  if (invoice) {
    return NextResponse.json(
      { error: "Sedang digunakan di data Invoices" },
      { status: 400 }
    );
  }

  const [deleted] = await db
    .delete(clients)
    .where(eq(clients.id, params.id))
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: "Client tidak ditemukan" }, { status: 404 });
  }

  return NextResponse.json(deleted);
}
