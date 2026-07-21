# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Este archivo proporciona orientación a Claude Code cuando trabaja con código en este repositorio.

## Descripción General

**Dashboard Comercial 2026** es un panel de análisis de ventas/comercial para CCV construido con **TanStack Start**, **React 19**, **TypeScript**, **Tailwind CSS v4** y **Supabase**. Autohospedado en VPS propio (sin Vercel, sin Lovable).

### Stack Tecnológico

- **Framework**: TanStack Start (SSR, file-based routing vía TanStack Router)
- **UI**: React 19 + shadcn/ui (componentes pre-generados en `src/components/ui/`)
- **Estilos**: Tailwind CSS v4 (plugin de Vite, no `tailwind.config.js`)
- **Formularios**: React Hook Form + Zod
- **Estado del servidor**: TanStack Query
- **Gráficos**: Recharts
- **Backend**: Supabase (PostgreSQL + Auth + RLS)
- **Gestor de paquetes**: Bun (`bun.lock` presente)
- **Build**: Vite 8 + Nitro (salida server en `.output/`)

## Comandos

```bash
bun install          # instalar dependencias
bun run dev           # servidor de desarrollo (http://localhost:3000, SSR + HMR)
bun run build          # build de producción
bun run build:dev       # build sin minificar (debugging)
bun run preview         # servir el build de producción localmente
bun run lint           # ESLint (TypeScript + React)
bun run format          # Prettier (printWidth 100, comillas dobles, trailingComma all)
bun run test           # Vitest — corre src/lib/kpi-calculations.test.ts (60 tests)
bun run test:watch      # Vitest en modo watch
bun run test:excel       # ejecuta src/tests/excel.test.ts con bun (script standalone, no Vitest)
```

**Nota sobre tests**: Vitest está instalado y cableado (`vitest.config.ts` en la raíz, alias `@` resuelto). `src/tests/excel.test.ts` está excluido de Vitest — es un script standalone contra el `.xlsx` real, se corre solo con `bun run test:excel`.

## Arquitectura

### Enrutamiento (TanStack Router, file-based)

- Cada `.tsx` en `src/routes/` es una ruta; `routeTree.gen.ts` es autogenerado — no editar.
- `__root.tsx`: shell raíz de la app.
- `_app.tsx` (no `_layout.tsx`): layout pathless que protege todo lo que cuelga de `src/routes/_app/*`. Su `beforeLoad` verifica `supabase.auth.getSession()` y redirige a `/auth` si no hay sesión; envuelve el contenido en `<AppShell>`.
- `auth.tsx`, `index.tsx`: rutas públicas.

Rutas protegidas actuales bajo `_app/`: `dashboard`, `gerencia-nacional`, `sucursal`, `asesor`, `asesores`, `equipos`, `servicios`, `lubfiltros`, `cobranzas`, `minutas`, `pareto`, `alertas`, `carga`, `usuarios`.

**`dashboard.tsx` no renderiza un dashboard — es un router por rol.** Lee `role`/`profile` de `useAuth()` y hace `navigate()` según el rol antes de mostrar nada:

| Rol (`AppRole`)                       | Redirige a                                                       |
| ------------------------------------- | ---------------------------------------------------------------- |
| `gerencia`, `gerente_comercial`       | `/gerencia-nacional`                                             |
| `coordinador` con `unidad_negocio_id` | `/servicios`, `/lubfiltros` o `/equipos` según el texto de la UN |
| `coordinador` sin `unidad_negocio_id` | `/sucursal`                                                      |
| `asesor`                              | `/asesor`                                                        |

Al agregar o renombrar una vista por rol, este switch en `dashboard.tsx` es la pieza central a actualizar — el nav (`app-shell.tsx`) solo enlaza a `/dashboard`, no a las vistas específicas.

### Autorización en tres capas (cliente)

RLS en Supabase es la autoridad real, pero el cliente aplica su propia lógica en capas — todas deben mantenerse en sync manualmente, no hay generación automática entre ellas:

1. **`src/hooks/use-auth.tsx`** — `AuthProvider`/`useAuth()`. Carga `profiles` + `user_roles` tras el login y resuelve un único `role: AppRole` (`"gerencia" | "gerente_comercial" | "coordinador" | "asesor"`) por prioridad si el usuario tiene varios roles asignados.
2. **`src/lib/permissions.ts`** — funciones `can*(context)` (p. ej. `canManageUsers`, `canViewPareto`, `canEditPipeline`) que deciden qué puede hacer cada rol en la UI.
3. **`src/lib/data-scope.ts`** — helper `scoped()` que agrega un `.eq()` a un query builder de Supabase según el rol, como atajo de UX (comentario explícito en el código: "RLS also enforces this on the server; this is a UX-level shortcut").

### Clientes Supabase — no mezclar

