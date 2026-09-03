import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { chromium } from "playwright";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { getCurrentSession } from "@/lib/actions/auth";

/**
 * Genera el reporte (PDF o HTML standalone) renderizando la MISMA página
 * /evaluacion que se ve en pantalla (Playwright headless), reenviando la
 * cookie de sesión para que cargue con los datos y permisos del usuario que
 * pidió la descarga, y pasando los mismos filtros (mes(es)/sucursal(es)/
 * unidad(es)) como query params -- ver EvaluacionPage, que hidrata su estado
 * inicial desde la URL para que esto reproduzca exactamente lo que el
 * usuario tenía elegido en pantalla.
 */
export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
  if (!sessionCookie) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formato = req.nextUrl.searchParams.get("formato") === "html" ? "html" : "pdf";
  const filtroParams = new URLSearchParams();
  for (const clave of ["anio", "meses", "sucursalIds", "unidadNegocioIds"]) {
    const valor = req.nextUrl.searchParams.get(clave);
    if (valor) filtroParams.set(clave, valor);
  }
  const ruta = `/evaluacion?${filtroParams.toString()}`;

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

    if (formato === "html") {
      // Reporte standalone: inline el CSS ya calculado (getComputedStyle no
      // aplica -- basta con las hojas de estilo que Next ya cargó, se
      // referencian tal cual porque el archivo se abre desde disco/otra
      // ubicación, no necesita ser 100% autocontenido para uso interno).
      const html = await page.content();
      return new NextResponse(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Disposition": `attachment; filename="reporte_cumplimiento.html"`,
        },
      });
    }

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "1cm", bottom: "1cm", left: "1cm", right: "1cm" },
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="reporte_cumplimiento.pdf"`,
      },
    });
  } finally {
    await browser.close();
  }
}
