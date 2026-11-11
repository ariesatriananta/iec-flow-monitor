import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { overtimeRequests, workflowEvents } from "@/lib/db/schema";
import type { SessionUser } from "@/lib/auth/server";
import type { OvertimeQuery } from "@/types/overtime";
import { overtimeWhere } from "./query";
import { OvertimeError } from "./validation";

export async function loadOvertimeExport(user: SessionUser, query: OvertimeQuery) {
  // Defense in depth: route and service both forbid Staff exports.
  if (user.role !== "ADMIN") throw new OvertimeError("Hanya Admin yang dapat mengekspor pengajuan lembur", 403);
  const where = overtimeWhere(user, query);
  return getDb().transaction(async tx => {
    const [count] = await tx.select({ total: sql<number>`count(*)::int` }).from(overtimeRequests).where(where);
    if (!count.total) throw new OvertimeError("Tidak ada pengajuan lembur sesuai filter untuk diekspor", 404);
    // Never silently truncate an export. Bound memory while allowing all filtered pages.
    if (count.total > 50000) throw new OvertimeError("Export maksimal 50.000 pengajuan. Persempit filter tanggal atau status lalu coba lagi", 413);
    const rows = await tx.select().from(overtimeRequests).where(where).orderBy(desc(overtimeRequests.createdAt), desc(overtimeRequests.id));
    const events = await tx.select({
      entityId: workflowEvents.entityId, action: workflowEvents.action, level: workflowEvents.level,
      note: workflowEvents.note, createdAt: workflowEvents.createdAt,
    }).from(workflowEvents).innerJoin(overtimeRequests, eq(workflowEvents.entityId, overtimeRequests.id))
      .where(and(where, eq(workflowEvents.module, "OVERTIME")))
      .orderBy(asc(workflowEvents.createdAt), asc(workflowEvents.id));
    return { rows, events };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
