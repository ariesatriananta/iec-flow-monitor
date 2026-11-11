export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/server";
import { listClientOptions } from "@/lib/overtime/server";
import { overtimeErrorResponse } from "@/lib/overtime/http";

export async function GET() {
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  if (!auth.user.employeeId) return NextResponse.json({ error: "Akun belum terhubung ke karyawan" }, { status: 403 });
  try { return NextResponse.json({ items: await listClientOptions() }); }
  catch (error) { return overtimeErrorResponse(error); }
}
