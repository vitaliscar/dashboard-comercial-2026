# AGENTS.md

Instrucciones mínimas para agentes de código en este repositorio.

## Inicio rápido

```bash
bun install
bun run dev
bun run lint
bun run test
bunx tsc --noEmit
```

## Reglas críticas

- No editar [src/routeTree.gen.ts](src/routeTree.gen.ts): archivo autogenerado.
- No mezclar clientes Supabase: usar [src/integrations/supabase/client.server.ts](src/integrations/supabase/client.server.ts) solo en contexto server.
- Si una ruta tiene guard por rol, declara todos los hooks antes del early return por permisos para evitar errores de orden de hooks.
- El esquema real se valida contra [src/integrations/supabase/types.ts](src/integrations/supabase/types.ts) y [docs/SCHEMA.md](docs/SCHEMA.md), no contra migraciones.
- No editar manualmente componentes generados en [src/components/ui](src/components/ui) salvo regeneración deliberada.

## Arquitectura a conocer antes de cambiar código

- Guía principal de arquitectura y flujo por roles: [CLAUDE.md](CLAUDE.md)
- Esquema y drift de base de datos: [docs/SCHEMA.md](docs/SCHEMA.md)
- Especificación funcional por vistas de rol: [docs/role-view-spec-v1.md](docs/role-view-spec-v1.md)
- Checklist de QA por vistas de rol: [docs/role-view-qa-checklist.md](docs/role-view-qa-checklist.md)

## Convenciones de trabajo para agentes

- Mantener cambios pequeños y enfocados; evitar refactors no solicitados.
- Para cambios de permisos/roles, actualizar de forma consistente:
  - [src/hooks/use-auth.tsx](src/hooks/use-auth.tsx)
  - [src/lib/permissions.ts](src/lib/permissions.ts)
  - [src/lib/data-scope.ts](src/lib/data-scope.ts)
- Verificar build/lint/tests antes de cerrar una tarea que modifique lógica.

## Comandos útiles adicionales

```bash
bun run build
bun run preview
bun run format
bun run test:excel
```
