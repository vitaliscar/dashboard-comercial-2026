# Tarea para agy.exe

=== PROMPT PARA agy.exe — TAREA ALERTAS PAGE ===

Estás en el repo `D:\dev\Dashboard Comercial 2026\dashboard-comercial-2026` (Next.js 16 App Router, React 19, TS, Tailwind v4, shadcn/ui, TanStack Query, Drizzle). Lee `CLAUDE.md` en la raíz para contexto de arquitectura antes de tocar nada.

CONTEXTO: Las alertas del dashboard pasaron de calcularse al vuelo en el cliente a persistirse en base de datos (tabla `alertas`, con ciclo de vida abierta/resuelta), para poder engancharlas a minutas. Este trabajo de backend YA está completo (no lo toques):

- `src/lib/actions/alertas.ts` expone `getAlertasAction()` — recalcula/reconcilia server-side (abre nuevas, reabre las que vuelven a cumplirse, cierra automáticamente las que ya no aplican) y devuelve las alertas ABIERTAS visibles para el usuario actual (RLS ya scopea por sucursal/unidad/asesor): `{id, tipo, severidad, titulo, contexto: {detalle: string, monto?: number, accion?: string} | null, sucursalId, unidadNegocioId, asesorId, estado, resueltaManualmente}[]`. `tipo` es uno de: `"cobranzas" | "ventas_perdidas" | "minutas" | "cumplimiento" | "dependencia" | "cotizacion_factura" | "cotizaciones_viejas"`. `severidad` es `"alta" | "media" | "baja"`.
- `resolveAlertaAction(alertaId: string)` en `src/lib/actions/minutas.ts` — marca una alerta como resuelta manualmente. Internamente ya rechaza el rol `asesor` (lanza error), así que en la UI simplemente hay que ocultar/deshabilitar el botón de resolver para ese rol por UX, pero no hace falta validación extra en cliente.
- Para "crear una minuta desde alertas seleccionadas": ya existe `getDestinatariosDisponiblesAction()` y `createMinutaAction(data)` en `src/lib/actions/minutas.ts` — `createMinutaAction` acepta `alertaIds: string[]` para enganchar las alertas elegidas a la minuta nueva. Firma completa de `createMinutaAction`: `{fecha, destinatarioId, cliente: string|null, descripcion, fechaLimite, sucursalId, unidadNegocioId, estado, createdBy, alertaIds}`.

ARCHIVO A REESCRIBIR POR COMPLETO: `src/app/(app)/alertas/page.tsx`.

Antes de escribir, LEE el archivo actual completo (usa `getAlertasSourcesAction` viejo — YA NO EXISTE, fue reemplazado por `getAlertasAction`, así que el cálculo de alertas en el `useMemo` del cliente debe eliminarse por completo; los datos ya vienen calculados y filtrados del server). Mantén el resto del estilo visual: KPIs de resumen (alta/media/baja), `FilterHeader` para filtrar por sucursal/unidad (ahora filtra sobre `alertas` ya traídas: comparar `a.sucursalId`/`a.unidadNegocioId` contra los filtros seleccionados en cliente, ya no hace falta pasarle el filtro al server ya que `getAlertasAction` no toma parámetros), tabla de alertas con `StatusPill` de severidad.

CAMBIOS FUNCIONALES A AGREGAR:

1. Cada fila de la tabla de alertas debe tener un checkbox de selección (estado `selectedIds: string[]` en el componente).
2. Cuando hay 1+ alertas seleccionadas, mostrar una barra de acción (fixed/sticky o simplemente un bloque arriba de la tabla) con el conteo de seleccionadas y un botón "Crear minuta con estas alertas" — SOLO visible para roles que no sean `asesor` (usa `useAuth().role`).
3. Ese botón abre un `Dialog` (usa `@/components/ui/dialog`, ya se usa en otras páginas del proyecto como `src/app/(app)/minutas/page.tsx` — mira ese archivo como referencia de patrón, YA fue reescrito en esta sesión con el nuevo modelo, es la referencia más actualizada del proyecto) con un formulario mínimo: selector de destinatario (`Select` con las opciones de `getDestinatariosDisponiblesAction()`), cliente (opcional, texto libre simple, no hace falta autocompletado acá), descripción (textarea, puede pre-rellenarse con un resumen tipo "Atacar N alertas: <títulos separados por coma>"), fecha límite opcional. Al enviar, llama `createMinutaAction` con `alertaIds` = las seleccionadas, `sucursalId`/`unidadNegocioId` tomados del destinatario elegido (igual patrón que en `/minutas`), muestra `toast.success` (sonner) y limpia la selección.
4. Cada fila (o al expandir detalle) debe tener un botón individual "Marcar resuelta" que llama a `resolveAlertaAction(alerta.id)` con una mutation de TanStack Query que invalida la query de alertas al terminar — oculto para rol `asesor`.

REGLAS DE ESTILO DEL PROYECTO (obligatorias):

- `"use client"` en la línea 1.
- No usar `any`. Tipar explícito.
- Sin comentarios explicativos innecesarios en el código nuevo.
- Gate de carga inicial con `PageSkeleton` (patrón ya usado en el resto de `src/app/(app)/*`, y ya estaba en el archivo viejo de alertas).
- No inventes componentes UI nuevos si ya existe uno equivalente en `src/components/ui/`.

AL TERMINAR:

1. Corre `bunx tsc --noEmit` y arregla cualquier error de tipos que hayas introducido en este archivo (no arregles errores preexistentes de otros archivos que no tocaste, p. ej. si `/minutas/page.tsx` todavía tiene errores de otra tarea en curso, ignóralos).
2. Corre `bun run lint` (puede tardar varios minutos en este repo, es normal) y arregla lo que tú introdujiste.
3. Reporta en tu respuesta final: qué decisiones de UI tomaste que no estaban 100% especificadas arriba, y cualquier error de tsc/lint que haya quedado sin resolver.

No toques ningún otro archivo. No hagas commit. No modifiques `src/lib/actions/minutas.ts`, `src/lib/actions/alertas.ts`, `src/db/schema.ts`, ni `src/app/(app)/minutas/page.tsx` — no son tu tarea.

=== FIN PROMPT TAREA ALERTAS PAGE ===
