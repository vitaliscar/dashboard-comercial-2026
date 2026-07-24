import { createServerFn } from "@tanstack/react-start";
import { asc, gt } from "drizzle-orm";
import { cobranzas } from "@/db/schema";
import { requireAuth } from "@/lib/server/auth";

export const getCobranzasFn = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    return context.tx
      .select()
      .from(cobranzas)
      .where(gt(cobranzas.saldo, "0"))
      .orderBy(asc(cobranzas.fechaVencimiento));
  });
