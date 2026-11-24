import test from "node:test";
import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import { opeListWhere, opeQuerySchema } from "./query";

const dialect = new PgDialect();

test("Non-Void excludes VOID before pagination for both OPE tabs", () => {
  for (const type of ["BUSINESS_TRIP", "MEALS", "TRANSPORT"]) {
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

test("search covers number, subject, header client and correlated Meals/Transport item clients", () => {
  const compiled = dialect.sqlToQuery(opeListWhere(opeQuerySchema.parse({ type: "MEALS", status: "NON_VOID", q: "  Contoh  " }))!);
  assert.deepEqual(compiled.params, ["MEALS", "VOID", "%Contoh%", "%Contoh%", "%Contoh%", "MEALS", "TRANSPORT", "%Contoh%"]);
  assert.match(compiled.sql, /"document_number" ilike/);
  assert.match(compiled.sql, /"subject" ilike/);
  assert.match(compiled.sql, /"ope_documents"\."client_snapshot"->>'name' ilike/);
  assert.match(compiled.sql, /exists \(/);
  assert.match(compiled.sql, /"ope_items"\."document_id" = "ope_documents"\."id"/);
  assert.match(compiled.sql, /"ope_items"\."client_snapshot"->>'name' ilike/);
  assert.doesNotMatch(compiled.sql, /Contoh/);
});

test("combined expense group includes Meals and Transport but not Business Trip", () => {
  const params = opeQuerySchema.parse({ group: "MEALS_TRANSPORT", status: "NON_VOID", offset: "25" });
  const compiled = dialect.sqlToQuery(opeListWhere(params)!);
  assert.deepEqual(compiled.params, ["MEALS", "TRANSPORT", "VOID"]);
  assert.match(compiled.sql, /"type" in \(/);
  assert.match(compiled.sql, /"status" <>/);
  assert.equal(params.offset, 25);
});

test("exact Transport type filter is supported without broadening legacy Meals filter", () => {
  for (const type of ["MEALS", "TRANSPORT"]) {
    const compiled = dialect.sqlToQuery(opeListWhere(opeQuerySchema.parse({ type }))!);
    assert.deepEqual(compiled.params, [type]);
    assert.match(compiled.sql, /"type" =/);
    assert.doesNotMatch(compiled.sql, / in \(/);
  }
});

test("unknown groups/types and ambiguous type plus group filters are rejected", () => {
  for (const params of [
    { group: "ALL" }, { type: "UNKNOWN" },
    ...["BUSINESS_TRIP", "MEALS", "TRANSPORT"].map((type) => ({ type, group: "MEALS_TRANSPORT" })),
  ]) {
    assert.equal(opeQuerySchema.safeParse(params).success, false);
  }
});

test("combined search preserves group/status and uses a correlated EXISTS without joining items", () => {
  const compiled = dialect.sqlToQuery(opeListWhere(opeQuerySchema.parse({ group: "MEALS_TRANSPORT", status: "NON_VOID", q: "Client" }))!);
  assert.deepEqual(compiled.params, ["MEALS", "TRANSPORT", "VOID", "%Client%", "%Client%", "%Client%", "MEALS", "TRANSPORT", "%Client%"]);
  assert.match(compiled.sql, /exists \(/);
  assert.match(compiled.sql, /"ope_items"\."document_id" = "ope_documents"\."id"/);
  assert.doesNotMatch(compiled.sql, /join/i);
});

test("blank search preserves existing filters, search is bounded and wildcard characters are literal", () => {
  assert.equal(opeListWhere(opeQuerySchema.parse({ q: "   " })), undefined);
  assert.equal(opeQuerySchema.safeParse({ q: "x".repeat(201) }).success, false);
  const compiled = dialect.sqlToQuery(opeListWhere(opeQuerySchema.parse({ q: "50%_\\test" }))!);
  assert.equal(compiled.params[0], "%50\\%\\_\\\\test%");
});
