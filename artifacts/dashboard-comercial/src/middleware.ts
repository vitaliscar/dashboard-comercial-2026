import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Edge guard ligero (CN-015 / CN-006).
 * La auth de páginas sigue en el layout (app); aquí endurecemos APIs sensibles.
 * /api/metrics exige METRICS_TOKEN (Bearer o ?token=) en producción.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/metrics")) {
    const expected = process.env.METRICS_TOKEN;
    if (process.env.NODE_ENV === "production" && !expected) {
      return new NextResponse("Metrics disabled", { status: 503 });
    }
    if (expected) {
      const header = request.headers.get("authorization");
      const bearer = header?.startsWith("Bearer ") ? header.slice(7) : null;
      const queryToken = request.nextUrl.searchParams.get("token");
      const provided = bearer || queryToken;
      if (provided !== expected) {
        return new NextResponse("Unauthorized", { status: 401 });
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/metrics/:path*"],
};
