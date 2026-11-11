import { and, asc, desc, eq, gt, inArray, lt, max, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { clients, contracts, employees, notifications, overtimeRequests, settingsApprovalFlow, users, workflowEvents } from "@/lib/db/schema";
import type { SessionUser } from "@/lib/auth/server";
import { recordAuditLog } from "@/lib/audit-log";
import { planOvertimeNotifications, resolveOvertimeNotificationRecipients } from "./notification-policy";
import { calculateOvertimePeriod, canReadOvertimeRequest, OvertimeError, resolveOvertimeDecision, type CreateOvertimeInput } from "./validation";
import type { z } from "zod";
import type { listOvertimeSchema, decisionSchema } from "./validation";
import { overtimeWhere } from "./query";

type Row = typeof overtimeRequests.$inferSelect;
type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
const pendingStatuses = ["SUBMITTED", "WAITING_LEVEL_2"];

export function canReadOvertime(row: Row, user: SessionUser) {
  return canReadOvertimeRequest(row, user);
}
export function overtimePermissions(row: Row, user: SessionUser) {
  return {
    canCancel: user.employeeId === row.employeeId && pendingStatuses.includes(row.status),
    canApprove: row.status === "SUBMITTED" && user.employeeId === row.approverLevel1EmployeeId || row.status === "WAITING_LEVEL_2" && user.employeeId === row.approverLevel2EmployeeId,
  };
}

export async function listClientOptions() {
  return getDb().select({ id: clients.id, name: clients.name, code: clients.code, latestContractCreatedAt: max(contracts.createdAt) })
    .from(clients).innerJoin(contracts, and(eq(contracts.clientId, clients.id), eq(contracts.status, "ACTIVE")))
    .where(eq(clients.isActive, true)).groupBy(clients.id, clients.name, clients.code)
    .orderBy(desc(max(contracts.createdAt)), asc(clients.name), asc(clients.id));
}

export async function listOvertime(user: SessionUser, query: z.infer<typeof listOvertimeSchema>) {
  const db = getDb();
  const where = overtimeWhere(user, query);
  const [items, [count]] = await Promise.all([
    db.select().from(overtimeRequests).where(where).orderBy(desc(overtimeRequests.createdAt), desc(overtimeRequests.id)).limit(query.limit).offset(query.offset),
    db.select({ total: sql<number>`count(*)::int` }).from(overtimeRequests).where(where),
  ]);
  return { items: items.map(row => ({ ...row, permissions: overtimePermissions(row, user) })), total: count.total, limit: query.limit, offset: query.offset };
}

export async function getOvertime(user: SessionUser, id: string) {
  const db = getDb();
  const [row] = await db.select().from(overtimeRequests).where(eq(overtimeRequests.id, id)).limit(1);
  if (!row || !canReadOvertime(row, user)) throw new OvertimeError("Pengajuan lembur tidak ditemukan", 404);
  const events = await db.select({ event: workflowEvents, actorName: users.name, actorEmployeeName: employees.fullName }).from(workflowEvents)
    .leftJoin(users, eq(users.id, workflowEvents.actorUserId)).leftJoin(employees, eq(employees.id, workflowEvents.actorEmployeeId))
    .where(and(eq(workflowEvents.module, "OVERTIME"), eq(workflowEvents.entityId, id))).orderBy(asc(workflowEvents.createdAt), asc(workflowEvents.id));
  return { ...row, permissions: overtimePermissions(row, user), workflowEvents: events.map(item => ({ ...item.event, actorName: item.actorName ?? item.actorEmployeeName })) };
}

async function addEvent(tx: Tx, user: SessionUser, id: string, action: string, fromStatus: string | null, toStatus: string, level: number | null, note?: string) {
  await tx.insert(workflowEvents).values({ id: crypto.randomUUID(), module: "OVERTIME", entityId: id, level, action, fromStatus, toStatus, note: note ?? null, actorUserId: user.id, actorEmployeeId: user.employeeId, createdAt: new Date() });
}

async function addNotifications(tx: Tx, row: Row, fromStatus: string | null) {
  const plans = planOvertimeNotifications(row, fromStatus);
  if (!plans.length) return;
  const accounts = await tx.select({ id: users.id, employeeId: users.employeeId, isActive: users.isActive }).from(users)
    .where(and(inArray(users.employeeId, [...new Set(plans.map(plan => plan.employeeId))]), eq(users.isActive, true)));
  const recipients = resolveOvertimeNotificationRecipients(plans, accounts);
  if (!recipients.length) return;
  const now = new Date();
  await tx.insert(notifications).values(recipients.map(({ userId, type, title, message }) => ({
    id: crypto.randomUUID(), userId, type, title, message,
    entityType: "OVERTIME", entityId: row.id, isRead: false, createdAt: now, readAt: null,
  })));
}

function auditDetails(row: Row, fromStatus: string | null, level: number | null) {
  // No description, rejection note, or complete request payload in the generic audit log.
  return { employeeId: row.employeeId, clientId: row.clientId, clientName: row.clientName,
    overtimeDate: row.overtimeDate, durationMinutes: row.durationMinutes,
    fromStatus, toStatus: row.status, level };
}

export async function createOvertime(user: SessionUser, input: CreateOvertimeInput) {
  if (!user.employeeId) throw new OvertimeError("Akun belum terhubung ke karyawan", 403);
  const employeeId = user.employeeId;
  const result = await getDb().transaction(async tx => {
    // One employee row lock serializes concurrent submissions, including different dates/clients.
    const [employee] = await tx.select().from(employees).where(eq(employees.id, employeeId)).for("update");
    if (!employee?.isActive) throw new OvertimeError("Karyawan tidak aktif atau tidak ditemukan", 403);
    const [flow] = await tx.select().from(settingsApprovalFlow).limit(1);
    const ids = [flow?.overtimeApproverLevel1EmployeeId, flow?.overtimeApproverLevel2EmployeeId];
    if (!ids[0] || !ids[1] || ids[0] === ids[1]) throw new OvertimeError("Approval Lembur belum lengkap. Minta Admin mengatur dua approver berbeda di Approval Flow");
    const approvers = await tx.select({ id: employees.id, fullName: employees.fullName, employeeCode: employees.employeeCode }).from(employees).where(and(inArray(employees.id, [ids[0], ids[1]]), eq(employees.isActive, true)));
    const activeUsers = await tx.select({ employeeId: users.employeeId }).from(users).where(and(inArray(users.employeeId, [ids[0], ids[1]]), eq(users.isActive, true)));
    const level1 = approvers.find(row => row.id === ids[0]);
    const level2 = approvers.find(row => row.id === ids[1]);
    if (!level1 || !level2 || ids.some(id => !activeUsers.some(row => row.employeeId === id))) throw new OvertimeError("Approver Lembur harus karyawan aktif yang memiliki akun aktif. Hubungi Admin untuk memperbaiki Approval Flow");
    const [client] = await tx.select({ id: clients.id, name: clients.name }).from(clients).innerJoin(contracts, and(eq(contracts.clientId, clients.id), eq(contracts.status, "ACTIVE"))).where(and(eq(clients.id, input.clientId), eq(clients.isActive, true))).limit(1);
    if (!client) throw new OvertimeError("Pilih client aktif yang memiliki kontrak aktif");
    const period = calculateOvertimePeriod(input);
    const [overlap] = await tx.select({ id: overtimeRequests.id }).from(overtimeRequests).where(and(eq(overtimeRequests.employeeId, employeeId), inArray(overtimeRequests.status, [...pendingStatuses, "APPROVED"]), lt(overtimeRequests.startsAt, period.endsAt), gt(overtimeRequests.endsAt, period.startsAt))).limit(1);
    if (overlap) throw new OvertimeError("Waktu lembur bertumpuk dengan pengajuan yang menunggu atau sudah disetujui", 409);
    const now = new Date();
    const values: typeof overtimeRequests.$inferInsert = { id: crypto.randomUUID(), employeeId, employeeName: employee.fullName || employee.employeeCode, employeeCode: employee.employeeCode, clientId: client.id, clientName: client.name, overtimeDate: input.overtimeDate, startTime: input.startTime, endTime: input.endTime, ...period, description: input.description, status: "SUBMITTED", approverLevel1EmployeeId: level1.id, approverLevel1Name: level1.fullName || level1.employeeCode, approverLevel2EmployeeId: level2.id, approverLevel2Name: level2.fullName || level2.employeeCode, createdAt: now, updatedAt: now };
    const [row] = await tx.insert(overtimeRequests).values(values).returning();
    await addEvent(tx, user, row.id, "SUBMIT", null, "SUBMITTED", null);
    await addNotifications(tx, row, null);
    return { ...row, permissions: overtimePermissions(row, user) };
  });
  await recordAuditLog({ module: "OVERTIME", entityId: result.id, action: "CREATE", actor: user, details: auditDetails(result, null, null) });
  return result;
}

export async function decideOvertime(user: SessionUser, id: string, input: z.infer<typeof decisionSchema>) {
  const result = await getDb().transaction(async tx => {
    const [row] = await tx.select().from(overtimeRequests).where(eq(overtimeRequests.id, id)).for("update");
    if (!row || !canReadOvertime(row, user)) throw new OvertimeError("Pengajuan lembur tidak ditemukan", 404);
    if (input.action !== "CANCEL") {
      if (!user.employeeId) throw new OvertimeError("Akun belum terhubung ke karyawan", 403);
      const [actor] = await tx.select({ isActive: employees.isActive }).from(employees).where(eq(employees.id, user.employeeId));
      if (!actor?.isActive) throw new OvertimeError("Karyawan approver tidak aktif", 403);
    }
    const decision = resolveOvertimeDecision(row, user.employeeId, input.action);
    const [updated] = await tx.update(overtimeRequests).set({ status: decision.status, updatedAt: new Date() }).where(and(eq(overtimeRequests.id, id), eq(overtimeRequests.status, row.status))).returning();
    if (!updated) throw new OvertimeError("Pengajuan sudah diproses. Muat ulang halaman", 409);
    await addEvent(tx, user, id, input.action, row.status, updated.status, decision.level, input.note);
    await addNotifications(tx, updated, row.status);
    return { row: { ...updated, permissions: overtimePermissions(updated, user) }, fromStatus: row.status, level: decision.level };
  });
  const action = input.action === "APPROVE" ? `APPROVE_L${result.level}` : input.action;
  await recordAuditLog({ module: "OVERTIME", entityId: id, action, actor: user, details: auditDetails(result.row, result.fromStatus, result.level) });
  return result.row;
}
