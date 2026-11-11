import { NextResponse } from "next/server";
import { z } from "zod";
import { OvertimeError } from "./validation";

export function overtimeErrorResponse(error: unknown) {
  if (error instanceof OvertimeError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; ") }, { status: 400 });
  if (error instanceof SyntaxError) return NextResponse.json({ error: "Body JSON tidak valid" }, { status: 400 });
  console.error("Overtime API error:", error);
  return NextResponse.json({ error: "Pengajuan lembur gagal diproses. Coba lagi beberapa saat" }, { status: 500 });
}
