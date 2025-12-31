export const dynamic = "force-dynamic"

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { settings } from "@/lib/db/schema";

export async function GET() {
  const db = getDb();
  const [row] = await db.select().from(settings).limit(1);
  return NextResponse.json(row ?? null);
}

export async function PUT(request: Request) {
  const body = await request.json();

  if (!body) {
    return NextResponse.json(
      { error: "Data settings kosong" },
      { status: 400 }
    );
  }

  const now = new Date();
  const db = getDb();
  const [updated] = await db
    .update(settings)
    .set({
      companyName: body.companyName,
      companyAddress: body.companyAddress ?? null,
      companyPhone: body.companyPhone ?? null,
      companyEmail: body.companyEmail ?? null,
      companyLogoUrl: body.companyLogoUrl ?? null,
      numberingPrefix: body.numberingPrefix,
      numberingReset: body.numberingReset,
      defaultPpnRate: body.defaultPpnRate?.toString?.() ?? body.defaultPpnRate,
      defaultSignerName: body.defaultSignerName,
      updatedAt: now,
    })
    .where(eq(settings.id, "default"))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Settings tidak ditemukan" }, { status: 404 });
  }

  return NextResponse.json(updated);
}
