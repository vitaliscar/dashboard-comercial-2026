import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { chromium } from "playwright";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { getCurrentSession } from "@/lib/actions/auth";

const RUTAS_POR_TIPO: Record<string, (params: URLSearchParams) => string> = {
  asesor: () => "/evaluacion/asesor",
  sucursal: (params) => `/evaluacion/sucursal?sucursalId=${params.get("sucursalId") ?? ""}`,
  unidad: (params) => `/evaluacion/unidad?unidadId=${params.get("unidadId") ?? ""}`,
};

/**
 * Genera el PDF renderizando la MISMA página que se ve en pantalla (Playwright
 * headless), reenviando la cookie de sesión para que la página autenticada
 * cargue con los datos correctos del usuario que pidió la descarga.
 */
export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tipo = req.nextUrl.searchParams.get("tipo") ?? "asesor";
  const rutaFn = RUTAS_POR_TIPO[tipo];
  if (!rutaFn) {
    return NextResponse.json({ error: `Tipo de evaluación desconocido: ${tipo}` }, { status: 400 });
  }
  const ruta = rutaFn(req.nextUrl.searchParams);

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
  if (!sessionCookie) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const origin = req.nextUrl.origin;
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    await context.addCookies([
      {
        name: SESSION_COOKIE_NAME,
        value: sessionCookie.value,
        url: origin,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const page = await context.newPage();
    await page.goto(`${origin}${ruta}`, { waitUntil: "networkidle" });
    await page.waitForSelector("#evaluacion-print-root", { timeout: 15000 });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "1cm", bottom: "1cm", left: "1cm", right: "1cm" },
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="evaluacion_desempeno.pdf"`,
      },
    });
  } finally {
    await browser.close();
  }
}
