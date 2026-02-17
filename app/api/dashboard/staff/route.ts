export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  attendanceRecords,
  businessTrips,
  leaveRequests,
  reimbursements,
} from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/server";
import { getJakartaDayStart } from "@/lib/hr/time";

export async function GET() {
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  if (auth.user.role === "ADMIN") {
    return NextResponse.json(
      { error: "Endpoint ini hanya untuk role STAFF" },
      { status: 403 }
    );
  }

  if (!auth.user.employeeId) {
    return NextResponse.json(
      { error: "Akun belum terhubung ke employee" },
      { status: 403 }
    );
  }

  const db = getDb();
  const employeeId = auth.user.employeeId;
  const today = getJakartaDayStart(new Date());

  const [
    todayAttendanceRows,
    leaveCountRows,
    tripCountRows,
    reimbursementCountRows,
    recentLeaves,
    recentTrips,
    recentReimbursements,
  ] = await Promise.all([
    db
      .select()
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.employeeId, employeeId),
          eq(attendanceRecords.attendanceDate, today)
        )
      )
      .orderBy(desc(attendanceRecords.updatedAt))
      .limit(1),
    db
      .select({ count: sql<string>`count(*)` })
      .from(leaveRequests)
      .where(
        and(
          eq(leaveRequests.employeeId, employeeId),
          eq(leaveRequests.status, "SUBMITTED")
        )
      ),
    db
      .select({ count: sql<string>`count(*)` })
      .from(businessTrips)
      .where(
        and(
          eq(businessTrips.employeeId, employeeId),
          eq(businessTrips.status, "SUBMITTED")
        )
      ),
    db
      .select({ count: sql<string>`count(*)` })
      .from(reimbursements)
      .where(
        and(
          eq(reimbursements.employeeId, employeeId),
          eq(reimbursements.status, "SUBMITTED")
        )
      ),
    db
      .select()
      .from(leaveRequests)
      .where(eq(leaveRequests.employeeId, employeeId))
      .orderBy(desc(leaveRequests.createdAt))
      .limit(5),
    db
      .select()
      .from(businessTrips)
      .where(eq(businessTrips.employeeId, employeeId))
      .orderBy(desc(businessTrips.createdAt))
      .limit(5),
    db
      .select()
      .from(reimbursements)
      .where(eq(reimbursements.employeeId, employeeId))
      .orderBy(desc(reimbursements.createdAt))
      .limit(5),
  ]);

  return NextResponse.json({
    todayAttendance: todayAttendanceRows[0] ?? null,
    counts: {
      leaveSubmitted: Number(leaveCountRows[0]?.count ?? 0),
      tripSubmitted: Number(tripCountRows[0]?.count ?? 0),
      reimbursementSubmitted: Number(reimbursementCountRows[0]?.count ?? 0),
    },
    recents: {
      leaves: recentLeaves,
      trips: recentTrips.map((trip) => ({
        ...trip,
        compensationBreakdown: (() => {
          if (!trip.compensationBreakdownJson) return null;
          try {
            return JSON.parse(trip.compensationBreakdownJson);
          } catch {
            return null;
          }
        })(),
      })),
      reimbursements: recentReimbursements,
    },
  });
}

