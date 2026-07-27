# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Este archivo proporciona orientación a Claude Code cuando trabaja con código en este repositorio.

## Descripción General

**Dashboard Comercial 2026** es un panel de análisis de ventas/comercial para CCV construido con **Next.js 16 (App Router)**, **React 19**, **TypeScript**, **Tailwind CSS v4**, **Drizzle ORM** sobre **PostgreSQL 18**. RLS nativo de Postgres, sesiones propias — **sin Supabase** (migrado y eliminado por completo, ver sección "Historia" abajo). Postgres corre en un contenedor Docker (`docker-compose.yml`), tanto en desarrollo local como se espera en producción.

### Stack Tecnológico

- **Framework**: Next.js 16, App Router (`src/app/`), React Server Components + Server Actions
- **UI**: React 19 + shadcn/ui (`src/components/ui/`)
- **Estilos**: Tailwind CSS v4 (plugin PostCSS)
- **Formularios**: React Hook Form + Zod
- **Gráficos**: Recharts, three.js / @react-three/fiber (logo 3D)
- **Backend/DB**: PostgreSQL 18 en Docker + Drizzle ORM (`src/db/schema.ts`), RLS nativo por SQL policies
- **Autenticación**: sesiones propias por cookie httpOnly + `argon2` para hash de password
- **Gestor de paquetes**: Bun (`bun.lock`)
- **Build**: Next.js (`next build` / `next start`)

## Base de datos local (Docker)

`docker-compose.yml` levanta un único servicio `postgres` (imagen `postgres:18`). El puerto host se mapea a **55432** (no 5432/5433) porque en máquinas con un Postgres nativo de Windows corriendo como servicio, esos puertos quedan ocupados y las conexiones fallan con "password authentication failed" en vez de "connection refused" — confuso de diagnosticar. Si `55432` choca en otro entorno, cambiar el mapeo en `docker-compose.yml` y en `.env.local` a la vez.

`docker/postgres-init/00-roles.sql` corre una sola vez (al crear el volumen) y crea los dos roles de aplicación:

- `app_admin` (`BYPASSRLS`) — dueño del schema, usado por `dbAdmin` en `src/db/index.ts`.
- `app_user` (sin bypass) — usado por `db`; el scope por rol lo aplican las RLS policies vía `SET LOCAL` dentro de `withAuth` (`src/lib/actions/with-auth.ts`).

```bash
docker compose up -d              # levantar Postgres (una vez; persiste en el volumen postgres_data)
docker compose down                # detener (docker compose down -v para borrar también los datos)
```

### Migraciones (orden de aplicación en una BD nueva)

No hay un comando único "migrate" — se aplican los `.sql` a mano contra el contenedor, en este orden:

```bash
docker exec -i dashboard-comercial-postgres psql -U app_admin -d dashboard_comercial < src/db/migrations/0000_huge_sharon_carter.sql
docker exec -i dashboard-comercial-postgres psql -U app_admin -d dashboard_comercial < src/db/migrations/0001_far_the_stranger.sql
docker exec -i dashboard-comercial-postgres psql -U app_admin -d dashboard_comercial < src/db/migrations-manual/0001_rls_policies.sql
docker exec -i dashboard-comercial-postgres psql -U app_admin -d dashboard_comercial < src/db/migrations-manual/0002_minutas_delete_policy.sql
docker exec -i dashboard-comercial-postgres psql -U app_admin -d dashboard_comercial < src/db/migrations-manual/0003_schema_drift_fix.sql
docker exec -i dashboard-comercial-postgres psql -U app_admin -d dashboard_comercial < src/db/migrations/0002_absent_kabuki.sql
docker exec -i dashboard-comercial-postgres psql -U app_admin -d dashboard_comercial < src/db/migrations-manual/0004_ventas_casa_rls.sql
docker exec -i dashboard-comercial-postgres psql -U app_admin -d dashboard_comercial < src/db/migrations/0003_useful_wind_dancer.sql
docker exec -i dashboard-comercial-postgres psql -U app_admin -d dashboard_comercial < src/db/migrations-manual/0005_cobranzas_snapshots_rls.sql
```

`0003_schema_drift_fix.sql` existe porque `cobranzas.dias_vencidos`, `servicios.taller`/`servicios.csa` y la tabla `detalles_servicios_estrategicos` están en `src/db/schema.ts` pero **nunca se generó una migración Drizzle para ellas** (se aplicaron a mano contra la BD Supabase original — ver el comentario en `0001_far_the_stranger.sql`). Sin este archivo, `bun run load-excel` falla al insertar en `cobranzas`/`servicios`/`detalles_servicios_estrategicos`. Si `schema.ts` cambia, revisar primero si el drift ya está cubierto por una migración antes de asumir que `drizzle-kit push`/`generate` basta.