- **`src/integrations/supabase/client.ts`** — cliente de navegador/SSR con la clave pública (`VITE_SUPABASE_PUBLISHABLE_KEY`), sujeto a RLS. Es el que se usa en componentes y rutas.
- **`src/integrations/supabase/client.server.ts`** — cliente admin con `SUPABASE_SERVICE_ROLE_KEY`, **bypassea RLS**. Solo para módulos `*.server.ts` / handlers de servidor; nunca importarlo desde un archivo que se envía al bundle del cliente.
- **`src/integrations/supabase/auth-middleware.ts`** — middleware de TanStack Start (`requireSupabaseAuth`) para server functions: valida el header `Authorization: Bearer` contra Supabase.

Todos estos archivos llevan cabecera "autogenerado, no editar directamente" — son generados por la integración con Supabase.

### Esquema de base de datos — verificar contra `types.ts` y `docs/SCHEMA.md`

El esquema real (18 tablas) está documentado en detalle en **`docs/SCHEMA.md`**, generado a partir
de una introspección directa del endpoint OpenAPI de PostgREST en producción (no de las
migraciones — ver "drift conocido" en ese documento). `src/integrations/supabase/types.ts` fue
regenerado a mano para coincidir con ese snapshot real (2026-07-09) y es la referencia canónica
para el código; `docs/SCHEMA.md` es la referencia legible para humanos con las notas de drift.

Dos gotchas ya corregidos que vale la pena recordar:

- `cotizaciones` **no tiene** columna `asesor` (solo `asesor_id`/`asesor_codigo`) — para mostrar
  el nombre del asesor hay que resolver `asesor_codigo` contra `cumplimiento_asesores.codigo_asesor`.
- El enum `cotizacion_etapa` real es `desarrollo | propuesta_negociacion | venta_perdida | desconocido`
  (no `prospecto | presentada | negociacion | ganada | perdida` como sugieren las migraciones) —
  `propuesta_negociacion` es funcionalmente la etapa "ganada".

Código limpiado (eliminado):

- `src/hooks/useSupabaseQuery.ts` — hooks huérfanos que referenciaban esquema antiguo
- `src/lib/kpi-hooks.ts` — no usado en app actual
- `src/hooks/dashboard-hooks-examples.tsx` — ejemplo/scaffolding
- `src/lib/kpi-calculations.examples.ts` — ejemplo/scaffolding
- `src/components/{index.ts,gauge-chart,chart-wrapper,filter-bar,performance-table,svg-3d-renderer,digital-loom-background,model-viewer-3d}` — barrel muerto + componentes sin ninguna referencia real en el árbol de imports
- `src/hooks/useTop5ClientesFacturados.ts`, `src/shims/opentype-default.ts` — huérfanos (el shim perdió su alias en `vite.config.ts` en algún punto)

**Práctica**: antes de escribir o depurar una consulta a Supabase, verificar siempre el nombre de tabla/columna en `types.ts` o `docs/SCHEMA.md` — nunca asumas que coincide con `supabase/migrations/*.sql`, que ya demostraron estar desincronizadas del estado real.

### Bug recurrente a vigilar: hooks después de un early return

`pareto.tsx`, `asesor.tsx`, `coordinador.tsx` y `gerencia-nacional.tsx` tenían el mismo patrón: un
guard de acceso por rol (`if (role !== "...") return <AccesoRestringido />`) colocado **antes** de
los `useQuery`/`useMemo` del componente. Como `role` es `null` en el primer render (antes de que
`useAuth()` resuelva el perfil) y luego cambia a un valor real, React monta el componente con
menos hooks en el primer render y más en el segundo → `"Rendered more hooks than during the
previous render"`, un crash real en producción en cualquier hard-refresh de esas rutas. Ya
corregido en las 4 rutas: el guard ahora va **después** de todos los hooks (justo antes del
`return` del JSX principal), y las queries sensibles usan `enabled: canView` en vez de saltarse el
hook. Si se agrega una ruta nueva con guard de rol, seguir este mismo orden.

### Carga de datos (Excel → Supabase)

