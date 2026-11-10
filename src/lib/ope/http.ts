import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { OpeError } from "./validation";

export function opeErrorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Data OPE tidak valid", details: error.flatten() }, { status: 400 });
  }
  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: "Body JSON tidak valid" }, { status: 400 });
  }
  if (error instanceof OpeError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("OPE request failed:", error);
  return NextResponse.json({ error: "Gagal memproses dokumen OPE" }, { status: 500 });
}
