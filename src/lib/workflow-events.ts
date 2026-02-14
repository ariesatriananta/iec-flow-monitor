import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { employees, users, workflowEvents } from "@/lib/db/schema";

type DbClient = ReturnType<typeof getDb>;

export type WorkflowModule = "LEAVE" | "BUSINESS_TRIP" | "REIMBURSEMENT";

export type CreateWorkflowEventInput = {
  module: WorkflowModule;
  entityId: string;
  level?: number | null;
  action: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  note?: string | null;
  actorUserId?: string | null;
  actorEmployeeId?: string | null;
};

export async function createWorkflowEvent(
  db: DbClient,
  input: CreateWorkflowEventInput
) {
  await db.insert(workflowEvents).values({
    id: crypto.randomUUID(),
    module: input.module,
    entityId: input.entityId,
    level: input.level ?? null,
    action: input.action,
    fromStatus: input.fromStatus ?? null,
    toStatus: input.toStatus ?? null,
    note: input.note ?? null,
    actorUserId: input.actorUserId ?? null,
    actorEmployeeId: input.actorEmployeeId ?? null,
    createdAt: new Date(),
  });
}

export async function fetchWorkflowEventsByEntityIds(
  db: DbClient,
  module: WorkflowModule,
  entityIds: string[]
) {
  if (entityIds.length === 0) {
    return new Map<string, WorkflowEventWithActor[]>();
  }

  const rows = await db
    .select({
      event: workflowEvents,
      actorUser: users,
      actorEmployee: employees,
    })
    .from(workflowEvents)
    .leftJoin(users, eq(workflowEvents.actorUserId, users.id))
    .leftJoin(employees, eq(workflowEvents.actorEmployeeId, employees.id))
    .where(
      and(
        eq(workflowEvents.module, module),
        inArray(workflowEvents.entityId, entityIds)
      )
    )
    .orderBy(asc(workflowEvents.createdAt));

  const mapped = new Map<string, WorkflowEventWithActor[]>();
  for (const row of rows) {
    const existing = mapped.get(row.event.entityId);
    const item: WorkflowEventWithActor = {
      ...row.event,
      actorUser: row.actorUser
        ? {
            id: row.actorUser.id,
            username: row.actorUser.username,
            name: row.actorUser.name,
            role: row.actorUser.role,
          }
        : null,
      actorEmployee: row.actorEmployee
        ? {
            id: row.actorEmployee.id,
            fullName: row.actorEmployee.fullName,
            title: row.actorEmployee.title,
            department: row.actorEmployee.department,
          }
        : null,
    };
    if (existing) {
      existing.push(item);
    } else {
      mapped.set(row.event.entityId, [item]);
    }
  }

  return mapped;
}

export type WorkflowEventWithActor = {
  id: string;
  module: string;
  entityId: string;
  level: number | null;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  actorUserId: string | null;
  actorEmployeeId: string | null;
  createdAt: Date;
  actorUser:
    | {
        id: string;
        username: string;
        name: string;
        role: "ADMIN" | "STAFF";
      }
    | null;
  actorEmployee:
    | {
        id: string;
        fullName: string | null;
        title: string | null;
        department: string | null;
      }
    | null;
};
