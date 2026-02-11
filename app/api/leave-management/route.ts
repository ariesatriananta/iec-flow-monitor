export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { leaveRequests, users } from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/server";

export async function GET(request: Request) {
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  const status = new URL(request.url).searchParams.get("status");
  const conditions = [];

  if (auth.user.role !== "ADMIN") {
    conditions.push(eq(leaveRequests.userId, auth.user.id));
  }
  if (status) {
    conditions.push(eq(leaveRequests.status, status));
  }

  const db = getDb();
  const baseQuery = db
    .select({ request: leaveRequests, user: users })
    .from(leaveRequests)
    .leftJoin(users, eq(leaveRequests.userId, users.id));
  const rows =
    conditions.length > 0
      ? await baseQuery.where(and(...conditions))
      : await baseQuery;

  return NextResponse.json(
    rows.map(({ request, user }) => ({
      ...request,
      user: user
        ? {
            id: user.id,
            username: user.username,
            name: user.name,
            role: user.role,
          }
        : undefined,
    }))
  );
}

export async function POST(request: Request) {
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  const body = await request.json();
  if (!body?.leaveType || !body?.reason || !body?.startDate || !body?.endDate) {
    return NextResponse.json(
      { error: "Data pengajuan cuti belum lengkap" },
      { status: 400 }
    );
  }

  const startDate = new Date(body.startDate);
  const endDate = new Date(body.endDate);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) {
    return NextResponse.json(
      { error: "Rentang tanggal cuti tidak valid" },
      { status: 400 }
    );
  }

  const targetUserId =
    auth.user.role === "ADMIN" && body?.userId ? body.userId : auth.user.id;

  const now = new Date();
  const db = getDb();
  const [created] = await db
    .insert(leaveRequests)
    .values({
      id: crypto.randomUUID(),
      userId: targetUserId,
      leaveType: body.leaveType,
      reason: body.reason,
      startDate,
      endDate,
      status: "SUBMITTED",
      adminNote: null,
      approvedBy: null,
      approvedAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