`0002_absent_kabuki.sql` (generada por `drizzle-kit generate`) crea la tabla `ventas_casa` (hoja Excel "Ventas Casa": ventas de atención casa por Sucursal/U-N/Mes, sin asesor asociado — igual que `servicios_interno`, es un snapshot de un solo año sin columna `año`). `0004_ventas_casa_rls.sql` habilita RLS sobre esa tabla con el mismo patrón que `select_servicios`/`select_cobranzas` (scope por sucursal + unidad, sin `asesor_id` porque no aplica).

## Comandos

```bash
bun install               # instalar dependencias
bun run dev                 # servidor de desarrollo Next.js (http://localhost:3000, o el siguiente puerto libre)
bun run build                # build de producción
bun run start                 # servir el build de producción (next start)
bun run lint                # ESLint (TypeScript + React)
bun run format                # Prettier
bun run test                # Vitest (unit/integration, excluye e2e/ y excel.test.ts)
bun run test:watch             # Vitest en modo watch
bun run test:excel              # ejecuta src/tests/excel.test.ts con bun (script standalone contra el .xlsx real)
bun run test:e2e               # Playwright (arranca `next dev` automáticamente vía webServer)
bunx tsc --noEmit             # type-check completo
bun run alter-schema            # aplica ALTERs ad-hoc de FK (scripts/alter-schema.ts)
bun run load-excel               # alter-schema + carga completa desde "CCV Rendimiento.xlsx" (scripts/run-full-load.ts, llama a src/db/load-excel.ts)
```

Para correr un único test de Vitest: `bun run test -- <patrón o ruta de archivo>` (p. ej. `bun run test -- src/lib/analytics/pareto.test.ts`).
Para un único test de Playwright: `bun run test:e2e -- <archivo>.spec.ts`.

`scripts/run-full-load.ts <ruta-al-excel>` es el entrypoint real de carga (llama a `loadExcelToPostgres` en `src/db/load-excel.ts`, que siembra catálogos, usuarios, cotizaciones, facturas, ventas perdidas, presupuestos, cobranzas, servicios, equipos y cumplimiento por asesor). No usar un loader parcial que solo cargue un subconjunto de tablas — el dashboard depende de todas ellas.

## Arquitectura

### Enrutamiento: Next.js App Router (`src/app/`)

- `src/app/(app)/*` — grupo de rutas protegidas. `src/app/(app)/layout.tsx` es un Server Component `async` que llama `getCurrentSession()`; si no hay sesión hace `redirect("/auth")`, y envuelve el contenido en `<ProtectedShell>`.
- `src/app/(auth)/auth/` — login, ruta pública.
- `src/app/api/health/`, `src/app/api/metrics/` — route handlers de infraestructura.
- Cada carpeta bajo `(app)/` es una vista de rol o módulo: `dashboard`, `gerencia-nacional`, `sucursal`, `coordinador`, `asesor`, `asesores`, `equipos`, `alquiler`, `servicios`, `lubfiltros`, `cobranzas`, `minutas`, `pareto`, `alertas`, `carga`, `usuarios`, `cliente-360`, `comisiones`, `embudo`, `repuestos`, `resumen`, `simulador`.

**`(app)/dashboard` es un router por rol, no un dashboard en sí** — lee `role`/`profile` de `useAuth()` y navega según:

| Rol (`AppRole`)                       | Redirige a                                                       |
| ------------------------------------- | ---------------------------------------------------------------- |
| `gerencia`, `gerente_comercial`       | `/gerencia-nacional`                                             |
| `coordinador` con `unidad_negocio_id` | `/servicios`, `/lubfiltros` o `/equipos` según el texto de la UN |
| `coordinador` sin `unidad_negocio_id` | `/sucursal`                                                      |
| `asesor`                              | `/asesor`                                                        |

Al agregar o renombrar una vista por rol, este switch es la pieza central a actualizar.

### Autenticación y autorización (tres capas del lado del servidor)

RLS en Postgres es la autoridad real. El flujo:

