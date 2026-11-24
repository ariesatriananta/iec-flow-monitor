import test from "node:test";
import assert from "node:assert/strict";
import { fetchOpeDocuments } from "../api/ope";

test("API helper sends combined Meals/Transport group with search, status and pagination", async (t) => {
  t.mock.method(globalThis, "fetch", async (input: string, options?: RequestInit) => {
    const url = new URL(input, "http://localhost");
    assert.equal(url.pathname, "/api/ope");
    assert.equal(url.searchParams.get("group"), "MEALS_TRANSPORT");
    assert.equal(url.searchParams.has("type"), false);
    assert.equal(url.searchParams.get("q"), "PT Contoh & Rekan");
    assert.equal(url.searchParams.get("status"), "NON_VOID");
    assert.equal(url.searchParams.get("offset"), "25");
    assert.equal(options?.cache, "no-store");
    return Response.json({ items: [], total: 0, limit: 25, offset: 25 });
  });
  assert.deepEqual(await fetchOpeDocuments({ group: "MEALS_TRANSPORT", q: "PT Contoh & Rekan", status: "NON_VOID", limit: 25, offset: 25 }), {
    items: [], total: 0, limit: 25, offset: 25,
  });
});

test("API helper preserves exact Meals and Transport type filters", async (t) => {
  for (const type of ["MEALS", "TRANSPORT"] as const) {
    const mock = t.mock.method(globalThis, "fetch", async (input: string) => {
      const url = new URL(input, "http://localhost");
      assert.equal(url.searchParams.get("type"), type);
      assert.equal(url.searchParams.has("group"), false);
      return Response.json({ items: [], total: 0, limit: 25, offset: 0 });
    });
    await fetchOpeDocuments({ type });
    mock.mock.restore();
  }
});
