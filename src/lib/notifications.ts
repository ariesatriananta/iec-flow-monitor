import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { notifications, users } from "@/lib/db/schema";

type DbClient = ReturnType<typeof getDb>;

export type CreateNotificationInput = {
  userId: string;
  type: string;
  title: string;
  message: string;
  entityType?: "LEAVE" | "BUSINESS_TRIP" | "REIMBURSEMENT" | string | null;
  entityId?: string | null;
  createdAt?: Date;
};

export async function createNotification(db: DbClient, input: CreateNotificationInput) {
  const now = input.createdAt ?? new Date();
  await db.insert(notifications).values({
    id: crypto.randomUUID(),
    userId: input.userId,
    type: input.type,
    title: input.title,
    message: input.message,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    isRead: false,
    createdAt: now,
    readAt: null,
  });
}

export async function createNotificationsForUsers(
  db: DbClient,
  userIds: string[],
  input: Omit<CreateNotificationInput, "userId" | "createdAt"> & { createdAt?: Date }
) {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueUserIds.length === 0) return;

  const now = input.createdAt ?? new Date();
  await db.insert(notifications).values(
    uniqueUserIds.map((userId) => ({
      id: crypto.randomUUID(),
      userId,
      type: input.type,
      title: input.title,
      message: input.message,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      isRead: false,
      createdAt: now,
      readAt: null,
    }))
  );
}

export async function resolveUserIdsByEmployeeIds(
  db: DbClient,
  employeeIds: Array<string | null | undefined>
) {
  const normalized = [...new Set(employeeIds.filter((id): id is string => Boolean(id)))];
  if (normalized.length === 0) return new Map<string, string>();

  const rows = await db
    .select({
      id: users.id,
      employeeId: users.employeeId,
    })
    .from(users)
    .where(inArray(users.employeeId, normalized));

  const mapped = new Map<string, string>();
  for (const row of rows) {
    if (row.employeeId) {
      mapped.set(row.employeeId, row.id);
    }
  }
  return mapped;
}

export async function markNotificationAsRead(db: DbClient, id: string, userId: string) {
  const now = new Date();
  await db
    .update(notifications)
    .set({
      isRead: true,
      readAt: now,
    })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
}
