"use server";

import { asc, gt } from "drizzle-orm";
import { cobranzas } from "@/db/schema";
import { withAuth } from "@/lib/actions/with-auth";

export async function getCobranzasAction() {
  return withAuth(({ tx }) =>
    tx
      .select()
      .from(cobranzas)
      .where(gt(cobranzas.saldo, "0"))
      .orderBy(asc(cobranzas.fechaVencimiento)),
  );
}