- `src/integrations/supabase/load-excel.ts` reemplaza (delete + insert) el contenido de sus tablas objetivo a partir de un Excel local (`CCV Rendimiento.xlsx`).
- Automatizado por `.github/workflows/weekly-excel-load.yml`: cron `0 9 * * 5` (viernes 5 AM Caracas, UTC-4), más `workflow_dispatch` manual. Requiere los secrets `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, opcionalmente `EXCEL_FILE_URL`.
- Ver `SUPABASE_SETUP.md` para el setup inicial — pero sus nombres de variable de entorno (`VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`) están desactualizados; usar los reales (sección siguiente).
- **Neteo de repuestos cotizado vs. Lub/Filtros**: `getCotizacionesPrincipales()` resta del monto
  bruto de repuestos cotizado en la hoja "Oportunidades" el monto cotizado para el mismo cliente
  en "Oportunidades LubFiltros" (proporcional al bruto del cliente si hay varias filas), replicando
  exactamente el mismo principio que `getFacturasPrincipales()` ya aplica para el neto facturado —
  evita doble conteo del lubricante que viaja embebido en las cotizaciones de repuestos. El asesor
  de cotización sale de "Nombre Asesor"/"Código Asesor" (cols F/G) en Oportunidades, y de "Nombre
  Vendedor Cot."/"Código Vendedor Cot." (cols R/S) en Oportunidades LubFiltros — ya estaba
  implementado correctamente antes de este cambio.
- **Pareto multi-fuente** (`/pareto`): calcula el 80/20 de forma independiente sobre `cotizaciones`,
  `facturas` y `ventas_perdidas` (pestañas Cotizado/Facturado/Ventas Perdidas), sin cruzar
  identidad de cliente entre tablas — cada fuente usa el nombre de cliente tal como llega de su
  propia hoja de origen. La lógica de cálculo vive en `src/lib/analytics/pareto.ts`
  (`computeParetoSummary`), reutilizable y testeable fuera de React.
- **Módulo de Asesores y Regla "Ventas Casa"** (`/asesores`):
  Vista gerencial que consolida datos comerciales por asesor comercial.
  El catálogo canónico de los 32 asesores autorizados está en `src/lib/asesores-catalogo.ts`.
  Toda venta/cotización/venta perdida cuyo código o nombre de asesor no coincida con este catálogo
  (normalizado mediante `normalizarNombre` que maneja acentos, espacios, signos como `#` y spelling
  overrides como `BRICE#O` o `HERNANDES`) se acumula en el asesor sintético "Ventas Casa" (`"CASA"`).
  La lógica de agregación y cálculo de KPIs vive en `src/lib/analytics/asesores.ts` con sus tests.

  Alcance por Rol en el Módulo de Asesores:

  | Rol (`AppRole`)     | Alcance / Scoping de Datos                                                        |
  | ------------------- | --------------------------------------------------------------------------------- |
  | `gerencia`          | Nacional: ve todas las sucursales y unidades de negocio (multi-select habilitado) |
  | `gerente_comercial` | Unidad: restringido a su unidad de negocio asignada                               |
  | `coordinador`       | Sucursal: restringido a su sucursal asignada (filtro bloqueado a sucursal propia) |

### Variables de entorno

Los nombres reales, tal como los leen `client.ts` / `client.server.ts` / `auth-middleware.ts` (no los de `SUPABASE_SETUP.md`, que están desactualizados):

```env
VITE_SUPABASE_URL=...                    # cliente browser (fallback: process.env.SUPABASE_URL en SSR)
VITE_SUPABASE_PUBLISHABLE_KEY=...        # cliente browser, sujeto a RLS (fallback: process.env.SUPABASE_PUBLISHABLE_KEY)
SUPABASE_SERVICE_ROLE_KEY=...            # solo client.server.ts — bypassea RLS, nunca al bundle de cliente
```

### Roles de negocio (`AppRole`, definido en `src/hooks/use-auth.tsx`)

`"gerencia" | "gerente_comercial" | "coordinador" | "asesor"` — ver `roleLabel()` en `src/lib/format.ts` para las etiquetas en UI ("Gerencia Nacional", "Gerente Comercial", "Coordinador", "Asesor"). El nav (`app-shell.tsx`) oculta entradas por rol vía un campo `roles` por item (p. ej. `/carga` y `/usuarios` solo para `gerencia`).

## Git

Conventional commits: `<type>: <descripción>` — tipos `feat, fix, refactor, docs, test, chore, perf, ci`.

## Despliegue

Autohospedado en VPS propio, sin Vercel ni Lovable. `vite.config.ts` usa `@tanstack/react-start/plugin/vite` con `target: "node-server"` (reemplaza el preset Cloudflare de Lovable). Build de producción: `bun run build` (salida en `dist/client` + `dist/server/server.js`); servir con `bun run start` (`node dist/server/server.js`) detrás de un reverse proxy (nginx/Caddy) con TLS. Verificado end-to-end con `bun install && bun run build` — el build compila y genera el entrypoint Node correctamente.

**Nota sobre Nitro**: `nitro@3.0.260603-beta` está pinneado a una versión exacta (no `^`), no a un rango — evita que un beta más reciente se cuele en un install. El audit de seguridad recomendaba bajar a "nitro 2.10.x", pero ese release nunca existió: el paquete npm `nitro` es la nueva generación (sucesora de `nitropack`, que sí tiene 2.x estable) y `@tanstack/react-start@1.168+` está construido específicamente sobre la integración Vite-nativa de Nitro v3 — no hay stable release compatible con esta versión de TanStack Start todavía. Downgradear a `nitropack` rompería el build (confirmado: `start-plugin-core` no depende de nitro/nitropack como peer, así que la integración viene de la propia versión de TanStack Start). Mitigación real: build verificado, versión exacta pinneada, sin auto-actualización silenciosa.

## Recursos

- TanStack Start: https://tanstack.com/start/latest/docs
- TanStack Router: https://tanstack.com/router/latest/docs
- Supabase: https://supabase.com/docs
- shadcn/ui: https://ui.shadcn.com
