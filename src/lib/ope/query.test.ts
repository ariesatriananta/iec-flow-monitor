import test from "node:test";
import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import { opeListWhere, opeQuerySchema } from "./query";

const dialect = new PgDialect();

test("Non-Void excludes VOID before pagination for both OPE tabs", () => {
  for (const type of ["BUSINESS_TRIP", "MEALS"]) {
    const params = opeQuerySchema.parse({ type, status: "NON_VOID", limit: "25", offset: "25" });
    const compiled = dialect.sqlToQuery(opeListWhere(params)!);
    assert.deepEqual(compiled.params, [type, "VOID"]);
    assert.match(compiled.sql, /"status" <>/);
    assert.match(compiled.sql, / and /);
    assert.equal(params.offset, 25);
  }
});

test("explicit status filters still select exactly the requested status", () => {
  for (const status of ["DRAFT", "ISSUED", "PAID", "VOID"]) {
    const compiled = dialect.sqlToQuery(opeListWhere(opeQuerySchema.parse({ status }))!);
    assert.deepEqual(compiled.params, [status]);
    assert.match(compiled.sql, /"status" =/);
  }
});

test("all statuses retains existing API behavior when status is omitted", () => {
  assert.equal(opeListWhere(opeQuerySchema.parse({})), undefined);
  const compiled = dialect.sqlToQuery(opeListWhere(opeQuerySchema.parse({ type: "MEALS" }))!);
  assert.deepEqual(compiled.params, ["MEALS"]);
  assert.doesNotMatch(compiled.sql, /"status"/);
});

test("invalid statuses and pagination remain rejected", () => {
  for (const params of [{ status: "UNKNOWN" }, { limit: 101 }, { offset: -1 }]) {
    assert.equal(opeQuerySchema.safeParse(params).success, false);
  }
});

test("search covers number, subject, header client and correlated Meals item clients", () => {
  const compiled = dialect.sqlToQuery(opeListWhere(opeQuerySchema.parse({ type: "MEALS", status: "NON_VOID", q: "  Contoh  " }))!);
  assert.deepEqual(compiled.params, ["MEALS", "VOID", "%Contoh%", "%Contoh%", "%Contoh%", "MEALS", "%Contoh%"]);
  assert.match(compiled.sql, /"document_number" ilike/);
  assert.match(compiled.sql, /"subject" ilike/);
  assert.match(compiled.sql, /"ope_documents"\."client_snapshot"->>'name' ilike/);
  assert.match(compiled.sql, /exists \(/);
  assert.match(compiled.sql, /"ope_items"\."document_id" = "ope_documents"\."id"/);
  assert.match(compiled.sql, /"ope_items"\."client_snapshot"->>'name' ilike/);
  assert.doesNotMatch(compiled.sql, /Contoh/);
});

test("blank search preserves existing filters, search is bounded and wildcard characters are literal", () => {
  assert.equal(opeListWhere(opeQuerySchema.parse({ q: "   " })), undefined);
  assert.equal(opeQuerySchema.safeParse({ q: "x".repeat(201) }).success, false);
  const compiled = dialect.sqlToQuery(opeListWhere(opeQuerySchema.parse({ q: "50%_\\test" }))!);
  assert.equal(compiled.params[0], "%50\\%\\_\\\\test%");
});