1. **`src/lib/actions/auth.ts`** (`"use server"`) — `loginAction`/`logoutAction`/`getCurrentSession`/`meAction`. Hace login contra `users`/`sessions` en Postgres (password verificado con `src/lib/auth/password.ts`, argon2), setea cookie httpOnly (`src/lib/auth/session.ts`), y resuelve `profile` + `role: AppRole` por prioridad (`gerencia > gerente_comercial > coordinador > asesor`). `getCurrentSession` está envuelto en `cache()` de React — se puede llamar múltiples veces por request sin duplicar queries.
2. **`src/lib/actions/with-auth.ts`** — `withAuth(fn)` abre una transacción Drizzle y ejecuta `SET LOCAL app.current_role / app.current_user_id / app.current_sucursal_id` antes de correr `fn`, para que las RLS policies de Postgres (`src/db/migrations-manual/0001_rls_policies.sql`) apliquen sobre esa transacción. Usar esto (no queries sueltas con `db`) para cualquier server function que lea/escriba datos scoped por rol.
3. **`src/hooks/use-auth.tsx`** (`"use client"`) — `AuthProvider`/`useAuth()`, consume `loginAction`/`logoutAction`/`meAction` vía Server Actions y expone `{ session, profile, role, signIn, signOut, refresh }` a los Client Components.
4. **`src/lib/permissions.ts`** — `canAccessModule(role, module)` / `getModulesForRole(role)`, tabla `MODULE_ACCESS` por `ModuleKey`.

Dos clientes Drizzle en **`src/db/index.ts`**, no mezclar:

- `dbAdmin` — rol `app_admin` (BYPASSRLS). Solo para: pipeline de carga de Excel, migraciones, y lectura de credenciales/sesión en `auth.ts` (necesita bypass antes de que exista un `SET LOCAL` de rol). **Nunca** para servir datos de negocio scoped por rol.
- `db` — rol `app_user` (sin BYPASSRLS). El que sirve requests reales; el scope por rol se aplica vía RLS + `SET LOCAL` dentro de `withAuth`, no en el código de la query.

### Carga de datos (Excel → Postgres)

- `src/db/load-excel.ts` (`loadExcelToPostgres`) reemplaza (delete + insert) el contenido de las tablas objetivo a partir de un Excel local, usando `dbAdmin` (BYPASSRLS). También siembra `users`/`profiles`/`user_roles` a partir de la hoja "Usuarios" del Excel (contraseña hasheada con argon2; si la hoja no trae contraseña se genera una temporal).
- `scripts/run-full-load.ts` + `scripts/alter-schema.ts` son los entrypoints CLI (`bun run load-excel`).
- Automatizado por `.github/workflows/weekly-excel-load.yml`: cron `0 9 * * 5` (viernes 5 AM Caracas, UTC-4), más `workflow_dispatch` manual. Usa los secrets `DATABASE_URL`/`DATABASE_ADMIN_URL` del repo (apuntando al Postgres de producción).
- **Neteo de repuestos cotizado vs. Lub/Filtros**: la lógica de negocio para restar del monto bruto de repuestos cotizado el monto ya cotizado en Lub/Filtros (evitar doble conteo) — ver `getCotizacionesPrincipales()`/`getFacturasPrincipales()` en `src/lib/excel-parser.ts`.
- **Pareto multi-fuente** (`/pareto`): calcula el 80/20 de forma independiente sobre cotizaciones, facturas y ventas perdidas, sin cruzar identidad de cliente entre tablas. Lógica en `src/lib/analytics/pareto.ts` (`computeParetoSummary`), testeable fuera de React.
- **Módulo de Asesores y Regla "Ventas Casa"** (`/asesores`): el catálogo canónico de asesores autorizados está en `src/lib/asesores-catalogo.ts`. Toda venta/cotización/venta perdida cuyo código o nombre no coincida con el catálogo (normalizado vía `normalizarNombre`, que maneja acentos, espacios, `#` y spelling overrides) se acumula en el asesor sintético "Ventas Casa" (`"CASA"`). Agregación y KPIs en `src/lib/analytics/asesores.ts`.
- `src/lib/analytics/` tiene además `churn.ts`, `cohortes.ts`, `cross-sell.ts`, `forecast.ts`, `funnel.ts`, `health-score.ts`, `anomalias.ts` — cada uno con su `.test.ts` — para los módulos más nuevos (`embudo`, `simulador`, `comisiones`, etc.). Revisar el test correspondiente antes de tocar la lógica de cálculo.
- **`presupuestos` (facturado real) solo tiene datos hasta el último mes cerrado en el Excel** — meses futuros del año en curso vienen con `meta` pero `ventas_ccv`/`ventas_xibi`/`ventas_estrategicas` en 0. Un KPI de "Facturado" en $0 para el mes actual no es un bug si ese mes aún no se cerró en el Excel; verificar contra `select anio, mes, sum(ventas_ccv+ventas_xibi+ventas_estrategicas) from presupuestos group by 1,2` antes de asumir que la carga falló.

### Esquema de base de datos

