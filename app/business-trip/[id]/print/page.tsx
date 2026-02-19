import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import {
  businessTrips,
  employees,
  settingsApprovalFlow,
  users,
} from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/server";
import { formatCurrency, formatDate } from "@/lib/numbering";
import { calculateInclusiveDays } from "@/lib/business-trip-allowance";
import { PrintToolbar } from "./PrintToolbar";

type PageProps = {
  params: {
    id: string;
  };
};

const canStaffViewTrip = (params: {
  userEmployeeId: string | null;
  tripEmployeeId: string;
  tripStatus: string;
  level1EmployeeId: string | null;
  level2EmployeeId: string | null;
  approvalLevels: number;
}) => {
  const {
    userEmployeeId,
    tripEmployeeId,
    tripStatus,
    level1EmployeeId,
    level2EmployeeId,
    approvalLevels,
  } = params;

  if (!userEmployeeId) return false;
  if (tripEmployeeId === userEmployeeId) return true;
  if (tripStatus === "SUBMITTED" && level1EmployeeId === userEmployeeId) return true;
  if (
    tripStatus === "WAITING_LEVEL_2" &&
    approvalLevels === 2 &&
    level2EmployeeId === userEmployeeId
  ) {
    return true;
  }
  return false;
};

export default async function BusinessTripPrintPage({ params }: PageProps) {
  const auth = await requireSessionUser();
  if ("response" in auth && auth.response) {
    if (auth.response.status === 401) {
      redirect("/login");
    }
    return (
      <main className="p-8">
        <p className="text-sm text-destructive">
          Gagal membuka form cetak. Silakan coba lagi.
        </p>
      </main>
    );
  }

  const db = getDb();
  const [row] = await db
    .select({
      trip: businessTrips,
      employee: employees,
      requesterUser: users,
    })
    .from(businessTrips)
    .leftJoin(employees, eq(businessTrips.employeeId, employees.id))
    .leftJoin(users, eq(users.employeeId, employees.id))
    .where(eq(businessTrips.id, params.id))
    .limit(1);

  if (!row) {
    notFound();
  }

  const [approvalFlow] = await db.select().from(settingsApprovalFlow).limit(1);
  const approvalLevels = approvalFlow?.businessTripApprovalLevels ?? 2;
  const level1EmployeeId = approvalFlow?.businessTripApproverLevel1EmployeeId ?? null;
  const level2EmployeeId = approvalFlow?.businessTripApproverLevel2EmployeeId ?? null;

  if (auth.user.role !== "ADMIN") {
    const allowed = canStaffViewTrip({
      userEmployeeId: auth.user.employeeId,
      tripEmployeeId: row.trip.employeeId,
      tripStatus: row.trip.status,
      level1EmployeeId,
      level2EmployeeId,
      approvalLevels,
    });
    if (!allowed) {
      redirect("/dashboard");
    }
  }

  const [approvedByUser] = row.trip.approvedBy
    ? await db
        .select({
          user: users,
          employee: employees,
        })
        .from(users)
        .leftJoin(employees, eq(users.employeeId, employees.id))
        .where(eq(users.id, row.trip.approvedBy))
        .limit(1)
    : [];

  const finalApproverLabel =
    approvedByUser?.employee?.fullName ??
    approvedByUser?.user?.name ??
    (approvalLevels === 2 ? "Approver Level 2" : "Approver Level 1");

  const finalApproverTitle =
    approvedByUser?.employee?.title ??
    (approvalLevels === 2 ? "Final Approver L2" : "Final Approver L1");

  const compensation = (() => {
    if (!row.trip.compensationBreakdownJson) return null;
    try {
      const parsed = JSON.parse(row.trip.compensationBreakdownJson) as {
        ope: { daily: number; days: number; total: number };
        meal: { daily: number; days: number; total: number };
        laundry: { amount?: number; weekly?: number; weeks: number; minDays: number; total: number };
        transport: { label: string | null; amount: number };
        total: number;
      };
      return {
        ...parsed,
        laundry: {
          ...parsed.laundry,
          amount:
            typeof parsed.laundry.amount === "number"
              ? parsed.laundry.amount
              : Number(parsed.laundry.weekly ?? 0),
        },
      };
    } catch {
      return null;
    }
  })();

  const numberOfDays =
    row.trip.allowanceDays ??
    calculateInclusiveDays(new Date(row.trip.startDate), new Date(row.trip.endDate));

  return (
    <main className="min-h-screen bg-white p-4 text-black md:p-8">
      <style>{`
        @page { size: A4; margin: 14mm; }
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
        }
      `}</style>

      <PrintToolbar />

      <section className="mx-auto w-full max-w-[850px] border border-black px-6 py-5">
        <h1 className="text-center text-xl font-bold tracking-wide">FORM BUSINESS TRIP</h1>

        <div className="mt-6 grid grid-cols-[220px_20px_1fr] gap-y-2 text-sm">
          <p>Client</p>
          <p>:</p>
          <p>{row.trip.companyName}</p>

          <p>Period</p>
          <p>:</p>
          <p>
            {formatDate(new Date(row.trip.startDate))} - {formatDate(new Date(row.trip.endDate))}
          </p>

          <p>Location</p>
          <p>:</p>
          <p>{row.trip.destinationCity}</p>

          <p>Date of Assignment</p>
          <p>:</p>
          <p>
            {formatDate(new Date(row.trip.createdAt))}
            {row.trip.approvedAt
              ? ` (Approved: ${formatDate(new Date(row.trip.approvedAt))})`
              : " (Belum approved)"}
          </p>
        </div>

        <hr className="my-4 border-black" />

        <div className="grid grid-cols-[220px_20px_1fr] gap-y-2 text-sm">
          <p>Name</p>
          <p>:</p>
          <p>{row.employee?.fullName ?? row.requesterUser?.name ?? "-"}</p>

          <p>Title - Department</p>
          <p>:</p>
          <p>{row.employee?.title ?? "-"} - {row.employee?.department ?? "-"}</p>

          <p>Number of Days</p>
          <p>:</p>
          <p>{numberOfDays} days</p>

          <p>Purpose</p>
          <p>:</p>
          <p>{row.trip.purpose ?? "-"}</p>
        </div>

        <div className="mt-4 rounded border border-black p-3 text-sm">
          <p className="mb-2 font-semibold">Compensation</p>
          {compensation ? (
            <div className="space-y-1">
              <p>
                OPE: {formatCurrency(Number(compensation.ope.daily))} x{" "}
                {Number(compensation.ope.days)} hari ={" "}
                {formatCurrency(Number(compensation.ope.total))}
              </p>
              <p>
                Makan: {formatCurrency(Number(compensation.meal.daily))} x{" "}
                {Number(compensation.meal.days)} hari ={" "}
                {formatCurrency(Number(compensation.meal.total))}
              </p>
              <p>
                Laundry: {formatCurrency(Number(compensation.laundry.amount))} (flat 1x/trip, aktif jika durasi {" > "}{" "}
                {Number(compensation.laundry.minDays)} hari) ={" "}
                {formatCurrency(Number(compensation.laundry.total))}
              </p>
              <p>
                Transport PP ({compensation.transport.label ?? "-"}):{" "}
                {formatCurrency(Number(compensation.transport.amount))}
              </p>
              <p className="pt-1 font-semibold">
                Total: {formatCurrency(Number(compensation.total))}
              </p>
            </div>
          ) : (
            <p>-</p>
          )}
        </div>

        <div className="mt-4 rounded border border-black p-3 text-sm">
          <p className="mb-2 font-semibold">Please transfer your payment to account:</p>
          <div className="grid grid-cols-[220px_20px_1fr] gap-y-2">
            <p>Name</p>
            <p>:</p>
            <p>{row.employee?.fullName ?? "-"}</p>
            <p>Bank</p>
            <p>:</p>
            <p>{row.employee?.bankAccountName ?? "-"}</p>
            <p>A/C</p>
            <p>:</p>
            <p>{row.employee?.bankAccountNumber ?? "-"}</p>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-8 text-center text-sm">
          <div>
            <p className="font-semibold">Submitted by,</p>
            <div className="h-20" />
            <p>({row.employee?.fullName ?? row.requesterUser?.name ?? "-"})</p>
          </div>
          <div>
            <p className="font-semibold">Approved by,</p>
            <div className="h-20" />
            <p>({finalApproverLabel})</p>
            <p className="text-xs text-gray-600">{finalApproverTitle}</p>
          </div>
        </div>
      </section>
    </main>
  );
}
