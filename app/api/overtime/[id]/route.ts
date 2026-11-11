export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/server";
import { decideOvertime, getOvertime } from "@/lib/overtime/server";
import { decisionSchema } from "@/lib/overtime/validation";
import { overtimeErrorResponse } from "@/lib/overtime/http";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  try { return NextResponse.json(await getOvertime(auth.user, params.id)); }
  catch (error) { return overtimeErrorResponse(error); }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  try {
    return NextResponse.json(await decideOvertime(auth.user, params.id, decisionSchema.parse(await request.json())));
  } catch (error) { return overtimeErrorResponse(error); }
}

export const PUT = PATCH;
