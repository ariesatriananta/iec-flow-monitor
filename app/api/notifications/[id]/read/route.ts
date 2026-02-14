export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireSessionUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { notifications } from "@/lib/db/schema";

export async function PATCH(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  const db = getDb();
  const now = new Date();
  const [updated] = await db
    .update(notifications)
    .set({
      isRead: true,
      readAt: now,
    })
    .where(and(eq(notifications.id, params.id), eq(notifications.userId, auth.user.id)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Notifikasi tidak ditemukan" }, { status: 404 });
  }

  return NextResponse.json(updated);
}
