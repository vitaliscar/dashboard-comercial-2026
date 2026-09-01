# Dashboard Comercial

Centro de decisiones comerciales para visualizar ventas, metas, cartera, oportunidades y rendimiento por unidad de negocio.

## Run & Operate

- `pnpm --filter @workspace/dashboard-comercial run dev` — ejecutar la aplicación web mediante su workflow
- `pnpm --filter @workspace/dashboard-comercial run typecheck` — validar el frontend migrado
- `pnpm --filter @workspace/api-server run dev` — ejecutar el API compartido
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- El frontend actual no requiere variables de entorno para abrir la experiencia ejecutiva.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod 3, `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/dashboard-comercial/` — aplicación web React + Vite.
- `artifacts/dashboard-comercial/src/App.tsx` — rutas, navegación y experiencia ejecutiva.
- `artifacts/dashboard-comercial/src/styles.css` — identidad visual y tokens del dashboard importado.
- `.migration-backup/` — copia intacta del proyecto Vercel original y sus módulos de datos.
- `artifacts/api-server/` — API Express compartida disponible para la siguiente fase de integración.

## Architecture decisions

- El frontend se sirve con Vite y Wouter; no depende del runtime de Next.js.
- La copia completa del código importado se conserva para migrar módulos de datos de forma incremental sin perder lógica original.
- El dashboard usa una experiencia oscura, densa y orientada a decisiones, conservando la identidad visual de CCV.

## Product

- Resumen ejecutivo de facturación, cumplimiento, pipeline y cartera en riesgo.
- Priorización diaria de riesgos y oportunidades.
- Navegación responsive por gestión comercial, finanzas, crecimiento, unidades de negocio y administración.
- Vistas accesibles desde escritorio y móvil.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
