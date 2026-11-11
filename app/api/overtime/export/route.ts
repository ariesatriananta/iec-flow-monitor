export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import * as XLSX from "xlsx";
import { requireAdmin } from "@/lib/auth/server";
import { recordAuditLog } from "@/lib/audit-log";
import { loadOvertimeExport } from "@/lib/overtime/export-server";
import { buildOvertimeWorkbook } from "@/lib/overtime/export";
import { listOvertimeSchema } from "@/lib/overtime/validation";
import { overtimeErrorResponse } from "@/lib/overtime/http";

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  try {
    const params = new URL(request.url).searchParams;
    // Pagination never affects the exported dataset.
    params.delete("limit"); params.delete("offset");
    const query = listOvertimeSchema.parse(Object.fromEntries(params.entries()));
    const { rows, events } = await loadOvertimeExport(auth.user, query);
    const workbook = buildOvertimeWorkbook(rows, events, query);
    const data = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }) as Buffer;
    await recordAuditLog({ module: "OVERTIME", action: "EXPORT", actor: auth.user, details: {
      scope: query.scope, status: query.status ?? null, fromDate: query.fromDate ?? null,
      toDate: query.toDate ?? null, clientId: query.clientId ?? null, employeeId: query.employeeId ?? null, count: rows.length,
    } });
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
    return new Response(new Uint8Array(data), { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Lembur-${date}.xlsx"`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) { return overtimeErrorResponse(error); }
}
