import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { apiRateLimiter } from "@/lib/rate-limiter";

/**
 * Health mínimo (CN-006): solo status + DB ping.
 * Detalle de heap/CPU queda en /api/metrics (protegido).
 */
export async function GET(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const limit = apiRateLimiter.isRateLimited(`health:${ip}`);
  if (limit.limited) {
    return NextResponse.json({ status: "error", error: "rate_limited" }, { status: 429 });
  }

  let dbStatus: "healthy" | "unhealthy" = "healthy";
  try {
    await db.execute(sql`SELECT 1`);
  } catch (error) {
    console.error("Database connection error in health check:", error);
    dbStatus = "unhealthy";
  }

  const isHealthy = dbStatus === "healthy";
  return NextResponse.json(
    {
      status: isHealthy ? "ok" : "error",
      checks: { database: dbStatus },
    },
    { status: isHealthy ? 200 : 503 },
  );
}
