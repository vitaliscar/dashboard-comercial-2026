# Resumen: Dashboard Comercial 2026 — arquitectura, dependencias y despliegue en VPS

## Qué hace la aplicación

Panel de análisis comercial/ventas para CCV. Centraliza en un solo dashboard web
la información que hoy vive en el Excel "CCV Rendimiento.xlsx" (cotizaciones,
facturas, ventas perdidas, presupuestos, cobranzas, servicios, equipos,
cumplimiento por asesor, mercadeo) y la presenta por rol de negocio:

- **Gerencia** (`gerencia`, `gerente_comercial`): vista nacional consolidada,
  ranking de sucursales, cumplimiento de metas, módulo de Mercadeo (canales
  digitales, Instagram, Google My Business, clientes potenciales/leads).
- **Coordinador**: vista de su unidad de negocio (servicios, lubricantes y
  filtros, o equipos según la UN que coordine) o de su sucursal.
- **Asesor**: su propio desempeño (cotizaciones, facturado, ventas perdidas,
  comisiones).

Módulos adicionales: cobranzas, minutas de reunión, análisis de Pareto 80/20,
alertas, cliente 360°, embudo de ventas, simulador de escenarios, carga de
datos (Excel → Postgres) y administración de usuarios.

La fuente de datos original es un archivo Excel que se carga a una base
Postgres; la app en sí solo lee de Postgres, nunca del Excel directamente en
cada request. **En este despliegue la carga será solo manual**, vía el botón
"Cargar Excel" del módulo `/carga` (ver detalle más abajo) — el workflow
automático semanal de GitHub Actions no se usará.

## Cómo está hecha (arquitectura)

- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript, todo en
  `src/app/`. Rutas protegidas bajo `(app)/`, login público bajo `(auth)/`.
- **UI**: Tailwind CSS v4 + shadcn/ui (Radix + base-ui), gráficos con Recharts,
  logo 3D con three.js/@react-three/fiber.
- **Datos en cliente**: TanStack Query para data-fetching/caché en Client
  Components; formularios con React Hook Form + Zod.
- **Backend**: no hay API REST separada — todo pasa por **Server Actions**
  de Next.js (`"use server"`), organizadas en `src/lib/actions/`.
- **Base de datos**: PostgreSQL 18 + Drizzle ORM (`src/db/schema.ts` es la
  fuente de verdad del esquema). **RLS (Row-Level Security) nativo de
  Postgres** aplica el scope por rol/sucursal — no hay lógica de permisos de
  datos en el código de las queries.
- **Autenticación**: sesiones propias por cookie httpOnly (sin Supabase, sin
  NextAuth). Passwords con `argon2`. Dos roles de conexión a Postgres:
  - `app_admin` (BYPASSRLS): migraciones, carga de Excel, lectura de sesión.
  - `app_user` (sin bypass): sirve todas las requests de negocio; el scope se
    fija con `SET LOCAL app.current_role/current_user_id/current_sucursal_id`
    dentro de una transacción (`withAuth`, ver `src/lib/actions/with-auth.ts`).
- **Gestor de paquetes**: Bun (`bun.lock`), aunque `next build`/`next start`
  también corren con Node en producción.
- **Postgres corre en Docker** (`docker-compose.yml`) tanto en desarrollo
  como en producción — no es un Postgres gestionado externo por defecto.
- **Carga de datos**: `src/db/load-excel.ts` (`loadExcelToPostgres`) reemplaza
  (delete + insert) las tablas objetivo a partir del Excel, usando `dbAdmin`
  (BYPASSRLS). Dos formas de dispararlo, ambas llaman al mismo loader:
  - **Manual (la que se usará en este despliegue)**: botón "Cargar Excel" en
    `/carga` → Server Action `uploadExcelAction`
    (`src/lib/actions/carga.ts`). Solo el rol `gerencia` lo ve/ejecuta; el
    archivo se sube desde el navegador y se procesa **dentro del propio
    proceso de Next.js del VPS** — no sale del servidor ni depende de GitHub.
  - **Automática por cron (no se usará)**: `scripts/run-full-load.ts` vía
    `.github/workflows/weekly-excel-load.yml`, corriendo en los runners de
    GitHub Actions contra `DATABASE_URL`/`DATABASE_ADMIN_URL` configurados
    como secrets del repo.
- **Migraciones**: parte generadas por Drizzle (`src/db/migrations/`), parte
  escritas a mano (`src/db/migrations-manual/`) para RLS policies y un fix de
  drift de esquema (`0003_schema_drift_fix.sql`) — no hay un comando único
  "migrate", se aplican los `.sql` en orden (ver `CLAUDE.md` del repo).

## Dependencias necesarias

### Runtime del servidor (VPS)

- **Bun** (gestor de paquetes usado en desarrollo; `bun.lock` es la fuente de
  verdad de versiones) y/o **Node.js LTS** para ejecutar `next start` en
  producción — confirmar cuál usa el pipeline de build actual antes de fijar
  la versión en el VPS.
- **Docker + Docker Compose**: para levantar Postgres 18 vía
  `docker-compose.yml`.
- **Reverse proxy con TLS**: nginx o Caddy delante de `next start` (el propio
  `CLAUDE.md` del repo lo indica como forma esperada de servir producción).

### Paquetes nativos que NO deben bundlearse

