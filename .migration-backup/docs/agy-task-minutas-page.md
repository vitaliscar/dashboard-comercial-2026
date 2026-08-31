# Tarea para agy.exe

=== PROMPT PARA agy.exe — TAREA MINUTAS PAGE ===

Estás en el repo `D:\dev\Dashboard Comercial 2026\dashboard-comercial-2026` (Next.js 16 App Router, React 19, TS, Tailwind v4, shadcn/ui, TanStack Query, Drizzle). Lee `CLAUDE.md` en la raíz para contexto de arquitectura antes de tocar nada.

CONTEXTO: El modelo de datos y los server actions de `minutas` YA fueron rediseñados en esta sesión (no los toques, ya están completos y correctos):

- `src/db/schema.ts`: tabla `minutas` ahora tiene `destinatarioId` (uuid FK a `users`, obligatorio, reemplaza el viejo `responsable`/`responsableId` de texto libre) y `cliente` ahora es opcional (nullable). Nuevas tablas: `minutaComentarios` (hilo de comentarios: `minutaId`, `autorId`, `texto`, `createdAt`), `alertas` (persistidas, con `estado` abierta/resuelta), `minutaAlertas` (tabla puente N:N entre minutas y alertas).
- `src/lib/actions/minutas.ts` ya expone: `getMinutasAction()` (devuelve minutas con `comentarios[]` y `alertas[]` embebidos, ya filtradas por RLS según el rol/scope del usuario actual), `getDestinatariosDisponiblesAction()` (devuelve `{id, nombreCompleto, role, sucursalId, unidadNegocioId}[]` — los destinatarios válidos para el rol actual: coordinador→asesores de su sucursal, gerente_comercial→coordinadores de su unidad, gerencia→todos), `searchClientesAction(q: string)` (autocompletado de nombres de cliente, devuelve `string[]`, requiere mínimo 2 caracteres), `createMinutaAction(data)` (requiere `fecha, destinatarioId, cliente: string|null, descripcion, fechaLimite, sucursalId, unidadNegocioId, estado, createdBy, alertaIds: string[]`), `updateMinutaAction(id, data)` (requiere `descripcion, fechaLimite, estado, updatedBy` — ya NO acepta cambiar destinatario/cliente/alertas después de creada), `deleteMinutaAction(id)`, `addComentarioAction(minutaId, texto)`.
- `src/lib/actions/alertas.ts` ya expone `getAlertasAction()` — devuelve alertas abiertas `{id, tipo, severidad, titulo, contexto: {detalle, monto?, accion?}, sucursalId, unidadNegocioId, asesorId}[]`, y `resolveAlertaAction(alertaId)`.

REGLAS DE NEGOCIO que la UI debe reflejar (YA implementadas en RLS/server, tu trabajo es solo que la UI las respete):

- Rol `asesor`: NUNCA puede crear minutas. Solo ve las minutas donde él es destinatario (RLS ya filtra esto — no hace falta filtrar en cliente). Puede agregar comentarios a sus propias minutas (usa `addComentarioAction`). NO puede cambiar el `estado` de una minuta.
- Roles `coordinador`, `gerente_comercial`, `gerencia`: pueden crear minutas (botón "Nueva minuta"), ven en cascada las minutas de su equipo (RLS ya lo resuelve), pueden editar `estado`/`descripcion`/`fechaLimite` de minutas existentes, pueden eliminar SOLO si son `gerencia`.
- El campo cliente es opcional, con autocompletado (usa `searchClientesAction` con debounce ~300ms mientras el usuario escribe, mínimo 2 caracteres, muestra sugerencias en un dropdown simple — no hace falta un componente Combobox complejo, un `Input` + lista absolute-positioned con las sugerencias alcanza).
- Al crear una minuta: el usuario elige un destinatario de la lista de `getDestinatariosDisponiblesAction()` (un `Select` normal, ya existe el componente `@/components/ui/select` usado en el resto del archivo viejo). Al elegir el destinatario, autocompletar `sucursalId`/`unidadNegocioId` del formulario con los del destinatario elegido (vienen en el objeto que devuelve `getDestinatariosDisponiblesAction`) — el usuario NO debe elegir sucursal/unidad manualmente.
- El formulario de creación también debe dejar seleccionar (checkboxes) cero o más alertas abiertas relevantes para adjuntar a la minuta (`alertaIds`) — filtra las alertas de `getAlertasAction()` mostrando solo las que tengan `asesorId === destinatarioId` seleccionado O `sucursalId === sucursalId` del destinatario seleccionado. Muestra `titulo` + badge de `severidad` de cada alerta candidata.
- Cada minuta en la lista, al expandirse (click en la fila o un botón "Ver detalle"), debe mostrar: descripción completa, las alertas enganchadas (título + severidad + botón "Marcar resuelta" que llama a `resolveAlertaAction` — SOLO visible si el rol actual no es `asesor`), el hilo de comentarios (autor + fecha + texto), y si el usuario actual es el destinatario de ESA minuta (`m.destinatarioId === user.id`, comparar con `useAuth().user.id`), mostrar un textarea + botón "Agregar comentario" que llama a `addComentarioAction` e invalida la query.

ARCHIVO A REESCRIBIR POR COMPLETO: `src/app/(app)/minutas/page.tsx`.

Antes de escribir, LEE el archivo actual completo para entender el estilo/patrones existentes: imports de shadcn (`@/components/ui/dialog`, `/select`, `/button`, `/input`, `/textarea`, `/label`, `/table`, `/alert-dialog`, `/empty`), el componente `StatusPill`/`estadoLabel`/`estadoKind` de `@/components/status-pill`, `KpiCard` de `@/components/kpi-card`, `PageHeader` de `@/components/page-header`, `PageSkeleton` de `@/components/ui/page-skeleton`, y el patrón de `useMutation`+`toast` (sonner) que ya usa el archivo para crear/editar/borrar. Mantén el mismo estilo visual/estructura general (KPIs arriba, filtro de sucursal, tabla con Dialog para crear/editar) pero adaptado al nuevo modelo. Los KPIs de arriba (Total/Pendientes/En proceso/Cumplimiento) se mantienen igual, solo cambia el origen de los datos.

REGLAS DE ESTILO DEL PROYECTO (obligatorias — lee `CLAUDE.md` y sigue el patrón ya usado en el resto de `src/app/(app)/*`):

- `"use client"` en la línea 1.
- No usar `any`. Tipar explícito.
- Sin comentarios explicativos innecesarios en el código nuevo.
- Sigue el patrón de gate de carga inicial: `if (isLoading && !minutas) return <PageSkeleton .../>` (ya existe en el archivo actual, mantenlo).
- No inventes componentes UI nuevos si ya existe uno equivalente en `src/components/ui/`.

AL TERMINAR:

1. Corre `bunx tsc --noEmit` y arregla cualquier error de tipos que hayas introducido en este archivo (no arregles errores preexistentes de otros archivos que no tocaste).
2. Corre `bun run lint` (puede tardar varios minutos en este repo, es normal) y arregla lo que tú introdujiste.
3. Reporta en tu respuesta final: qué decisiones de UI tomaste que no estaban 100% especificadas arriba, y cualquier error de tsc/lint que haya quedado sin resolver.

No toques ningún otro archivo. No hagas commit. No modifiques `src/lib/actions/minutas.ts`, `src/lib/actions/alertas.ts`, ni `src/db/schema.ts` — ya están terminados.

=== FIN PROMPT TAREA MINUTAS PAGE ===
