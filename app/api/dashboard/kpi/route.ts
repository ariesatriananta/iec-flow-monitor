export const dynamic = "force-dynamic"

import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { contracts, termins } from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/server";

const toNumber = (value: string | number | null) => {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : Number(value);
};

export async function GET() {
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  if (auth.user.role !== "ADMIN") {
    return NextResponse.json({
      totalContracts: 0,
      totalContractValue: 0,
      totalPaymentReceived: 0,
      pendingPayments: 0,
    });
  }

  const db = getDb();
  const activeContracts = await db
    .select()
    .from(contracts)
    .where(eq(contracts.status, "ACTIVE"));

  const paidTermins = await db
    .select()
    .from(termins)
    .where(eq(termins.status, "PAID"));

  const pendingTermins = await db
    .select()
    .from(termins)
    .where(inArray(termins.status, ["PENDING", "INVOICED"]));

  const totalContractValue = activeContracts.reduce(
    (sum, c) => sum + toNumber(c.contractValue),
    0
  );
  const totalPaymentReceived = paidTermins.reduce(
    (sum, t) => sum + toNumber(t.terminAmount),
    0
  );
  const pendingPayments = pendingTermins.reduce(
    (sum, t) => sum + toNumber(t.terminAmount),
    0
  );

  return NextResponse.json({
    totalContracts: activeContracts.length,
    totalContractValue,
    totalPaymentReceived,
    pendingPayments,
  });
}
