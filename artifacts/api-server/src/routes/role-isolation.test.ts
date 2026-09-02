import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../app";
import router from ".";

type Method = "GET" | "POST" | "PATCH" | "DELETE";
type RoleKey = "gerencia" | "gc" | "coordinador" | "asesor";

const DEMO_USERS: Record<RoleKey, string> = {
  gerencia: "demo.gerencia@ccv.local",
  gc: "demo.gc@ccv.local",
  coordinador: "demo.coordinador@ccv.local",
  asesor: "demo.asesor@ccv.local",
};

const KNOWN_API_ROUTES = [
  "GET /healthz",
  "POST /auth/login",
  "GET /auth/me",
  "POST /auth/logout",
  "GET /catalogos",
  "GET /resumen",
  "GET /unidades/:unitKey",
  "GET /cobranzas",
  "GET /cobranzas/comparison",
  "GET /asesores",
  "GET /minutas",
  "GET /minutas/destinatarios",
  "GET /minutas/clientes",
  "GET /minutas/alertas-abiertas",
  "POST /minutas",
  "PATCH /minutas/:id",
  "DELETE /minutas/:id",
  "POST /minutas/:id/comentarios",
  "POST /minutas/alertas/:id/resolver",
].sort();

function registeredRoutes(target: any): string[] {
  const found: string[] = [];
  const visit = (stack: any[]) => {
    for (const layer of stack ?? []) {
      if (layer.route) {
        for (const method of Object.keys(layer.route.methods)) {
          found.push(`${method.toUpperCase()} ${layer.route.path}`);
        }
      } else if (layer.handle?.stack) {
        visit(layer.handle.stack);
      }
    }
  };
  visit(target.stack);
  return found.sort();
}

let baseUrl = "";
let server: ReturnType<typeof app.listen>;

before(() => {
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

async function login(email: string) {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "CCVdemo2026!" }),
  });
  assert.equal(response.status, 200, `No se pudo iniciar sesión como ${email}`);
  const body = await response.json() as { user: { id: string } };
  const cookie = response.headers.getSetCookie()[0]?.split(";")[0];
  assert.ok(cookie, `Login sin cookie para ${email}`);
  return { cookie, userId: body.user.id };
}

async function request(cookie: string, method: Method, path: string, body?: unknown) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      cookie,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function expectStatus(cookie: string, method: Method, path: string, expected: number, body?: unknown) {
  const response = await request(cookie, method, path, body);
  assert.equal(response.status, expected, `${method} ${path}: esperado ${expected}, recibido ${response.status}`);
  return response;
}

