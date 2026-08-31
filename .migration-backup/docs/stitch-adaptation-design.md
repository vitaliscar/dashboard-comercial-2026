# Adaptación Stitch — Auditoría Completa y Plan de Diseño

## Contexto

El proyecto ya tiene un sistema de diseño oscuro/ámbar "Stitch-adapted" (`src/styles.css`, tokens OKLCH) y un shell (`src/components/app-shell.tsx`) que replican parcialmente 6 mockups HTML generados con Google Stitch (dashboard ejecutivo, cobranzas+minutas, pareto 80/20, carga de datos, vista de gerente de BU, vista personal de asesor). Todas las rutas (~15 archivos) ya tienen lógica de datos real conectada a Supabase.

Esta no es una reconstrucción desde cero: es una auditoría de fidelidad visual/estructural contra ese sistema ya establecido, seguida de una corrección dirigida. **Toda la lógica de datos, hooks y queries existentes se conservan intactos** — solo se ajusta maquetación, componentes compartidos y estilos.

Se auditaron 20+ archivos con 7 agentes en paralelo, agrupados por dominio. Este documento consolida los hallazgos y define el plan de corrección.

## Decisiones de producto (ya resueltas con el usuario)

1. **Tema de `/sucursal`**: el override `.coordinator-dashboard-theme` (tema claro, colores shadcn genéricos) se **elimina**. `/sucursal` pasa a heredar el mismo tema oscuro ámbar que el resto de la app.
2. **Botones de header (`Upload Excel` / `Export PDF` / buscador)**: se implementan **funcionales**, no solo visuales. "Upload Excel" navega a `/carga` (ya existe). "Export PDF" dispara una exportación real de la vista actual — requiere elegir una librería (candidatos: impresión nativa del navegador vía `window.print()` con un stylesheet `@media print` dedicado, o `html2canvas` + `jsPDF` para un PDF real desde el DOM). Esta decisión técnica se resuelve en la fase de planificación/implementación, no en este spec.
3. **Ilustraciones de `GoalFeedback.tsx`** (ambulancia/camión/cohete): se **conservan** — son un detalle de personalidad intencional, no una desviación a corregir.

## Bugs críticos (independientes del resto — deben corregirse primero)

Estos no son desvíos de estilo: rompen funcionalidad hoy mismo.

1. **`src/routes/_app/resumen.tsx`** (línea ~566-591): renderiza `<KpiCard>` con props y variables que no existen en el archivo (`money`, `facturado`, `cotizado`, `ventasPerdidas`, `facturadoPorcentaje`, `ventasPerdidasPorcentaje`, íconos `TrendingUp`/`ClipboardList`/`XOctagon` no importados). El componente correcto ya existe y funciona: `src/components/resumen/KpiCards.tsx`. Acción: reemplazar el bloque muerto por `<KpiCards cotizado={...} facturado={...} .../>`.
2. **`src/components/status-pill.tsx`** (línea ~16): pasa `variant={kind}` (`"success" | "warning" | "danger"`) a `Badge`, pero `badgeVariants` en `src/components/ui/badge.tsx` no define esos variants (solo `default | secondary | destructive | outline | ghost | link`). Esto es un error de TypeScript confirmado y, en la práctica, **todo `StatusPill` no-neutral se renderiza hoy sin color/borde** — afecta `BranchSummaryTable`, `UnitHeatmapMatrix`, `minutas.tsx`, `cobranzas.tsx`. Acción: agregar variants `success`/`warning`/`danger` a `badgeVariants` que apliquen las utilities `status-success`/`status-warning`/`status-danger` ya existentes en `styles.css`, o hacer que `StatusPill` aplique esas clases directamente sin pasar por `Badge`.
3. **`src/routes/_app/alertas.tsx`** (línea ~222): `severityClass()` devuelve el string literal `"status-neutral"` para severidad `"baja"`, pero esa clase no existe en ningún lado — las alertas de severidad baja se renderizan sin ningún estilo de estado. Acción: mapear a una utility real (`status-success` o una nueva `status-neutral` si se decide crearla) y usar `StatusPill` en vez de markup manual (línea ~315-320).

## Capa compartida (shell + primitivos) — cambios que se propagan a toda la app

Por ser la superficie más reusada, estos cambios tienen el mayor apalancamiento: cada corrección aquí arregla el mismo problema en 10+ rutas a la vez.

