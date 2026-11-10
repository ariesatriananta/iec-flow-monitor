export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/server";
import { opeErrorResponse } from "@/lib/ope/http";
import { getOpeClientOptions } from "@/lib/ope/service";

export async function GET() {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  try { return NextResponse.json(await getOpeClientOptions()); }
  catch (error) { return opeErrorResponse(error); }
}