`next.config.ts` ya fija `serverExternalPackages: ["@node-rs/argon2",
"postgres"]`. Verificar en el VPS que las librerías nativas (`@node-rs/argon2`,
`argon2`) tengan sus binarios/toolchain compatibles con la arquitectura del
servidor (glibc vs musl, x64 vs arm64).

### Dependencia de supply-chain a vigilar

`xlsx` se instala directamente desde el CDN oficial de SheetJS (no desde el
registro npm), porque la versión pública dejó de actualizarse:

```
https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
```

Esto es invisible para `npm audit`/Dependabot. El VPS necesita salida a
internet hacia `cdn.sheetjs.com` en el momento del `bun install`, o bien
tener el tarball cacheado/verificado localmente (el hash SHA-512 está fijado
en `bun.lock`).

### Variables de entorno requeridas

```env
DATABASE_URL=postgresql://app_user:<pw>@<host>:<port>/dashboard_comercial
DATABASE_ADMIN_URL=postgresql://app_admin:<pw>@<host>:<port>/dashboard_comercial
POSTGRES_USER=...
POSTGRES_PASSWORD=...
POSTGRES_DB=dashboard_comercial
POSTGRES_PORT=55432   # o el que se use en el VPS
```

`DATABASE_URL` usa el rol `app_user` (sin bypass de RLS) — es el que sirve
tráfico real. `DATABASE_ADMIN_URL` usa `app_admin` (BYPASSRLS) — solo para
migraciones y carga de Excel. Nunca intercambiar los dos.

## Cómo configurar el VPS para producción

1. **Preparar el host**
   - Instalar Docker + Docker Compose.
   - Instalar Bun (y/o Node LTS, confirmar según cómo se ejecute el build).
   - Instalar nginx o Caddy y configurar TLS (Let's Encrypt).

2. **Clonar el repo y configurar entorno**
   - `git clone` del repo en el VPS.
   - Crear `.env.local` con las variables de entorno de producción (no
     commitear este archivo — está en `.gitignore`).
   - Si el puerto 5432/5433 de Postgres puede chocar con un Postgres nativo
     del sistema, ajustar el mapeo de puerto en `docker-compose.yml` y en
     `.env.local` a la vez (igual que se documenta para desarrollo local).

3. **Levantar Postgres**

   ```bash
   docker compose up -d
   ```

   Esto crea el volumen `postgres_data` y ejecuta una sola vez
   `docker/postgres-init/00-roles.sql`, que crea los roles `app_admin`
   (BYPASSRLS) y `app_user` (sin bypass).

4. **Aplicar migraciones en orden** (ver el bloque completo de comandos en
   `CLAUDE.md` del repo — deben aplicarse en la secuencia exacta documentada
   ahí, mezclando migraciones generadas y manuales, todas como `app_admin`).

5. **Cargar los datos iniciales desde el Excel**
   Para la primera carga (antes de tener la app corriendo) se puede usar la
   CLI una sola vez:

   ```bash
   bun install
   bun run load-excel   # alter-schema + carga completa desde el .xlsx
   ```

   Las cargas siguientes se harán **siempre desde el botón "Cargar Excel"**
   en `/carga`, ya con la app desplegada — solo necesita que el rol
   `gerencia` tenga sesión iniciada, no requiere acceso por SSH ni CLI.

6. **Build y arranque de la app**

   ```bash
   bun install
   bun run build
   bun run start   # next start; detrás de nginx/Caddy con TLS
   ```

   Mantener el proceso vivo con un supervisor (pm2, systemd o similar) —
   el repo no trae uno configurado por defecto.

7. **Carga semanal automática: NO se usará**
   El workflow `.github/workflows/weekly-excel-load.yml` queda sin
   configurar (sin secrets `DATABASE_URL`/`DATABASE_ADMIN_URL` de GitHub) o,
   mejor, **deshabilitado** para que no falle solo ni abra issues cada
   semana en el repo. Deshabilitarlo desde GitHub → Actions → el workflow →
   "..." → "Disable workflow", o borrar el trigger `schedule:` del archivo
   dejando solo `workflow_dispatch` si se quiere conservar la opción manual
   vía GitHub como respaldo.

   Consecuencia directa para la red del VPS: **el puerto de Postgres no
   necesita quedar expuesto a internet**. El mapeo en `docker-compose.yml`
   puede quedarse como está (`127.0.0.1:${POSTGRES_PORT}:5432`), porque tanto
   la app como el botón de carga corren dentro del mismo servidor y hablan
   con Postgres por loopback. Esto simplifica el firewall del VPS: solo hace
   falta abrir 80/443 (nginx/Caddy) hacia afuera; Postgres se queda cerrado.

8. **Verificación post-despliegue**
   - `src/app/api/health/route.ts` expone un endpoint de salud — usarlo para
     el healthcheck del reverse proxy o de un monitor externo.
   - Confirmar que `presupuestos` (facturado real) solo tiene datos hasta el
     último mes cerrado en el Excel — un KPI en $0 para el mes actual no es
     un bug si ese mes aún no se cerró en la fuente.

## Puntos a decidir con el usuario antes de desplegar

- ¿El VPS ejecuta el build/arranque con **Bun** o con **Node**? El
  `package.json` no lo fuerza explícitamente.
- ¿Quién administra el supervisor de proceso (pm2/systemd) y los logs?
- ~~¿El puerto de Postgres del VPS quedará expuesto a internet?~~ **Resuelto:
  la carga será solo manual (botón en `/carga`), así que Postgres se queda
  cerrado a internet (solo `127.0.0.1`) y el workflow de GitHub Actions se
  deshabilita.**