### `src/components/app-shell.tsx`

- Agregar al header: buscador, botones "Upload Excel" (→ `/carga`) y "Export PDF" (exportación real, ver decisión #2), íconos de notificaciones/historial — hoy solo sobrevive el punto "Online" estático.
- Filtrar la fila de navegación secundaria (National/Regional/Branch → hoy "Resumen/Gerencia/Coordinador" hardcodeada) por `canAccessModule(role, ...)`, igual que ya se hace con `items` en el sidebar. Hoy un `asesor` ve y puede clickear rutas a las que no tiene acceso — inconsistente con el modelo de autorización de tres capas documentado en `CLAUDE.md`.
- Reemplazar la cadena de `{loc.pathname === "/x" && "Label"}` (título de página, solo cubre 9 de ~18 rutas reales) por un lookup (`Record<string, string>`) con cobertura completa.
- Crear un primitivo compartido `PageHeader` (eyebrow mono-uppercase + título) para que cada ruta deje de armar su encabezado a mano — hoy `resumen.tsx` y `gerencia-nacional.tsx` (y probablemente el resto) no tienen el "eyebrow" de los mockups precisamente porque no existe este componente.
- El chip de rol al pie del sidebar pasa a usar `StatusPill`/badge con borde+tinte en vez de un `<div>` plano.
- Eliminar la lógica de `.coordinator-dashboard-theme` (`isCoordinatorDashboard`, línea ~69/79) — ver decisión #1.

### `src/components/kpi-card.tsx`

- Migrar de `bg-card border border-border p-5` (sin radio) a la utility `card-elevated` para unificar con el resto del sistema.
- La variante `featured` debe aplicar `card-elevated-2` + la utility `bento-feature` (grid-span), no solo agrandar la tipografía — hoy no implementa realmente la celda "bento" grande que sugieren los mockups.

### `src/components/status-pill.tsx` + `src/components/ui/badge.tsx`

- Corregir el bug de variants (ver bug crítico #2).
- `badge.tsx` sigue siendo el default de shadcn (`rounded-4xl`, relleno sólido en `default`/`secondary`) — contradice el patrón de pill con borde+tinte. Cualquier ruta que use `<Badge>` directamente en vez de `<StatusPill>` rompe el patrón visual. Alinear el radio (evitar `rounded-full`/`rounded-4xl` salvo casos circulares reales) y asegurar que los variants de estado deriven de las utilities `status-*`.

### `src/components/ui/card.tsx`

- Es el shadcn default (`rounded-xl` + `ring-1 ring-foreground/10`), un tercer idioma de "tarjeta" distinto de `card-elevated` y de `kpi-card.tsx`. Alinear su className a `card-elevated` (borde + sombra suave, radio boxy) para que cualquier ruta que use `<Card>` sin pensarlo quede consistente con el resto.

### `src/routes/__root.tsx`

- `<html lang="en">` debería ser `lang="es"` (toda la UI está en español).
- JetBrains Mono se carga desde Google Fonts CDN mientras Geist se autohospeda vía `@fontsource-variable/geist` — inconsistente, y JetBrains Mono se usa en todos los valores numéricos de la app. Autohospedar también JetBrains Mono.
- `NotFoundComponent`/`ErrorComponent` arman botones a mano en vez de reusar `Button` de `ui/button.tsx`.

### Patrón sistémico: tooltips de Recharts

~20 ocurrencias en 5+ archivos (`sucursal.tsx`, `equipos.tsx`, `servicios.tsx`, `lubfiltros.tsx`, `alquiler.tsx`, `asesor.tsx`) usan `<Tooltip contentStyle={{..., borderRadius: 8}}>` hardcodeado en vez de `ChartContainer`/`ChartTooltipContent` (`src/components/ui/chart.tsx`), que ya siguen el radio boxy correcto (4px) y que `src/components/coordinador/*.tsx` ya usa correctamente. Migrar todos los tooltips ad-hoc a la abstracción existente — es el cambio de mayor apalancamiento en esta categoría porque también resuelve, de paso, los arrays `PIE_COLORS` hardcodeados duplicados en 3+ archivos.

### Patrón sistémico: encabezados de tabla

6+ rutas (`equipos`, `servicios`, `lubfiltros`, `alquiler`, `usuarios`, `pipeline`, más `ReceivablesTable.tsx`) usan relleno sólido `bg-primary` ámbar en encabezados de tabla — contradice el propio principio documentado en el header de `styles.css` ("ámbar reservado para énfasis... no decoración"). Definir un tratamiento de encabezado de tabla único (candidato: el que ya usa `ui/table.tsx`'s `TableHead` — mono, uppercase, `text-muted-foreground`, sin relleno sólido) y aplicarlo consistentemente.

## Hallazgos por ruta (agrupados, ya priorizados)

### Alta prioridad (además de los bugs críticos)

- **`minutas.tsx`**: es una tabla CRUD plana; el mockup pide una composición bento (panel ancho de "minuta activa" con checklist/avatares + tarjetas de compromiso/calendario/estado). Mayor brecha estructural encontrada.
- **`asesor.tsx`**: mismo problema — grid uniforme en vez de la composición bento personal (portfolio de clientes con avatares, gauge circular de score, agenda del día con borde de color por franja horaria, distribución geográfica). Sin encabezado personalizado (nombre + frase italic).
- **`pareto.tsx`**: la utility `pareto-80` (creada específicamente para esta página) no se usa en ningún lado. Los 3 KPI de resumen y el chip de clasificación A/B/C están hechos a mano en vez de reusar `KpiCard`/`StatusPill`.
- **`auth.tsx`** (login): panel izquierdo en `bg-white` genérico (contradice el tema oscuro de toda la app), ámbar hardcodeado como `#f0a21d` literal 5 veces en vez de `var(--primary)`.

### Media prioridad

- `cobranzas.tsx`: falta la grilla de 5 buckets de antigüedad con barra de progreso individual (el mockup la pide); "61-90 días" y "+90 días" comparten el mismo nivel de urgencia visual cuando no debería.
- `carga.tsx`: falta el panel de estado del sistema (conexión DB/latencia/capacidad con punto pulsante), sin barra de progreso durante la carga por chunks, sin modal de confirmación antes de sincronizar.
- `coordinador.tsx`/`sucursal.tsx`/`equipos.tsx`/`servicios.tsx`/`lubfiltros.tsx`/`alquiler.tsx`: KPIs armados a mano en vez de `KpiCard`, sin composición bento (una celda ancla + celdas de apoyo), colores de pie chart hardcodeados y no usados (código muerto) en 3 archivos.
- `alertas.tsx`: 4 tarjetas de totales a mano en vez de `KpiCard`.
- `GoalFeedback.tsx` (SVGs ilustrados): confirmado intencional, no se toca.

### Baja prioridad / conservar

- `pipeline.tsx`, `usuarios.tsx`, `dashboard.tsx`, `_app.tsx`, `index.tsx`: sin desvíos significativos.
- Componentes de `src/components/coordinador/*` y la mayoría de `src/components/gerencia-nacional/*`: ya son la implementación de referencia correcta — usar como modelo al corregir sus rutas hermanas.

## Fuera de alcance de esta pasada

- Rediseño de contenido/datos mostrados por vista (el usuario confirmó: se conserva toda la lógica de datos existente).
- Cambios a RLS/Supabase.
- Íconos de "Support" en el sidebar (presente en mockups, ausente hoy) — se deja como nota, no como requisito de esta pasada, salvo que el usuario lo pida explícitamente al ver el plan.

## Secuencia de implementación propuesta

1. **Bugs críticos** (resumen.tsx, status-pill.tsx, alertas.tsx) — independientes, alto impacto, base para que el resto del trabajo se vea bien.
2. **Capa compartida** (app-shell, kpi-card, status-pill/badge, ui/card, PageHeader nuevo, \_\_root.tsx) — todo lo demás depende de que esta capa esté correcta primero.
3. **Patrones sistémicos** (tooltips Recharts → ChartContainer, encabezados de tabla) — aplican en paralelo sobre varios archivos ya que es el mismo cambio mecánico repetido.
4. **Rutas de alta prioridad** (minutas, asesor, pareto, auth).
5. **Rutas de media prioridad** (cobranzas, carga, coordinador/sucursal/equipos/servicios/lubfiltros/alquiler, alertas).
6. **Verificación visual**: correr la app y revisar cada ruta en el navegador (breakpoints clave) antes de dar por cerrada la adaptación.
