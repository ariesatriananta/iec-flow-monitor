import assert from "node:assert/strict";
import test from "node:test";
import { calculateOpeTotals, canTransitionOpe, generateOpeNumber, MAX_OPE_AMOUNT, opeInputSchema } from "./validation";

const meals = {
  type: "MEALS", documentDate: "2026-11-10", subject: "Biaya konsumsi",
  items: [{ expenseDate: "2026-11-09", clientId: "client-1", description: "Makan siang", amount: 100_000 }],
};

test("OPE default taxes are off and detail determines subtotal", () => {
  const input = opeInputSchema.parse(meals);
  assert.equal(input.usePpn, false);
  assert.equal(input.usePph23, false);
  assert.deepEqual(calculateOpeTotals([100_000, 50_000], input.usePpn, input.usePph23), {
    subtotal: "150000", ppnAmount: "0", pph23Amount: "0", total: "150000", ppnRate: "0.00", pph23Rate: "0.00",
  });
});

test("PPN adds 11 percent and PPh23 subtracts 2 percent of subtotal", () => {
  assert.equal(calculateOpeTotals([1_000_000], true, true).total, "1090000");
  assert.equal(calculateOpeTotals([1_000_000], false, true).total, "980000");
  assert.equal(calculateOpeTotals([1_000_000], true, false).total, "1110000");
});

test("fractional tax amounts round to whole rupiah without floating point errors", () => {
  const result = calculateOpeTotals([25], true, true);
  assert.equal(result.ppnAmount, "3");
  assert.equal(result.pph23Amount, "1");
  assert.equal(result.total, "27");
});

test("negative, zero, fractional, unsafe and overflowing amounts fail", () => {
  for (const amount of [-1, 0, 1.5, Infinity, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => calculateOpeTotals([amount], false, false));
  }
  assert.throws(() => calculateOpeTotals([MAX_OPE_AMOUNT, 1], false, false));
  assert.throws(() => calculateOpeTotals([MAX_OPE_AMOUNT], true, false));
  assert.throws(() => calculateOpeTotals([], false, false));
});

test("large integer tax calculation stays exact", () => {
  const subtotal = 900_000_000_000_005;
  assert.equal(calculateOpeTotals([subtotal], false, true).pph23Amount, "18000000000000");
});

test("meals supports multiple clients and rejects missing detail identity", () => {
  assert.equal(opeInputSchema.parse({ ...meals, items: [...meals.items, { ...meals.items[0], clientId: "client-2" }] }).items.length, 2);
  assert.equal(opeInputSchema.safeParse({ ...meals, items: [{ ...meals.items[0], clientId: "" }] }).success, false);
  assert.equal(opeInputSchema.safeParse({ ...meals, items: [] }).success, false);
  assert.equal(opeInputSchema.safeParse({ ...meals, usePpn: "false" }).success, false);
});

test("business trip requires header client, employee and positive integer days", () => {
  const trip = { ...meals, type: "BUSINESS_TRIP", clientId: "client-1", items: [{ employeeId: "employee-1", days: 2, rate: 150_000 }] };
  assert.equal(opeInputSchema.safeParse(trip).success, true);
  assert.equal(opeInputSchema.safeParse({ ...trip, clientId: "" }).success, false);
  for (const days of [0, -1, 1.5, true]) {
    assert.equal(opeInputSchema.safeParse({ ...trip, items: [{ ...trip.items[0], days }] }).success, false);
  }
});

test("invalid calendar dates are rejected", () => {
  for (const documentDate of ["2026-02-30", "2026-13-01", "yesterday", ""]) {
    assert.equal(opeInputSchema.safeParse({ ...meals, documentDate }).success, false);
  }
});

test("ISO local midnight uses Jakarta calendar year and date-only stays unchanged", () => {
  const input = opeInputSchema.parse({ ...meals, documentDate: "2026-12-31T17:00:00.000Z" });
  assert.equal(input.documentDate.toISOString(), "2027-01-01T00:00:00.000Z");
  assert.equal(input.documentDate.getUTCFullYear(), 2027);
  const dateOnly = opeInputSchema.parse({ ...meals, documentDate: "2027-01-01" });
  assert.equal(dateOnly.documentDate.toISOString(), input.documentDate.toISOString());
  const offset = opeInputSchema.parse({ ...meals, documentDate: "2027-01-01T00:00:00+07:00" });
  assert.equal(offset.documentDate.toISOString(), input.documentDate.toISOString());
});

test("only draft issuance/void and issued payment/void transitions are permitted", () => {
  const allowed = new Set(["DRAFT:ISSUED", "DRAFT:VOID", "ISSUED:PAID", "ISSUED:VOID"]);
  for (const from of ["DRAFT", "ISSUED", "PAID", "VOID"]) {
    for (const to of ["DRAFT", "ISSUED", "PAID", "VOID"]) {
      assert.equal(canTransitionOpe(from, to), allowed.has(`${from}:${to}`));
    }
  }
});

test("OPE numbering separates document types and year", () => {
  assert.equal(generateOpeNumber("BUSINESS_TRIP", 2026, 1), "OPE/BT/2026/0001");
  assert.equal(generateOpeNumber("MEALS", 2026, 1), "OPE/ML/2026/0001");
  assert.equal(generateOpeNumber("MEALS", 2027, 10000), "OPE/ML/2027/10000");
});
