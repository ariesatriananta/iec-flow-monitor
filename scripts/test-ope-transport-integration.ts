/** Disposable PostgreSQL only. Never loads .env or uses an inherited database URL. */
import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { Pool } from "pg";
import { desc, sql } from "drizzle-orm";

async function main() {
  const bin = process.env.PG_TEST_BIN ?? (process.platform === "win32" ? "C:/Program Files/PostgreSQL/18/bin" : "");
  const exe = (name: string) => bin ? path.join(bin, name + (process.platform === "win32" ? ".exe" : "")) : name;
  const root = await mkdtemp(path.join(tmpdir(), "iecnet-ope-transport-pg-test-"));
  const data = path.join(root, "data");
  const port = await new Promise<number>((resolve, reject) => {
    const server = net.createServer(); server.on("error", reject);
    server.listen(0, "127.0.0.1", () => { const address = server.address() as net.AddressInfo; server.close(() => resolve(address.port)); });
  });
  const command = (name: string, args: string[]) => {
    const result = spawnSync(exe(name), args, { stdio: "ignore", windowsHide: true, timeout: 60000 });
    if (result.error || result.status !== 0) throw new Error(`${name} failed: ${result.error?.message ?? result.status}`);
  };
  process.env.DATABASE_URL = `postgresql://ope_test@127.0.0.1:${port}/postgres`;
  process.env.DB_POOL_MAX = "12";
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let started = false;
  let httpServer: ChildProcess | undefined;
  let passed = 0;
  try {
    command("initdb", ["-D", data, "-U", "ope_test", "-A", "trust", "--encoding=UTF8", "--locale=C", "--no-sync"]);
    started = true;
    command("pg_ctl", ["-D", data, "-l", path.join(root, "postgres.log"), "-o", `-F -h 127.0.0.1 -p ${port}`, "-w", "start"]);
    console.log("Disposable PostgreSQL started; existing DATABASE_URL ignored.");
    const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")) as { entries: { tag: string }[] };
    for (const entry of journal.entries) await pool.query(await readFile(`drizzle/${entry.tag}.sql`, "utf8"));
    console.log(`PASS ${journal.entries.length} migrations on disposable cluster only`);
    const { createOpe, updateOpe, getOpeClientOptions } = await import("../src/lib/ope/service");
    const { opeInputSchema } = await import("../src/lib/ope/validation");
    const { opeQuerySchema, opeListWhere } = await import("../src/lib/ope/query");
    const { allocateDocumentNumber } = await import("../src/lib/document-numbering");
    const { getDb } = await import("../src/lib/db");
    const { invoices, opeDocuments } = await import("../src/lib/db/schema");
    const db = getDb();
    const check = async (name: string, run: () => Promise<void>) => { await run(); passed++; console.log(`PASS ${name}`); };
    for (const [id, name, active] of [["c1", "Alpha Snapshot Client", true], ["c2", "Beta Client 100%_", true], ["inactive", "Inactive", false], ["no-contract", "No contract", true]] as const) {
      await pool.query("INSERT INTO clients(id,name,code,address,npwp,npwp_2,is_active,created_at,updated_at) VALUES($1,$2,$1,'Original Address','OLD-NPWP','1234567890123456',$3,now(),now())", [id, name, active]);
    }
    for (const [id, client, status, created] of [["ct1", "c1", "ACTIVE", "2026-01-01"], ["ct2", "c2", "ACTIVE", "2026-02-01"], ["ct3", "c1", "ACTIVE", "2026-03-01"], ["ct4", "inactive", "ACTIVE", "2026-04-01"], ["ct5", "no-contract", "VOID", "2026-05-01"]]) {
      await pool.query("INSERT INTO contracts(id,proposal_date,client_id,service_code,engagement_no,seq_no,proposal_number,contract_value,payment_status,status,created_at,updated_at) VALUES($1,now(),$2,'A',1,1,$1,1000000,'UNPAID',$3,$4,now())", [id, client, status, created]);
    }
    await pool.query("INSERT INTO employees(id,employee_code,full_name,is_active,created_at,updated_at) VALUES('e1','EM001','Employee Snapshot',true,now(),now())");
    await pool.query("INSERT INTO termins(id,contract_id,termin_name,termin_amount,status,created_at,updated_at) VALUES('t1','ct1','Test',1000000,'PENDING',now(),now())");
    const expense = (type = "TRANSPORT", extra = {}) => opeInputSchema.parse({
      type, documentDate: "2026-11-25", subject: "Transport integration", notes: "Fixture only", usePpn: true, usePph23: true,
      items: [{ expenseDate: "2026-11-24", clientId: "c1", description: "Taxi", amount: 100000 }, { expenseDate: "2026-11-25", clientId: "c2", description: "Train", amount: 50000 }], ...extra,
    });
    const bt = () => opeInputSchema.parse({ type: "BUSINESS_TRIP", documentDate: "2026-11-25", clientId: "c1", subject: "Business trip regression", usePpn: false, usePph23: false, items: [{ employeeId: "e1", days: 2, rate: 100000 }] });
    const list = async (params = {}) => {
      const query = opeQuerySchema.parse(params); const where = opeListWhere(query);
      const [items, [count]] = await Promise.all([
        db.select().from(opeDocuments).where(where).orderBy(desc(opeDocuments.createdAt), desc(opeDocuments.id)).limit(query.limit).offset(query.offset),
        db.select({ total: sql<number>`count(*)::int` }).from(opeDocuments).where(where),
      ]);
      return { items, total: count.total };
    };
    // Uses the actual shared allocator with a real invoice insert in the same transaction.
    // This deliberately does not substitute for HTTP invoice issuance coverage.
    const invoice = (date = "2026-11-25") => db.transaction(async tx => {
      const n = await allocateDocumentNumber(tx, new Date(date));
      const [row] = await tx.insert(invoices).values({ id: crypto.randomUUID(), invoiceDate: new Date(date), contractId: "ct1", terminId: "t1", seqNo: n.seqNo, invoiceNumber: n.documentNumber, amount: "1000000", pph23Rate: "2", status: "UNPAID", createdAt: new Date(), updatedAt: new Date() }).returning();
      return row;
    });
    await check("client options contracted/active, deduplicated, newest contract first", async () => {
      assert.deepEqual((await getOpeClientOptions()).map(row => row.id), ["c1", "c2"]);
    });
    let transport = await createOpe(expense());
    await check("Transport stores multi-client snapshots, rows, dates, PPN/PPh and net total", async () => {
      assert.equal(transport.type, "TRANSPORT"); assert.equal(transport.status, "DRAFT"); assert.equal(transport.clientSnapshot, null);
      assert.deepEqual(transport.items.map(row => row.clientSnapshot?.name), ["Alpha Snapshot Client", "Beta Client 100%_"]);
      assert.deepEqual(transport.items.map(row => row.position), [0, 1]);
      assert.equal(transport.items[0].expenseDate?.toISOString(), "2026-11-24T00:00:00.000Z");
      assert.equal(transport.subtotal, "150000"); assert.equal(transport.ppnAmount, "16500"); assert.equal(transport.pph23Amount, "3000"); assert.equal(transport.total, "163500");
      assert.equal(transport.documentNumber, "I.001/ARM/XI/2026");
    });
    await check("alternating invoice/Meals/Business Trip/Transport shares continuous numbers", async () => {
      assert.equal((await invoice()).seqNo, 2);
      assert.equal((await createOpe(expense("MEALS"))).seqNo, 3);
      assert.equal((await createOpe(bt())).seqNo, 4);
      assert.equal((await createOpe(expense())).seqNo, 5);
    });
    await check("concurrent real invoice and all OPE types receive unique consecutive numbers", async () => {
      const rows = await Promise.all([invoice(), createOpe(expense()), createOpe(expense("MEALS")), createOpe(bt()), invoice(), createOpe(expense())]);
      assert.deepEqual(rows.map(row => row.seqNo).sort((a, b) => a - b), [6, 7, 8, 9, 10, 11]);
    });
    await check("draft update preserves number and snapshots despite master changes/inactivation", async () => {
      await pool.query("UPDATE clients SET name='Changed master',address='Changed address',is_active=false WHERE id='c1'");
      const updated = await updateOpe(transport.id, expense("TRANSPORT", { subject: "Edited transport", documentDate: "2027-01-01" }));
      assert.equal(updated.document.documentNumber, transport.documentNumber);
      assert.equal(updated.document.items[0].clientSnapshot?.name, "Alpha Snapshot Client");
      assert.equal(updated.document.items[0].clientSnapshot?.address, "Original Address");
      assert.equal(updated.document.numberYear, 2026); transport = updated.document;
      await assert.rejects(createOpe(expense()));
      await pool.query("UPDATE clients SET name='Alpha Snapshot Client',address='Original Address',is_active=true WHERE id='c1'");
    });
    await check("draft item replacement recalculates all four tax-toggle combinations", async () => {
      for (const [usePpn, usePph23, total] of [[false, false, "101"], [true, false, "112"], [false, true, "99"], [true, true, "110"]] as const) {
        const result = await updateOpe(transport.id, expense("TRANSPORT", { usePpn, usePph23, items: [{ expenseDate: "2026-11-25", clientId: "c2", description: "Rounding", amount: 101 }] }));
        assert.equal(result.document.items.length, 1); assert.equal(result.document.total, total);
      }
    });
    await check("type immutable and failed client validation leaves prior draft unchanged", async () => {
      const before = (await pool.query("SELECT * FROM ope_items WHERE document_id=$1 ORDER BY position", [transport.id])).rows;
      await assert.rejects(updateOpe(transport.id, expense("MEALS")));
      for (const clientId of ["missing", "inactive", "no-contract"]) await assert.rejects(updateOpe(transport.id, expense("TRANSPORT", { items: [{ expenseDate: "2026-11-25", clientId, description: "Invalid", amount: 1 }] })));
      assert.deepEqual((await pool.query("SELECT * FROM ope_items WHERE document_id=$1 ORDER BY position", [transport.id])).rows, before);
    });
    await check("Transport status rules, non-draft edits rejected, PAID terminal", async () => {
      await assert.rejects(updateOpe(transport.id, { status: "PAID" }));
      assert.equal((await updateOpe(transport.id, { status: "ISSUED" })).document.status, "ISSUED");
      await assert.rejects(updateOpe(transport.id, expense()));
      assert.equal((await updateOpe(transport.id, { status: "PAID" })).document.status, "PAID");
      await assert.rejects(updateOpe(transport.id, { status: "VOID" }));
    });
    const voided = await createOpe(expense()); await updateOpe(voided.id, { status: "VOID" });
    await check("VOID terminal and NON_VOID excludes it without changing type counts", async () => {
      await assert.rejects(updateOpe(voided.id, { status: "ISSUED" }));
      assert.equal((await list({ group: "MEALS_TRANSPORT" })).total - (await list({ group: "MEALS_TRANSPORT", status: "NON_VOID" })).total, 1);
      assert.deepEqual((await list({ group: "MEALS_TRANSPORT", status: "VOID" })).items.map(row => row.id), [voided.id]);
    });
    await check("group union counts and explicit Meals/Transport filters stay separate", async () => {
      const meals = await list({ type: "MEALS" }); const transports = await list({ type: "TRANSPORT" });
      assert.ok(meals.total > 0 && transports.total > 0);
      assert.ok(meals.items.every(row => row.type === "MEALS"));
      assert.equal((await list({ group: "MEALS_TRANSPORT" })).total, meals.total + transports.total);
      assert.equal((await list({ type: "BUSINESS_TRIP" })).total, 2);
    });
    await check("actual SQL searches any detail client, case-insensitive and deduplicated", async () => {
      const row = await createOpe(expense("TRANSPORT", { items: [{ expenseDate: "2026-11-25", clientId: "c2", description: "A", amount: 1 }, { expenseDate: "2026-11-25", clientId: "c2", description: "B", amount: 2 }] }));
      const found = await list({ group: "MEALS_TRANSPORT", q: "beta client" });
      assert.equal(found.items.filter(item => item.id === row.id).length, 1); assert.equal(found.total, found.items.length);
      assert.ok((await list({ group: "MEALS_TRANSPORT", q: row.documentNumber })).items.some(item => item.id === row.id));
      assert.ok((await list({ type: "TRANSPORT", q: "transport integration" })).items.some(item => item.id === transport.id));
      assert.equal((await list({ q: "no such client query" })).total, 0);
    });
    await check("SQL search literal wildcard characters and injection cannot widen result", async () => {
      assert.ok((await list({ group: "MEALS_TRANSPORT", q: "100%_" })).total > 0);
      assert.equal((await list({ q: "100__" })).total, 0);
      assert.equal((await list({ q: "' OR 1=1 --" })).total, 0);
    });
    await check("pagination totals stable and pages distinct under combined search/status/group", async () => {
      const query = { group: "MEALS_TRANSPORT", q: "Beta", status: "NON_VOID", limit: 2 };
      const a = await list(query), b = await list({ ...query, offset: 2 });
      assert.equal(a.total, b.total); assert.equal(a.items.length, 2); assert.equal(b.items.length, 2);
      assert.ok(!a.items.some(item => b.items.some(other => other.id === item.id)));
      assert.equal((await list({ ...query, offset: 10000 })).items.length, 0);
    });
    await check("failed detail insert rolls back header, items and shared counter", async () => {
      const before = (await pool.query("SELECT last_seq FROM document_number_counters WHERE year=2026")).rows[0].last_seq;
      const count = (await pool.query("SELECT count(*)::int AS n FROM ope_documents")).rows[0].n;
      await pool.query("CREATE FUNCTION fail_ope_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test only'; END $$; CREATE TRIGGER fail_ope_test BEFORE INSERT ON ope_items FOR EACH ROW EXECUTE FUNCTION fail_ope_test()");
      await assert.rejects(createOpe(expense()));
      await pool.query("DROP TRIGGER fail_ope_test ON ope_items; DROP FUNCTION fail_ope_test()");
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM ope_documents")).rows[0].n, count);
      assert.equal((await pool.query("SELECT last_seq FROM document_number_counters WHERE year=2026")).rows[0].last_seq, before);
      assert.equal((await createOpe(expense())).seqNo, before + 1);
    });
    await check("annual reset and Jakarta midnight determine numbering year/month", async () => {
      assert.equal((await createOpe(expense("TRANSPORT", { documentDate: "2027-01-01" }))).documentNumber, "I.001/ARM/I/2027");
      const late = await createOpe(expense("TRANSPORT", { documentDate: "2027-12-31T18:00:00Z" }));
      assert.equal(late.documentNumber, "I.001/ARM/I/2028");
    });
    await check("legacy OPE numbers unaffected; old Meals records remain readable", async () => {
      const row = await createOpe(expense("MEALS"));
      await pool.query("UPDATE ope_documents SET document_number='OPE/ML/2026/9999' WHERE id=$1", [row.id]);
      const before = (await pool.query("SELECT * FROM ope_documents WHERE id=$1", [row.id])).rows;
      await createOpe(expense());
      assert.deepEqual((await pool.query("SELECT * FROM ope_documents WHERE id=$1", [row.id])).rows, before);
      assert.ok((await list({ type: "MEALS", q: "OPE/ML/2026/9999" })).items.some(item => item.id === row.id));
    });
    await check("concurrent duplicate issue requests yield one accepted transition", async () => {
      const row = await createOpe(expense());
      // Both transitions can legitimately succeed sequentially (ISSUED -> VOID).
      // Competing same-target issue requests, however, must create one transition only.
      const results = await Promise.allSettled([updateOpe(row.id, { status: "ISSUED" }), updateOpe(row.id, { status: "ISSUED" })]);
      assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    });
    if (process.env.OPE_TEST_APP_DIR) {
      const build = path.resolve(process.env.OPE_TEST_APP_DIR);
      assert.equal(path.dirname(build), path.resolve(tmpdir()));
      assert.ok(path.basename(build).startsWith("iecnet-transport-build-"));
      await readFile(path.join(build, ".next/BUILD_ID"));
      for (const role of ["ADMIN", "STAFF"]) await pool.query("INSERT INTO users(id,username,name,role,is_active,password_hash,created_at,updated_at) VALUES($1,$1,$1,$2,true,'TEST-ONLY',now(),now())", [role, role]);
      const httpPort = await new Promise<number>((resolve, reject) => {
        const server = net.createServer(); server.on("error", reject);
        server.listen(0, "127.0.0.1", () => { const address = server.address() as net.AddressInfo; server.close(() => resolve(address.port)); });
      });
      process.env.SESSION_SECRET = "transport-integration-test-only";
      const base = `http://127.0.0.1:${httpPort}`;
      httpServer = spawn(process.execPath, [path.resolve("node_modules/next/dist/bin/next"), "start", build, "-H", "127.0.0.1", "-p", String(httpPort)], { windowsHide: true, stdio: "ignore", env: { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" } });
      let startError: Error | undefined; httpServer.once("error", error => { startError = error; });
      let ready = false;
      for (let attempt = 0; attempt < 150; attempt++) {
        if (startError) throw startError;
        try { if ((await fetch(`${base}/api/ope`)).status === 401) { ready = true; break; } } catch { /* booting */ }
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      assert.ok(ready, "isolated production server ready");
      const { createSessionToken } = await import("../src/lib/auth/session");
      const http = (role: "ADMIN" | "STAFF" | null, route: string, method = "GET", body?: unknown) => fetch(base + route, { method, headers: { "Content-Type": "application/json", ...(role ? { Cookie: `iecnet_session=${createSessionToken({ userId: role, role, username: role, name: role })}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const payload = () => ({ ...expense(), documentDate: "2026-11-25", items: [{ expenseDate: "2026-11-25", clientId: "c1", description: "HTTP taxi", amount: 100000 }, { expenseDate: "2026-11-25", clientId: "c2", description: "HTTP train", amount: 50000 }] });
      await check("HTTP anonymous/Staff denied OPE list, create, detail and client options", async () => {
        assert.equal((await http(null, "/api/ope")).status, 401);
        for (const route of ["/api/ope", `/api/ope/${transport.id}`, "/api/ope/client-options"]) assert.equal((await http("STAFF", route)).status, 403);
        assert.equal((await http("STAFF", "/api/ope", "POST", payload())).status, 403);
        assert.equal((await http("STAFF", `/api/ope/${transport.id}`, "PUT", { status: "VOID" })).status, 403);
      });
      let httpId = ""; let httpNumber = "";
      await check("HTTP Transport creates, reads, edits, locks type and writes simple audit", async () => {
        const response = await http("ADMIN", "/api/ope", "POST", payload()); assert.equal(response.status, 201);
        const row = await response.json(); httpId = row.id; httpNumber = row.documentNumber;
        assert.equal(row.type, "TRANSPORT"); assert.equal(row.total, "163500"); assert.equal(row.items.length, 2);
        const get = await http("ADMIN", `/api/ope/${httpId}`); assert.equal(get.status, 200); assert.equal((await get.json()).type, "TRANSPORT");
        assert.equal((await http("ADMIN", `/api/ope/${httpId}`, "PUT", { ...payload(), type: "MEALS" })).status, 400);
        const edit = await http("ADMIN", `/api/ope/${httpId}`, "PUT", { ...payload(), subject: "HTTP edited" }); assert.equal(edit.status, 200); assert.equal((await edit.json()).documentNumber, httpNumber);
        assert.equal(Number((await pool.query("SELECT count(*) AS n FROM audit_logs WHERE entity_id=$1", [httpId])).rows[0].n), 2);
      });
      await check("HTTP list envelope search/group/non-void pagination and explicit type", async () => {
        const response = await http("ADMIN", "/api/ope?group=MEALS_TRANSPORT&q=HTTP%20edited&status=NON_VOID&limit=1&offset=0"); assert.equal(response.status, 200);
        const page = await response.json(); assert.equal(page.total, 1); assert.equal(page.limit, 1); assert.equal(page.offset, 0); assert.equal(page.items[0].id, httpId);
        const meals = await (await http("ADMIN", "/api/ope?type=MEALS")).json(); assert.ok(meals.items.every((row: { type: string }) => row.type === "MEALS"));
        assert.equal((await http("ADMIN", "/api/ope?type=MEALS&group=MEALS_TRANSPORT")).status, 400);
      });
      await check("HTTP invalid input rejected and status-only body cannot bypass Draft immutability", async () => {
        for (const body of [{ ...payload(), status: "ISSUED" }, { ...payload(), items: [] }, { ...payload(), type: "INVALID" }]) assert.equal((await http("ADMIN", "/api/ope", "POST", body)).status, 400);
        assert.equal((await http("ADMIN", `/api/ope/${httpId}`, "PUT", { status: "ISSUED", subject: "spoof" })).status, 400);
        assert.equal((await http("ADMIN", `/api/ope/${httpId}`, "PUT", { status: "ISSUED" })).status, 200);
        assert.equal((await http("ADMIN", `/api/ope/${httpId}`, "PUT", payload())).status, 409);
        assert.equal((await http("ADMIN", `/api/ope/${httpId}`, "PUT", { status: "VOID" })).status, 200);
        assert.equal((await http("ADMIN", `/api/ope/${httpId}`, "PUT", { status: "PAID" })).status, 409);
      });
    }
    console.log(`SUCCESS: ${passed} PostgreSQL scenarios. Existing databases never accessed.`);
  } finally {
    httpServer?.kill();
    await pool.end();
    if (started) command("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
    console.log(`Disposable test artifacts retained at ${root}`);
  }
}
main().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
