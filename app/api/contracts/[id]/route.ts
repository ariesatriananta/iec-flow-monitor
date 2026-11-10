export const dynamic = "force-dynamic"

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { clients, contracts, termins } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/server";
import { recordAuditLog } from "@/lib/audit-log";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const db = getDb();
  const [row] = await db
    .select({ contract: contracts, client: clients })
    .from(contracts)
    .leftJoin(clients, eq(contracts.clientId, clients.id))
    .where(eq(contracts.id, params.id))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Contract tidak ditemukan" }, { status: 404 });
  }

  const contractTermins = await db
    .select()
    .from(termins)
    .where(eq(termins.contractId, params.id));

  return NextResponse.json({
    ...row.contract,
    client: row.client ?? undefined,
    termins: contractTermins,
  });
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const body = await request.json();

  if (!body) {
    return NextResponse.json(
      { error: "Data update tidak boleh kosong" },
      { status: 400 }
    );
  }

  const db = getDb();
  const [currentContract] = await db
    .select({
      id: contracts.id,
      clientId: contracts.clientId,
      status: contracts.status,
    })
    .from(contracts)
    .where(eq(contracts.id, params.id))
    .limit(1);

  if (!currentContract) {
    return NextResponse.json({ error: "Contract tidak ditemukan" }, { status: 404 });
  }

  const updateData: {
    clientId?: string;
    contractTitle?: string | null;
    contractValue?: string;
    paymentStatus?: string;
    status?: string;
    notes?: string | null;
    updatedAt: Date;
  } = {
    updatedAt: new Date(),
  };

  const requestedClientId = body.clientId;
  const isClientChange =
    requestedClientId !== undefined && requestedClientId !== currentContract.clientId;

  if (requestedClientId !== undefined) {
    if (typeof requestedClientId !== "string" || requestedClientId.trim() === "") {
      return NextResponse.json(
        { error: "Client tujuan tidak valid" },
        { status: 400 }
      );
    }

    if (isClientChange) {
      if (currentContract.status !== "VOID") {
        return NextResponse.json(
          { error: "Client hanya dapat diubah ketika contract berstatus VOID" },
          { status: 409 }
        );
      }

      const [targetClient] = await db
        .select({ id: clients.id, isActive: clients.isActive })
        .from(clients)
        .where(eq(clients.id, requestedClientId))
        .limit(1);

      if (!targetClient) {
        return NextResponse.json(
          { error: "Client tujuan tidak ditemukan" },
          { status: 400 }
        );
      }

      if (!targetClient.isActive) {
        return NextResponse.json(
          { error: "Client tujuan sudah tidak aktif" },
          { status: 409 }
        );
      }

      updateData.clientId = requestedClientId;
    }
  }

  if (body.contractTitle !== undefined) {
    updateData.contractTitle = body.contractTitle ?? null;
  }
  if (body.contractValue !== undefined) {
    updateData.contractValue = body.contractValue.toString();
  }
  if (body.paymentStatus !== undefined) {
    updateData.paymentStatus = body.paymentStatus;
  }
  if (body.status !== undefined) {
    updateData.status = body.status;
  }
  if (body.notes !== undefined) {
    updateData.notes = body.notes ?? null;
  }

  const [updated] = await db
    .update(contracts)
    .set(updateData)
    .where(
      isClientChange
        ? and(
            eq(contracts.id, params.id),
            eq(contracts.status, "VOID"),
            eq(contracts.clientId, currentContract.clientId)
          )
        : eq(contracts.id, params.id)
    )
    .returning();

  if (!updated) {
    if (isClientChange) {
      return NextResponse.json(
        { error: "Contract telah berubah; perubahan client dibatalkan" },
        { status: 409 }
      );
    }

    return NextResponse.json({ error: "Contract tidak ditemukan" }, { status: 404 });
  }

  const statusChanged =
    body.status !== undefined && body.status !== currentContract.status;
  await recordAuditLog({
    module: "CONTRACT",
    entityId: updated.id,
    action: statusChanged
      ? "STATUS_CHANGED"
      : isClientChange
        ? "CLIENT_CHANGED"
        : "UPDATE",
    actor: auth.user,
    details: {
      proposalNumber: updated.proposalNumber,
      ...(statusChanged
        ? { fromStatus: currentContract.status, toStatus: updated.status }
        : {}),
      ...(isClientChange
        ? { fromClientId: currentContract.clientId, toClientId: updated.clientId }
        : {}),
    },
  });

  return NextResponse.json(updated);
}