- **`src/db/schema.ts`** es la fuente de verdad de Drizzle (tablas, tipos, relaciones). `drizzle.config.ts` apunta a `src/db/migrations/` como `out`; las migraciones generadas viven ahí, y `src/db/migrations-manual/` tiene SQL escrito a mano (RLS policies, políticas de borrado específicas, y el fix de drift `0003_schema_drift_fix.sql`) que no pasa por `drizzle-kit generate`.
- `docs/SCHEMA.md` documenta el esquema de una era anterior — puede tener drift respecto al esquema Postgres/Drizzle actual; ante la duda, `src/db/schema.ts` manda.
- Migraciones y `drizzle-kit push` corren como `app_admin` (BYPASSRLS).

### Bug recurrente a vigilar: hooks después de un early return

Un guard de acceso por rol (`if (role !== "...") return <AccesoRestringido />`) **nunca** debe ir antes de los `useQuery`/`useMemo`/`useEffect` del componente. Como `role` es `null` en el primer render (antes de que `useAuth()` resuelva sesión/perfil) y luego cambia a un valor real, un guard temprano hace que React monte el componente con menos hooks en el primer render y más en el segundo → `"Rendered more hooks than during the previous render"`. El guard debe ir **después** de todos los hooks (justo antes del `return` del JSX principal); las queries sensibles deben usar `enabled: canView` en vez de saltarse el hook.

### Roles de negocio (`AppRole`, definido en `src/lib/actions/auth.ts`)

`"gerencia" | "gerente_comercial" | "coordinador" | "asesor"`. El nav oculta entradas por rol vía `getModulesForRole`/`canAccessModule` en `src/lib/permissions.ts` (p. ej. `/carga` y `/usuarios` solo para `gerencia`).

### Variables de entorno

```env
DATABASE_URL=...             # Postgres, rol app_user (sin BYPASSRLS) — usado por `db` en src/db/index.ts
DATABASE_ADMIN_URL=...       # Postgres, rol app_admin (BYPASSRLS) — usado por `dbAdmin`; migraciones y carga de Excel
```

En desarrollo local ambas apuntan al contenedor Docker en `localhost:55432` (ver `.env.example`). `.env.local` es lo que Bun/Next.js cargan realmente (gitignored) — no confundir con `.env.example`.

## Historia: migración fuera de Supabase (completa)

El proyecto corrió originalmente sobre TanStack Start + Supabase (Auth + Postgres + RLS de Supabase). Se migró en dos fases — primero a Postgres/Drizzle propio con RLS nativo (aún sobre TanStack Start), luego el enrutamiento a Next.js App Router — y **todo el código de Supabase y el árbol legacy de TanStack Start que dependía de él ya fueron eliminados**: no queda `src/integrations/supabase/`, `src/routes/`, `src/router.tsx`, `vite.config.ts`, ni las dependencias `@supabase/*`/`supabase`/`@tanstack/react-start`/`@tanstack/react-router` en `package.json`. `@tanstack/react-query` sí se mantiene — se sigue usando activamente en `src/app/` para data-fetching en Client Components.

Quedan referencias a "Supabase" solo en **comentarios históricos** (explican por qué algo se hizo de cierta forma) y en documentación de auditoría bajo `docs/` (`MASTER_STRATEGY.md`, `SCHEMA.md`, reportes de fechas anteriores a la migración) — son snapshots de una arquitectura pasada, no instrucciones a seguir; ante cualquier duda sobre el estado actual, `src/db/schema.ts` y el código en `src/app/`/`src/lib/` mandan sobre esos documentos.

## Git

Conventional commits: `<type>: <descripción>` — tipos `feat, fix, refactor, docs, test, chore, perf, ci`.

## Despliegue

Build de producción: `bun run build` (Next.js); servir con `bun run start` (`next start`) detrás de un reverse proxy (nginx/Caddy) con TLS. `next.config.ts` fija `serverExternalPackages: ["@node-rs/argon2", "postgres"]` para que esos paquetes nativos no se bundleen. Postgres corre en Docker (`docker-compose.yml`) tanto en desarrollo como se espera en el VPS de producción.

## Recursos

- Next.js App Router: https://nextjs.org/docs/app
- Drizzle ORM: https://orm.drizzle.team/docs
- shadcn/ui: https://ui.shadcn.com

## Notas de supply-chain

- **Dependencia `xlsx` desde CDN**: La dependencia `xlsx` en `package.json` apunta directamente al CDN oficial de SheetJS (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`) debido a que la versión oficial dejó de actualizarse en el registro público de npm. Esta práctica es invisible para herramientas automáticas como `npm audit` y `Dependabot`. Se acepta el riesgo de supply-chain en esta dependencia dado que `bun.lock` fija explícitamente un hash de integridad SHA-512 (`sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==`), previniendo cualquier alteración del tarball sin detección.
