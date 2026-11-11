export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/server";
import { createOvertime, listOvertime } from "@/lib/overtime/server";
import { createOvertimeSchema, listOvertimeSchema } from "@/lib/overtime/validation";
import { overtimeErrorResponse } from "@/lib/overtime/http";

export async function GET(request: Request) {
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  try {
    const query = listOvertimeSchema.parse(Object.fromEntries(new URL(request.url).searchParams.entries()));
    return NextResponse.json(await listOvertime(auth.user, query));
  } catch (error) { return overtimeErrorResponse(error); }
}

export async function POST(request: Request) {
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  try {
    const input = createOvertimeSchema.parse(await request.json());
    return NextResponse.json(await createOvertime(auth.user, input), { status: 201 });
  } catch (error) { return overtimeErrorResponse(error); }
}
