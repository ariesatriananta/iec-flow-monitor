export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { contracts, termins } from "@/lib/db/schema";
import { getJakartaMonthYear } from "@/lib/numbering";

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

const toNumber = (value: string | number | null) => {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : Number(value);
};

const getJakartaDate = (date: Date) =>
  new Date(date.toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));

export async function GET() {
  const db = getDb();
  const jakartaNow = getJakartaDate(new Date());
  const currentYear = jakartaNow.getFullYear();
  const months: Array<{
    key: string;
    month: string;
    contracts: number;
    payments: number;
  }> = [];

  for (let month = 1; month <= 12; month += 1) {
    months.push({
      key: `${currentYear}-${month}`,
      month: MONTH_LABELS[month - 1] ?? "",
      contracts: 0,
      payments: 0,
    });
  }

  const monthMap = new Map(months.map((item) => [item.key, item]));

  const contractRows = await db
    .select({ proposalDate: contracts.proposalDate })
    .from(contracts);

  for (const contract of contractRows) {
    const { month, year } = getJakartaMonthYear(new Date(contract.proposalDate));
    const key = `${year}-${month}`;
    const bucket = monthMap.get(key);
    if (bucket) bucket.contracts += 1;
  }

  const terminRows = await db
    .select({
      terminAmount: termins.terminAmount,
      paymentReceivedDate: termins.paymentReceivedDate,
      updatedAt: termins.updatedAt,
      createdAt: termins.createdAt,
    })
    .from(termins)
    .where(eq(termins.status, "PAID"));

  for (const termin of terminRows) {
    const paymentDate =
      termin.paymentReceivedDate ?? termin.updatedAt ?? termin.createdAt;
    const { month, year } = getJakartaMonthYear(new Date(paymentDate));
    const key = `${year}-${month}`;
    const bucket = monthMap.get(key);
    if (bucket) {
      bucket.payments += toNumber(termin.terminAmount);
    }
  }

  return NextResponse.json(months);
}