test("todas las rutas de negocio están inventariadas y respetan aislamiento por rol", async () => {
  assert.deepEqual(
    registeredRoutes(router),
    KNOWN_API_ROUTES,
    "El router cambió. Toda ruta nueva debe agregarse al inventario y a la matriz de scoping.",
  );

  const sessions = Object.fromEntries(
    await Promise.all(Object.entries(DEMO_USERS).map(async ([role, email]) => [role, await login(email)])),
  ) as Record<RoleKey, Awaited<ReturnType<typeof login>>>;

  const catalogsResponse = await expectStatus(sessions.gerencia.cookie, "GET", "/catalogos", 200);
  const catalogs = await catalogsResponse.json() as {
    sucursales: { id: string; nombre: string }[];
    unidades: { id: string; nombre: string }[];
  };
  const branch = (name: string) => catalogs.sucursales.find((item) => item.nombre === name)!.id;
  const unit = (name: string) => catalogs.unidades.find((item) => item.nombre === name)!.id;

  const unitPaths = ["repuestos", "lubfiltros", "servicios", "equipos", "alquiler"];
  for (const role of Object.keys(sessions) as RoleKey[]) {
    const { cookie } = sessions[role];
    await expectStatus(cookie, "GET", "/catalogos", 200);
    await expectStatus(cookie, "GET", "/resumen", 200);
    await expectStatus(cookie, "GET", "/asesores", 200);
    await expectStatus(cookie, "GET", "/asesores?drilldown=true", 200);
    await expectStatus(cookie, "GET", "/minutas", 200);
    await expectStatus(cookie, "GET", "/minutas/destinatarios", 200);
    await expectStatus(cookie, "GET", "/minutas/clientes?q=Cliente", 200);
    await expectStatus(cookie, "GET", "/minutas/alertas-abiertas", 200);
    await expectStatus(cookie, "GET", "/cobranzas", role === "asesor" ? 403 : 200);
    await expectStatus(cookie, "GET", "/cobranzas/comparison", role === "asesor" ? 403 : 200);
    for (const unitPath of unitPaths) {
      const allowed = role !== "gc" || unitPath === "equipos";
      const advisorAllowed = role !== "asesor" || unitPath === "repuestos";
      await expectStatus(cookie, "GET", `/unidades/${unitPath}`, allowed && advisorAllowed ? 200 : 403);
    }
  }

  await expectStatus(sessions.gc.cookie, "GET", `/resumen?unidadNegocioId=${unit("Repuestos")}`, 403);
  await expectStatus(sessions.gc.cookie, "GET", `/asesores?unidadId=${unit("Repuestos")}`, 403);
  await expectStatus(sessions.coordinador.cookie, "GET", `/resumen?sucursalId=${branch("Caracas")}`, 403);
  await expectStatus(sessions.coordinador.cookie, "GET", `/cobranzas?sucursales=${branch("Caracas")}`, 403);
  await expectStatus(sessions.coordinador.cookie, "GET", `/asesores?sucursalId=${branch("Caracas")}`, 403);
  await expectStatus(sessions.asesor.cookie, "GET", `/resumen?sucursalId=${branch("Valencia")}`, 403);
  await expectStatus(sessions.asesor.cookie, "GET", `/asesores?unidadId=${unit("Equipos")}`, 403);

  const minuteBody = {
    fecha: new Date().toISOString().slice(0, 10),
    destinatarioId: sessions.asesor.userId,
    cliente: "Test aislamiento automatizado",
    descripcion: "Minuta temporal del test de scoping",
    fechaLimite: null,
    alertaIds: [],
  };
  const created = await expectStatus(sessions.gerencia.cookie, "POST", "/minutas", 201, minuteBody);
  const minute = await created.json() as { id: string };
  try {
    await expectStatus(sessions.gc.cookie, "POST", "/minutas", 403, minuteBody);
    await expectStatus(sessions.coordinador.cookie, "POST", "/minutas", 403, minuteBody);
    await expectStatus(sessions.asesor.cookie, "POST", "/minutas", 403, minuteBody);
    await expectStatus(sessions.gerencia.cookie, "PATCH", `/minutas/${minute.id}`, 200, {
      descripcion: "Minuta temporal actualizada",
      fechaLimite: null,
      estado: "en_proceso",
    });
    for (const role of ["gc", "coordinador", "asesor"] as RoleKey[]) {
      await expectStatus(sessions[role].cookie, "PATCH", `/minutas/${minute.id}`, 403, {
        descripcion: "Intento fuera de alcance",
        fechaLimite: null,
        estado: "en_proceso",
      });
      await expectStatus(sessions[role].cookie, "DELETE", `/minutas/${minute.id}`, 403);
    }
    await expectStatus(sessions.asesor.cookie, "POST", `/minutas/${minute.id}/comentarios`, 201, {
      texto: "Comentario temporal del test",
    });
    for (const role of ["gerencia", "gc", "coordinador"] as RoleKey[]) {
      await expectStatus(sessions[role].cookie, "POST", `/minutas/${minute.id}/comentarios`, 403, {
        texto: "Intento fuera de alcance",
      });
    }
    const unknownAlert = "00000000-0000-4000-8000-000000000099";
    for (const role of Object.keys(sessions) as RoleKey[]) {
      await expectStatus(sessions[role].cookie, "POST", `/minutas/alertas/${unknownAlert}/resolver`, 403);
    }
  } finally {
    await expectStatus(sessions.gerencia.cookie, "DELETE", `/minutas/${minute.id}`, 204);
  }
});