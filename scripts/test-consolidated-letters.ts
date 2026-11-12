/** Disposable PostgreSQL only: does not read .env and replaces inherited DATABASE_URL. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { Pool } from "pg";

async function main() {
  const bin = process.env.PG_TEST_BIN ?? (process.platform === "win32" ? "C:/Program Files/PostgreSQL/18/bin" : "");
  const exe = (name: string) => bin ? path.join(bin, name + (process.platform === "win32" ? ".exe" : "")) : name;
  const root = await mkdtemp(path.join(tmpdir(), "iecnet-consolidated-pg-test-"));
  const data = path.join(root, "data");
  const port = await new Promise<number>((resolve, reject) => {
    const server = net.createServer(); server.on("error", reject);
    server.listen(0, "127.0.0.1", () => { const address = server.address() as net.AddressInfo; server.close(() => resolve(address.port)); });
  });
  const command = (name: string, args: string[]) => {
    // Captured stdio can hang Windows pg_ctl through inherited postgres handles.
    const result = spawnSync(exe(name), args, { stdio: "ignore", windowsHide: true, timeout: 60000 });
    if (result.error || result.status !== 0) throw new Error(`${name} failed: ${result.error?.message ?? result.status}`);
  };
  process.env.DATABASE_URL = `postgresql://consolidated_test@127.0.0.1:${port}/postgres`;
  process.env.DB_POOL_MAX = "12";
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let started = false;
  let passed = 0;
  try {
    command("initdb", ["-D", data, "-U", "consolidated_test", "-A", "trust", "--encoding=UTF8", "--locale=C", "--no-sync"]);
    started = true;
    command("pg_ctl", ["-D", data, "-l", path.join(root, "postgres.log"), "-o", `-F -h 127.0.0.1 -p ${port}`, "-w", "start"]);
    console.log("Disposable PostgreSQL started; existing DATABASE_URL ignored.");
    const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")) as { entries: { tag: string }[] };
    for (const entry of journal.entries) await pool.query(await readFile(`drizzle/${entry.tag}.sql`, "utf8"));
    console.log(`PASS ${journal.entries.length} migrations applied to disposable database only`);
    const svc = await import("../src/lib/letters/consolidated");
    const check = async (name: string, run: () => Promise<void>) => { await run(); passed++; console.log(`PASS ${name}`); };
    for (const id of ["c1", "c2", "inactive"]) await pool.query("INSERT INTO clients(id,name,code,is_active,created_at,updated_at) VALUES($1,$1,$1,$2,now(),now())", [id, id !== "inactive"]);
    await pool.query("INSERT INTO settings(id,company_name,numbering_prefix,numbering_reset,default_ppn_rate,default_signer_name,created_at,updated_at) VALUES('default','Test','AP.2137','YEARLY',11,'Test',now(),now())");
    await pool.query("INSERT INTO letters(id,letter_date,letter_type,subject,seq_no,letter_number,status,created_at,updated_at) VALUES('old-general','2026-11-12','UMUM','Legacy',999,'L.999/AP.2137/XI/2026','ACTIVE',now(),now()),('old-hr','2026-11-12','HRGA','Legacy',888,'888/AP.2137/Employee-A/XI/2026','ACTIVE',now(),now())");
    const legacy = (await pool.query("SELECT * FROM letters ORDER BY id")).rows;
    const input = (letterDate = "2026-11-12", extra = {}) => ({ clientId: "c1", letterDate, opinionDate: "2026-11-10", opinionNumber: "OP.001", ...extra });
    const create = (date?: string, extra = {}) => svc.createConsolidatedLetter(input(date, extra));
    let first: Awaited<ReturnType<typeof create>>;
    await check("CON starts 001 despite high general/HR sequence; client without contract allowed", async () => {
      first = await create(); assert.equal(first.letterNumber, "L.001/CON/AP.2137/XI/2026"); assert.equal(first.subject, "Surat Pengantar Konsolidasian");
    });
    await check("concurrent same-year creates serialize into unique consecutive numbers", async () => {
      const rows = await Promise.all(Array.from({ length: 8 }, () => create()));
      assert.deepEqual(rows.map(row => row.seqNo).sort((a, b) => a - b), [2, 3, 4, 5, 6, 7, 8, 9]);
      assert.equal(new Set(rows.map(row => row.letterNumber)).size, 8);
    });
    await check("month does not reset; each year starts independently", async () => {
      assert.equal((await create("2026-12-01")).seqNo, 10);
      assert.equal((await create("2027-01-01")).seqNo, 1);
      assert.equal((await create("2028-01-01")).seqNo, 1);
    });
    await check("notes, opinion date, number and same-date full form keep document number", async () => {
      const updated = await svc.updateConsolidatedLetter(first.id, { notes: "Note", opinionDate: "2026-10-01", opinionNumber: "OP.002" });
      assert.equal(updated.letterNumber, first.letterNumber); assert.equal(updated.opinionDate, "2026-10-01");
      const full = await svc.updateConsolidatedLetter(first.id, { ...input(first.letterDate.toISOString()), letterType: first.letterType, status: "ACTIVE", subject: "IGNORED", seqNo: first.seqNo, letterNumber: first.letterNumber });
      assert.equal(full.letterNumber, first.letterNumber); assert.equal(full.subject, "Surat Pengantar Konsolidasian");
    });
    await check("month edit retains seq; year edit allocates target year; prefix snapshot retained", async () => {
      await pool.query("UPDATE settings SET numbering_prefix='AP.9999'");
      const month = await svc.updateConsolidatedLetter(first.id, { letterDate: "2026-12-15" });
      assert.equal(month.seqNo, 1); assert.equal(month.letterNumber, "L.001/CON/AP.2137/XII/2026");
      const year = await svc.updateConsolidatedLetter(first.id, { letterDate: "2027-02-01" });
      assert.equal(year.seqNo, 2); assert.equal(year.letterNumber, "L.002/CON/AP.2137/II/2027");
      await pool.query("UPDATE settings SET numbering_prefix='AP.2137'");
    });
    await check("highest hard-deleted number is not reused, void still advances sequence", async () => {
      const highest = await create("2029-01-01"); await pool.query("DELETE FROM letters WHERE id=$1", [highest.id]);
      const next = await create("2029-01-01", { status: "VOID" }); assert.equal(next.seqNo, 2);
      assert.equal((await create("2029-01-01")).seqNo, 3);
    });
    await check("missing/invalid/inactive clients and opinions do not consume counters", async () => {
      for (const extra of [{ clientId: "missing" }, { clientId: "inactive" }, { clientId: "" }, { opinionDate: "2026-02-30" }, { opinionNumber: " " }]) {
        await assert.rejects(create("2030-01-01", extra));
      }
      assert.equal(Number((await pool.query("SELECT count(*) AS n FROM consolidated_letter_counters WHERE year=2030")).rows[0].n), 0);
      assert.equal((await create("2030-01-01")).seqNo, 1);
    });
    await check("insert failure rolls back sequence increment", async () => {
      await pool.query("CREATE FUNCTION fail_con_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test-only failure'; END $$; CREATE TRIGGER fail_con_test BEFORE INSERT ON letters FOR EACH ROW EXECUTE FUNCTION fail_con_test()");
      await assert.rejects(create("2031-01-01"));
      await pool.query("DROP TRIGGER fail_con_test ON letters; DROP FUNCTION fail_con_test()");
      assert.equal((await create("2031-01-01")).seqNo, 1);
    });
    await check("same inactive existing client can edit; switching to inactive client forbidden", async () => {
      const row = await create(); await pool.query("UPDATE clients SET is_active=false WHERE id='c1'");
      assert.equal((await svc.updateConsolidatedLetter(row.id, { notes: "still editable" })).notes, "still editable");
      await assert.rejects(svc.updateConsolidatedLetter(row.id, { clientId: "inactive" }));
      assert.equal((await svc.updateConsolidatedLetter(row.id, { clientId: "c2" })).clientId, "c2");
      await pool.query("UPDATE clients SET is_active=true WHERE id='c1'");
    });
    await check("manual numbering/type spoof blocked and legacy records unchanged", async () => {
      await assert.rejects(svc.updateConsolidatedLetter(first.id, { seqNo: 999 }));
      await assert.rejects(svc.updateConsolidatedLetter(first.id, { letterNumber: "manual" }));
      await assert.rejects(svc.updateConsolidatedLetter(first.id, { letterType: "UMUM" }));
      await assert.rejects(svc.updateConsolidatedLetter("old-general", { notes: "no" }));
      assert.deepEqual((await pool.query("SELECT * FROM letters WHERE id IN ('old-general','old-hr') ORDER BY id")).rows, legacy);
      assert.equal(legacy[0].opinion_date, null); assert.equal(legacy[0].opinion_number, null);
    });
    await check("independent counters leave invoice/OPE and business tables untouched", async () => {
      for (const table of ["document_number_counters", "invoices", "ope_documents", "contracts", "termins", "overtime_requests"]) {
        assert.equal(Number((await pool.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n), 0);
      }
    });
    console.log(`SUCCESS: ${passed} PostgreSQL integration scenarios. Existing databases not accessed.`);
  } finally {
    await pool.end();
    if (started) command("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
    console.log(`Disposable test artifacts retained at ${root}`);
  }
}
main().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
