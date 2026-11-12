/** Disposable PostgreSQL cluster only. Never reads .env or connects to an existing DB. */
import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { Pool } from "pg";
import type { SessionUser } from "../src/lib/auth/server";

async function main() {
  const bin = process.env.PG_TEST_BIN ?? (process.platform === "win32" ? "C:/Program Files/PostgreSQL/18/bin" : "");
  const exe = (name: string) => bin ? path.join(bin, name + (process.platform === "win32" ? ".exe" : "")) : name;
  const root = await mkdtemp(path.join(tmpdir(), "iecnet-overtime-pg-test-"));
  const data = path.join(root, "data");
  const port = await new Promise<number>((resolve, reject) => {
    const server = net.createServer(); server.on("error", reject);
    server.listen(0, "127.0.0.1", () => { const address = server.address() as net.AddressInfo; server.close(() => resolve(address.port)); });
  });
  const command = (name: string, args: string[]) => {
    // Do not capture pipes: on Windows postgres grandchildren can keep them open
    // after pg_ctl exits, making spawnSync wait until timeout.
    const result = spawnSync(exe(name), args, { encoding: "utf8", stdio: "ignore", windowsHide: true, timeout: 60000 });
    if (result.error || result.status !== 0) throw new Error(`${name} failed: ${result.error?.message ?? result.stderr ?? result.stdout}`);
  };
  // Credentials and port belong exclusively to the cluster created above.
  process.env.DATABASE_URL = `postgresql://overtime_test@127.0.0.1:${port}/postgres`;
  process.env.DB_POOL_MAX = "12";
  let started = false;
  let httpServer: ChildProcess | undefined;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let passed = 0;
  try {
    command("initdb", ["-D", data, "-U", "overtime_test", "-A", "trust", "--encoding=UTF8", "--locale=C"]);
    // Also attempt cleanup if pg_ctl times out after starting the server.
    started = true;
    command("pg_ctl", ["-D", data, "-l", path.join(root, "postgres.log"), "-o", `-F -h 127.0.0.1 -p ${port}`, "-w", "start"]);
    console.log("Disposable PostgreSQL started; existing DATABASE_URL ignored.");
    const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")) as { entries: { tag: string }[] };
    for (const entry of journal.entries) {
      const migration = await readFile(`drizzle/${entry.tag}.sql`, "utf8");
      try { await pool.query(migration); } catch (error) { throw new Error(`Fresh migration ${entry.tag} failed`, { cause: error }); }
    }
    console.log(`PASS fresh database: ${journal.entries.length} migrations applied to disposable cluster only`);
    const svc = await import("../src/lib/overtime/server");
    const { loadOvertimeExport } = await import("../src/lib/overtime/export-server");
    const { buildOvertimeWorkbook } = await import("../src/lib/overtime/export");
    const { createOvertimeSchema, decisionSchema, listOvertimeSchema } = await import("../src/lib/overtime/validation");
    const XLSX = await import("xlsx");
    const people = ["owner", "l1", "l2", "other", "replacement", "admin"];
    for (const id of people) {
      await pool.query("INSERT INTO employees (id,employee_code,full_name,is_active,created_at,updated_at) VALUES ($1,$1,$1,true,now(),now())", [id]);
      await pool.query("INSERT INTO users (id,username,name,role,is_active,employee_id,password_hash,created_at,updated_at) VALUES ($1,$1,$1,$2,true,$3,'TEST-ONLY',now(),now())", [`user-${id}`, id === "admin" ? "ADMIN" : "STAFF", id]);
    }
    const actor = (id: string): SessionUser => ({ id: `user-${id}`, username: id, name: id, role: id === "admin" ? "ADMIN" : "STAFF", employeeId: id, isActive: true });
    for (const [id, active] of [["c1", true], ["c2", true], ["no-contract", true], ["inactive", false]] as const) {
      await pool.query("INSERT INTO clients (id,name,code,is_active,created_at,updated_at) VALUES ($1,$1,$1,$2,now(),now())", [id, active]);
    }
    for (const [id, client, status, time] of [["ct1", "c1", "ACTIVE", "2026-01-01"], ["ct2", "c2", "ACTIVE", "2026-02-01"], ["ct3", "c1", "ACTIVE", "2026-03-01"], ["ct4", "inactive", "ACTIVE", "2026-04-01"], ["ct5", "no-contract", "VOID", "2026-05-01"]]) {
      await pool.query("INSERT INTO contracts (id,proposal_date,client_id,service_code,engagement_no,seq_no,proposal_number,contract_value,payment_status,status,created_at,updated_at) VALUES ($1,now(),$2,'A',1,1,$1,1000,'UNPAID',$3,$4,now())", [id, client, status, time]);
    }
    await pool.query("INSERT INTO settings_approval_flow (id,leave_approver_level1_role,leave_approver_level2_role,reimbursement_approver_level1_role,reimbursement_approver_level2_role,business_trip_approver_level1_role,business_trip_approver_level2_role,overtime_approver_level1_employee_id,overtime_approver_level2_employee_id,created_at,updated_at) VALUES ('default','PERSON_BASED','PERSON_BASED','PERSON_BASED','PERSON_BASED','PERSON_BASED','PERSON_BASED','l1','l2',now(),now())");
    const flow = async (first: string | null = "l1", second: string | null = "l2") => pool.query("UPDATE settings_approval_flow SET overtime_approver_level1_employee_id=$1,overtime_approver_level2_employee_id=$2", [first, second]);
    const input = (date: string, change = {}) => createOvertimeSchema.parse({ clientId: "c1", overtimeDate: date, startTime: "18:00", endTime: "20:00", endsNextDay: false, description: "Private overtime description", ...change });
    const create = (date: string, change = {}, who = "owner") => svc.createOvertime(actor(who), input(date, change));
    const decide = (id: string, who: string, action: "APPROVE" | "REJECT" | "CANCEL", note?: string) => svc.decideOvertime(actor(who), id, decisionSchema.parse({ action, note }));
    const query = (scope: "mine" | "approval" | "related" | "all", extra = {}) => listOvertimeSchema.parse({ scope, ...extra });
    const count = async (table: string, id: string) => Number((await pool.query(`SELECT count(*) AS n FROM ${table} WHERE ${table === "overtime_requests" ? "id" : "entity_id"}=$1`, [id])).rows[0].n);
    const check = async (name: string, run: () => Promise<void>) => { await run(); passed++; console.log(`PASS ${name}`); };
    const untouchedTables = ["contracts", "termins", "invoices", "letters", "ope_documents", "attendance_records", "leave_requests", "business_trips", "reimbursements"];
    const fingerprint = async () => Promise.all(untouchedTables.map(async table => (await pool.query(`SELECT coalesce(jsonb_agg(t ORDER BY id)::text,'[]') AS value FROM ${table} t`)).rows[0].value));
    const originalBusinessData = await fingerprint();
    await check("active contracted client options dedup and newest order", async () => { assert.deepEqual((await svc.listClientOptions()).map(row => row.id), ["c1", "c2"]); });
    await check("submit + L1 + L2 real status/event/notification/audit chain", async () => {
      const row = await create("2026-11-01"); assert.equal(row.status, "SUBMITTED");
      assert.equal(row.startsAt.toISOString(), "2026-11-01T11:00:00.000Z");
      assert.equal(row.durationMinutes, 120);
      assert.equal((await pool.query("SELECT user_id FROM notifications WHERE entity_id=$1", [row.id])).rows[0].user_id, "user-l1");
      await assert.rejects(decide(row.id, "l2", "APPROVE"));
      await assert.rejects(decide(row.id, "admin", "APPROVE"));
      assert.equal((await decide(row.id, "l1", "APPROVE")).status, "WAITING_LEVEL_2");
      assert.equal((await svc.listOvertime(actor("l2"), query("approval"))).items[0].id, row.id);
      assert.equal((await decide(row.id, "l2", "APPROVE")).status, "APPROVED");
      assert.equal(await count("workflow_events", row.id), 3);
      assert.equal(await count("notifications", row.id), 4);
      assert.equal(await count("audit_logs", row.id), 3);
      await assert.rejects(decide(row.id, "l2", "APPROVE"));
      await assert.rejects(decide(row.id, "owner", "CANCEL"));
      const audits = (await pool.query("SELECT details FROM audit_logs WHERE entity_id=$1", [row.id])).rows;
      assert.ok(!JSON.stringify(audits).includes("Private overtime description"));
    });
    await check("unrelated Staff denied detail/all/export; filters do not widen identity", async () => {
      const row = await create("2026-11-02");
      await assert.rejects(svc.getOvertime(actor("other"), row.id));
      await assert.rejects(svc.listOvertime(actor("other"), query("all")));
      await assert.rejects(loadOvertimeExport(actor("other"), { scope: "all" }));
      assert.equal((await svc.listOvertime(actor("other"), query("mine", { employeeId: "owner" }))).total, 0);
      assert.equal((await svc.getOvertime(actor("admin"), row.id)).id, row.id);
    });
    await check("two simultaneous same-employee cross-client overlapping submits serialize", async () => {
      const results = await Promise.allSettled([create("2026-11-03"), create("2026-11-03", { clientId: "c2" })]);
      assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
      const row = (results.find(r => r.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof create>>>).value;
      assert.equal(await count("workflow_events", row.id), 1); assert.equal(await count("notifications", row.id), 1);
    });
    await check("duplicate approval creates one stage transition/event only", async () => {
      const row = await create("2026-11-04");
      const results = await Promise.allSettled([decide(row.id, "l1", "APPROVE"), decide(row.id, "l1", "APPROVE")]);
      assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
      assert.equal((await svc.getOvertime(actor("owner"), row.id)).status, "WAITING_LEVEL_2");
      assert.equal(await count("workflow_events", row.id), 2); assert.equal(await count("notifications", row.id), 3);
    });
    await check("cancel/approve race has valid serial history, ends cancelled without lost updates", async () => {
      const row = await create("2026-11-05");
      await Promise.allSettled([decide(row.id, "l1", "APPROVE"), decide(row.id, "owner", "CANCEL")]);
      const detail = await svc.getOvertime(actor("owner"), row.id); assert.equal(detail.status, "CANCELLED");
      assert.ok([2, 3].includes(detail.workflowEvents.length));
      assert.equal(detail.workflowEvents.at(-1)?.toStatus, "CANCELLED");
    });
    await check("snapshot approvers survive Settings changes", async () => {
      const row = await create("2026-11-06"); await flow("replacement", "l2");
      await assert.rejects(decide(row.id, "replacement", "APPROVE"));
      await decide(row.id, "l1", "APPROVE"); await flow();
    });
    await check("rejection mandatory reason, final blocks actions, rejected interval reusable", async () => {
      const row = await create("2026-11-07"); assert.equal(decisionSchema.safeParse({ action: "REJECT", note: " " }).success, false);
      await decide(row.id, "l1", "REJECT", "Private rejection reason");
      assert.equal((await svc.getOvertime(actor("owner"), row.id)).workflowEvents.at(-1)?.note, "Private rejection reason");
      await assert.rejects(decide(row.id, "l1", "APPROVE"));
      assert.ok(!JSON.stringify((await pool.query("SELECT details FROM audit_logs WHERE entity_id=$1", [row.id])).rows).includes("Private rejection reason"));
      assert.ok((await create("2026-11-07")).id);
    });
    await check("Level 2 rejection ends workflow and preserves reason/level", async () => {
      const row = await create("2026-11-19"); await decide(row.id, "l1", "APPROVE");
      assert.equal((await decide(row.id, "l2", "REJECT", "L2 rejection")).status, "REJECTED");
      const detail = await svc.getOvertime(actor("owner"), row.id);
      assert.equal(detail.workflowEvents.at(-1)?.level, 2); assert.equal(detail.workflowEvents.at(-1)?.note, "L2 rejection");
      await assert.rejects(decide(row.id, "owner", "CANCEL"));
    });
    await check("overnight overlap blocks next day, adjacent allowed, 24:00 normalized once", async () => {
      const row = await create("2026-11-08", { startTime: "22:00", endTime: "02:00", endsNextDay: true }); assert.equal(row.durationMinutes, 240);
      await assert.rejects(create("2026-11-09", { startTime: "01:00", endTime: "03:00" }));
      assert.equal((await create("2026-11-09", { startTime: "02:00", endTime: "03:00" })).durationMinutes, 60);
      assert.equal((await create("2026-11-10", { startTime: "23:00", endTime: "24:00", endsNextDay: true })).durationMinutes, 60);
    });
    await check("self approval L1/L2 allowed without skipping levels or duplicate recipients", async () => {
      await flow("owner", "l2"); const first = await create("2026-11-11");
      assert.equal((await decide(first.id, "owner", "APPROVE")).status, "WAITING_LEVEL_2");
      await flow("l1", "owner"); const second = await create("2026-11-12"); await decide(second.id, "l1", "APPROVE");
      assert.equal(await count("notifications", second.id), 2);
      assert.equal((await decide(second.id, "owner", "APPROVE")).status, "APPROVED"); await flow();
    });
    await check("inactive approver blocked, inactive owner can recover by cancellation", async () => {
      const row = await create("2026-11-13"); await pool.query("UPDATE employees SET is_active=false WHERE id IN ('l1','owner')");
      await assert.rejects(decide(row.id, "l1", "APPROVE")); await assert.rejects(create("2026-11-14"));
      assert.equal((await decide(row.id, "owner", "CANCEL")).status, "CANCELLED");
      await pool.query("UPDATE employees SET is_active=true");
    });
    await check("missing config / inactive login / uncontracted client block submit", async () => {
      await flow(null, null); await assert.rejects(create("2026-11-15")); await flow();
      await pool.query("UPDATE users SET is_active=false WHERE employee_id='l1'"); await assert.rejects(create("2026-11-15"));
      await pool.query("UPDATE users SET is_active=true");
      await assert.rejects(create("2026-11-15", { clientId: "no-contract" })); await assert.rejects(create("2026-11-15", { clientId: "inactive" }));
    });
    await check("notification failure rolls back request and event, audit not written", async () => {
      await pool.query("CREATE FUNCTION fail_test_notification() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test notification failure'; END $$; CREATE TRIGGER test_fail BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION fail_test_notification()");
      const before = Number((await pool.query("SELECT count(*) AS n FROM overtime_requests")).rows[0].n);
      await assert.rejects(create("2026-11-16"));
      assert.equal(Number((await pool.query("SELECT count(*) AS n FROM overtime_requests")).rows[0].n), before);
      await pool.query("ALTER TABLE notifications DISABLE TRIGGER test_fail");
      const pending = await create("2026-11-16");
      await pool.query("ALTER TABLE notifications ENABLE TRIGGER test_fail");
      await assert.rejects(decide(pending.id, "l1", "APPROVE"));
      assert.equal((await svc.getOvertime(actor("owner"), pending.id)).status, "SUBMITTED");
      assert.equal(await count("workflow_events", pending.id), 1); assert.equal(await count("audit_logs", pending.id), 1);
      await pool.query("DROP TRIGGER test_fail ON notifications; DROP FUNCTION fail_test_notification()");
      assert.equal((await decide(pending.id, "l1", "APPROVE")).status, "WAITING_LEVEL_2");
    });
    await check("audit failure does not undo committed request/event/notifications", async () => {
      await pool.query("ALTER TABLE audit_logs RENAME TO audit_logs_temporarily_unavailable");
      const original = console.error; console.error = () => {};
      try { const row = await create("2026-11-17"); assert.equal(await count("workflow_events", row.id), 1); assert.equal(await count("notifications", row.id), 1); }
      finally { console.error = original; await pool.query("ALTER TABLE audit_logs_temporarily_unavailable RENAME TO audit_logs"); }
    });
    await check("export real filtered data spans pages with correct decisions and no writes", async () => {
      for (let day = 1; day <= 25; day++) await create(`2027-01-${String(day).padStart(2, "0")}`);
      const filters = { scope: "all" as const, fromDate: "2027-01-01", toDate: "2027-01-31" };
      assert.equal((await svc.listOvertime(actor("admin"), query("all", { ...filters, limit: 20 }))).items.length, 20);
      const result = await loadOvertimeExport(actor("admin"), filters); assert.equal(result.rows.length, 25);
      const workbook = buildOvertimeWorkbook(result.rows, result.events, filters); assert.equal(XLSX.utils.sheet_to_json(workbook.Sheets.Overtime).length, 25);
      assert.equal((await loadOvertimeExport(actor("admin"), { scope: "all", status: "APPROVED" })).rows.every(row => row.status === "APPROVED"), true);
    });
    await check("FK protects employee history; deleting client retains name snapshot", async () => {
      await assert.rejects(pool.query("DELETE FROM employees WHERE id='owner'"));
      await pool.query("INSERT INTO clients (id,name,code,created_at,updated_at) VALUES ('temporary','Historic Client','temporary',now(),now())");
      await pool.query("INSERT INTO contracts (id,proposal_date,client_id,service_code,engagement_no,seq_no,proposal_number,contract_value,payment_status,status,created_at,updated_at) SELECT 'temporary',now(),'temporary','A',1,1,'temporary',1000,'UNPAID','ACTIVE',now(),now()");
      const row = await create("2026-11-18", { clientId: "temporary" });
      await pool.query("DELETE FROM contracts WHERE id='temporary'; DELETE FROM clients WHERE id='temporary'");
      const historic = await svc.getOvertime(actor("owner"), row.id); assert.equal(historic.clientId, null); assert.equal(historic.clientName, "Historic Client");
    });
    await check("employee deletion eligibility and unrelated business tables unchanged", async () => {
      const { getDb } = await import("../src/lib/db");
      const { buildEmployeeHardDeleteEligibilityMap } = await import("../src/lib/employee-hard-delete");
      const eligibility = await buildEmployeeHardDeleteEligibilityMap(getDb(), [{ id: "owner", isActive: false, hasLinkedUser: false }]);
      assert.equal(eligibility.get("owner")?.canHardDelete, false);
      assert.ok(eligibility.get("owner")?.reasons.some(reason => reason.includes("Overtime")));
      assert.deepEqual(await fingerprint(), originalBusinessData);
    });
    // Optional true HTTP integration against a separate production build. Never
    // starts or reconfigures an existing dev server or uses a workspace .env.
    const buildDir = process.env.OVERTIME_TEST_BUILD_DIR;
    if (buildDir) {
      const resolved = path.resolve(buildDir);
      assert.equal(path.dirname(resolved), path.resolve(tmpdir()));
      assert.ok(path.basename(resolved).startsWith("iecnet-overtime-build-"));
      await readFile(path.join(resolved, ".next/BUILD_ID"));
      const httpPort = await new Promise<number>((resolve, reject) => {
        const server = net.createServer(); server.on("error", reject);
        server.listen(0, "127.0.0.1", () => { const address = server.address() as net.AddressInfo; server.close(() => resolve(address.port)); });
      });
      process.env.SESSION_SECRET = "disposable-integration-session-only";
      const base = `http://127.0.0.1:${httpPort}`;
      httpServer = spawn(process.execPath, [path.resolve("node_modules/next/dist/bin/next"), "start", resolved, "-H", "127.0.0.1", "-p", String(httpPort)], {
        windowsHide: true, stdio: "ignore", env: { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" },
      });
      let startError: Error | undefined;
      httpServer.once("error", error => { startError = error; });
      let ready = false;
      for (let attempt = 0; attempt < 150; attempt++) {
        if (startError) throw startError;
        try { if ((await fetch(`${base}/api/overtime`)).status === 401) { ready = true; break; } } catch { /* booting */ }
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      assert.ok(ready, "isolated production server became ready");
      const { createSessionToken } = await import("../src/lib/auth/session");
      const http = (who: string | null, route: string, method = "GET", body?: unknown) => fetch(base + route, {
        method, headers: { "Content-Type": "application/json", ...(who ? { Cookie: `iecnet_session=${createSessionToken({ userId: actor(who).id, role: actor(who).role, username: who, name: who, employeeId: who })}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      await check("HTTP auth, Admin-only export/audit and inactive account rejection", async () => {
        for (const endpoint of ["/api/overtime", "/api/overtime/export", "/api/overtime/client-options"]) assert.equal((await http(null, endpoint)).status, 401);
        assert.equal((await http("owner", "/api/overtime?scope=all")).status, 403);
        assert.equal((await http("owner", "/api/overtime/export?scope=all")).status, 403);
        assert.equal((await http("owner", "/api/audit-logs")).status, 403);
        const staleClaims = createSessionToken({ userId: "user-owner", role: "ADMIN", employeeId: "l1", name: "stale claims", username: "owner" });
        assert.equal((await fetch(`${base}/api/overtime/export?scope=all`, { headers: { Cookie: `iecnet_session=${staleClaims}` } })).status, 403);
        await pool.query("UPDATE users SET is_active=false WHERE id='user-other'");
        assert.equal((await http("other", "/api/overtime")).status, 403);
        await pool.query("UPDATE users SET is_active=true WHERE id='user-other'");
      });
      await check("HTTP full submit L1 L2, validation, ownership, notifications and audit", async () => {
        assert.equal((await http("owner", "/api/overtime", "POST", { ...input("2027-02-01"), employeeId: "other" })).status, 400);
        const response = await http("owner", "/api/overtime", "POST", input("2027-02-01")); assert.equal(response.status, 201);
        const row = await response.json() as { id: string };
        assert.equal((await http("other", `/api/overtime/${row.id}`)).status, 404);
        assert.equal((await http("l2", `/api/overtime/${row.id}`, "PATCH", { action: "APPROVE" })).status, 403);
        assert.equal((await http("l1", `/api/overtime/${row.id}`, "PATCH", { action: "REJECT", note: " " })).status, 400);
        const approve = await http("l1", `/api/overtime/${row.id}`, "PATCH", { action: "APPROVE" }); assert.equal((await approve.json()).status, "WAITING_LEVEL_2");
        const final = await http("l2", `/api/overtime/${row.id}`, "PATCH", { action: "APPROVE" }); assert.equal((await final.json()).status, "APPROVED");
        assert.equal((await http("owner", `/api/overtime/${row.id}`, "PATCH", { action: "CANCEL" })).status, 409);
        assert.equal(await count("workflow_events", row.id), 3); assert.equal(await count("notifications", row.id), 4); assert.equal(await count("audit_logs", row.id), 3);
        const notices = await (await http("l1", "/api/notifications?limit=100")).json();
        assert.ok(notices.items.some((notice: { entityId: string }) => notice.entityId === row.id));
        const notice = notices.items.find((item: { entityId: string }) => item.entityId === row.id);
        assert.equal((await http("other", `/api/notifications/${notice.id}/read`, "PATCH")).status, 404);
        assert.equal((await http("l1", `/api/notifications/${notice.id}/read`, "PATCH")).status, 200);
        assert.equal((await http("admin", "/api/employees/owner", "DELETE")).status, 409);
      });
      await check("HTTP Excel exports all filtered pages, validates dates, audits export", async () => {
        const response = await http("admin", "/api/overtime/export?scope=all&fromDate=2027-01-01&toDate=2027-01-31&limit=1&offset=20"); assert.equal(response.status, 200);
        assert.ok(response.headers.get("content-type")?.includes("spreadsheetml"));
        const book = XLSX.read(Buffer.from(await response.arrayBuffer()), { type: "buffer" }); assert.equal(XLSX.utils.sheet_to_json(book.Sheets.Overtime).length, 25);
        assert.equal((await http("admin", "/api/overtime/export?scope=all&fromDate=2027-02-01&toDate=2027-01-01")).status, 400);
        const audit = await (await http("admin", "/api/audit-logs?module=OVERTIME&action=EXPORT")).json(); assert.ok(audit.data.some((event: { details: { count: number } }) => event.details.count === 25));
      });
      await check("HTTP old Settings payload preserves overtime approvers", async () => {
        const body = { leaveApprovalLevels: 2, leaveApproverLevel1EmployeeId: "l1", leaveApproverLevel2EmployeeId: "l2", reimbursementApprovalLevels: 2, reimbursementApproverLevel1EmployeeId: "l1", reimbursementApproverLevel2EmployeeId: "l2", businessTripApprovalLevels: 2, businessTripApproverLevel1EmployeeId: "l1", businessTripApproverLevel2EmployeeId: "l2" };
        const response = await http("admin", "/api/settings/approval-flow", "PUT", body); assert.equal(response.status, 200);
        const settings = await response.json(); assert.equal(settings.overtimeApproverLevel1EmployeeId, "l1"); assert.equal(settings.overtimeApproverLevel2EmployeeId, "l2");
        assert.equal((await http("admin", "/api/settings/approval-flow", "PUT", { ...body, overtimeApproverLevel1EmployeeId: "l1", overtimeApproverLevel2EmployeeId: "l1" })).status, 400);
      });
    }
    console.log(`SUCCESS: ${passed} PostgreSQL integration scenarios. No existing database accessed.`);
  } finally {
    httpServer?.kill();
    await pool.end();
    if (started) command("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
    console.log(`${started ? "Disposable cluster stopped" : "Cluster initialization did not complete"}. Test artifacts retained at ${root}`);
  }
}
main().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
