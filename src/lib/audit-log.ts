import { getDb } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";
import type { SessionUser } from "@/lib/auth/server";

export type AuditModule =
  | "CLIENT"
  | "CONTRACT"
  | "TERMIN"
  | "INVOICE"
  | "LETTER"
  | "OPE"
  | "OVERTIME";

type RecordAuditLogInput = {
  module: AuditModule;
  entityId?: string | null;
  action: string;
  actor: Pick<SessionUser, "id" | "name" | "username">;
  details?: Record<string, unknown> | null;
};

/**
 * Audit logging is deliberately best-effort. A missing audit table or a
 * temporary database error must never make an otherwise successful business
 * mutation fail.
 */
export async function recordAuditLog(input: RecordAuditLogInput): Promise<void> {
  try {
    const db = getDb();
    await db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      module: input.module,
      entityId: input.entityId ?? null,
      action: input.action,
      actorUserId: input.actor.id,
      actorName: input.actor.name || input.actor.username,
      details: input.details ?? null,
      createdAt: new Date(),
    });
  } catch (error) {
    console.error("Audit log write failed:", error);
  }
}
