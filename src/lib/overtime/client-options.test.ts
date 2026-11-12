import test from "node:test";
import assert from "node:assert/strict";
import { fetchOvertimeClientOptions } from "../api/overtime";

test("client options reads the API items envelope and preserves order and dates", async (t) => {
  const items = [
    { id: "newest", name: "Client Terbaru", code: "NEW", latestContractCreatedAt: "2026-11-12T01:00:00.000Z" },
    { id: "older", name: "Client Lama", code: "OLD", latestContractCreatedAt: "2026-10-01T01:00:00.000Z" },
  ];
  t.mock.method(globalThis, "fetch", async (url: string, options?: RequestInit) => {
    assert.equal(url, "/api/overtime/client-options");
    assert.equal(options?.cache, "no-store");
    return Response.json({ items });
  });

  assert.deepEqual(await fetchOvertimeClientOptions(), items.map(row => ({
    ...row, latestContractCreatedAt: new Date(row.latestContractCreatedAt),
  })));
});

test("client options accepts an empty items array", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ items: [] }));
  assert.deepEqual(await fetchOvertimeClientOptions(), []);
});

test("client options rejects malformed success responses with a readable error", async (t) => {
  for (const body of [null, [], {}, { items: {} }]) {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => Response.json(body));
    await assert.rejects(fetchOvertimeClientOptions(), /Format data client tidak valid/);
    fetchMock.mock.restore();
  }
});

test("client options does not treat an HTTP failure as an empty client list", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ error: "Akun belum terhubung ke karyawan" }, { status: 403 }));
  await assert.rejects(fetchOvertimeClientOptions(), /Akun belum terhubung ke karyawan/);
});
