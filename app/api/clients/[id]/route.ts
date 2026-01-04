export const dynamic = "force-dynamic"

import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  clients,
  contracts,
  invoices,
  letters,
  letterAssignments,
  letterAssignmentMembers,
  termins,
} from "@/lib/db/schema";

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

  const db = getDb();
  const [updated] = await db
    .update(clients)
    .set({
      name: body.name,
      npwp: npwp || null,
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

  const result = await db.transaction(async (tx) => {
    const contractRows = await tx
      .select({ id: contracts.id })
      .from(contracts)
      .where(eq(contracts.clientId, params.id));
    const contractIds = contractRows.map((row) => row.id);

    if (contractIds.length > 0) {
      await tx
        .delete(invoices)
        .where(inArray(invoices.contractId, contractIds));
      await tx
        .delete(termins)
        .where(inArray(termins.contractId, contractIds));
      await tx
        .delete(contracts)
        .where(inArray(contracts.id, contractIds));
    }

    const letterRows = await tx
      .select({ id: letters.id })
      .from(letters)
      .where(eq(letters.clientId, params.id));
    const letterIds = letterRows.map((row) => row.id);

    if (letterIds.length > 0) {
      const assignmentRows = await tx
        .select({ id: letterAssignments.id })
        .from(letterAssignments)
        .where(inArray(letterAssignments.letterId, letterIds));
      const assignmentIds = assignmentRows.map((row) => row.id);
      if (assignmentIds.length > 0) {
        await tx
          .delete(letterAssignmentMembers)
          .where(inArray(letterAssignmentMembers.assignmentId, assignmentIds));
        await tx
          .delete(letterAssignments)
          .where(inArray(letterAssignments.id, assignmentIds));
      }
      await tx.delete(letters).where(inArray(letters.id, letterIds));
    }

    const [deleted] = await tx
      .delete(clients)
      .where(eq(clients.id, params.id))
      .returning();

    return deleted;
  });

  if (!result) {
    return NextResponse.json({ error: "Client tidak ditemukan" }, { status: 404 });
  }

  return NextResponse.json(result);
}
