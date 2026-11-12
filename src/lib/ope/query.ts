import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { opeDocuments } from "../db/schema";
import { OPE_STATUSES, OPE_TYPES } from "./validation";

export const opeQuerySchema = z.object({
  type: z.enum(OPE_TYPES).optional(),
  status: z.enum([...OPE_STATUSES, "NON_VOID"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(2_147_483_647).default(0),
});

export function opeListWhere(params: Pick<z.infer<typeof opeQuerySchema>, "type" | "status">) {
  return and(
    params.type ? eq(opeDocuments.type, params.type) : undefined,
    params.status === "NON_VOID" ? ne(opeDocuments.status, "VOID")
      : params.status ? eq(opeDocuments.status, params.status) : undefined,
  );
}
