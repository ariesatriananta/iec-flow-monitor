import { and, eq, ilike, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { opeDocuments, opeItems } from "../db/schema";
import { OPE_STATUSES, OPE_TYPES } from "./validation";

export const opeQuerySchema = z.object({
  type: z.enum(OPE_TYPES).optional(),
  status: z.enum([...OPE_STATUSES, "NON_VOID"]).optional(),
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(2_147_483_647).default(0),
});

export function opeListWhere(params: Pick<z.infer<typeof opeQuerySchema>, "type" | "status" | "q">) {
  // Treat user input as a literal substring, not a SQL LIKE wildcard pattern.
  const pattern = params.q ? `%${params.q.replace(/[\\%_]/g, "\\$&")}%` : undefined;
  return and(
    params.type ? eq(opeDocuments.type, params.type) : undefined,
    params.status === "NON_VOID" ? ne(opeDocuments.status, "VOID")
      : params.status ? eq(opeDocuments.status, params.status) : undefined,
    pattern ? or(
      ilike(opeDocuments.documentNumber, pattern),
      ilike(opeDocuments.subject, pattern),
      sql`${opeDocuments.clientSnapshot}->>'name' ilike ${pattern}`,
      // EXISTS avoids duplicate documents/counts when several Meals rows match.
      and(eq(opeDocuments.type, "MEALS"), sql`exists (
        select 1 from ${opeItems}
        where ${opeItems.documentId} = ${opeDocuments.id}
          and ${opeItems.clientSnapshot}->>'name' ilike ${pattern}
      )`),
    ) : undefined,
  );
}
