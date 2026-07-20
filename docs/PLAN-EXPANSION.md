# Plan de Expansión — Dashboard Comercial 2026 (v2 — Realista)

> Versión corregida tras auditoría completa del código. Todo módulo nuevo usa la **misma
> lógica de datos** que `resumen.tsx` y los dashboards existentes: facturado = presupuestos
> (Ventas_CCV + Ventas_Xibi + Ventas_Estrategicas), cotizado = cotizaciones.monto (neto
> Lub/Filtros ya restado en el parser), ventas perdidas = ventas_perdidas.monto.

---

## 1. Lo que YA existe (no reinventar)

| Módulo                | Ruta                                   | Qué hace                                                                                                                                                                                                                                                 |
| --------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pipeline**          | `/pipeline`                            | Embudo por **etapa de cotización** (desarrollo → propuesta_negociacion → venta_perdida). Muestra cantidad y monto por etapa, caída entre etapas, y tabla de cotizaciones envejecidas (+30 días). **NO cruza fuentes** — solo trabaja con `cotizaciones`. |
| **Alertas**           | `/alertas`                             | Torre de control con alertas de: cobranzas vencidas, ventas perdidas recurrentes, minutas vencidas, y gap de run-rate de asesores. Tabla priorizada con severidad.                                                                                       |
| **Pareto**            | `/pareto`                              | 80/20 por cliente o asesor, con tabs cotizado/facturado/perdido.                                                                                                                                                                                         |
| **Cobranzas**         | `/cobranzas`                           | Aging buckets + tabla detallada con búsqueda.                                                                                                                                                                                                            |
| **Minutas**           | `/minutas`                             | CRUD completo de compromisos.                                                                                                                                                                                                                            |
| **Resumen**           | `/resumen`                             | KPIs + desglose por unidad de negocio (cotizado, facturado desde presupuestos, ventas perdidas).                                                                                                                                                         |
| **Gerencia Nacional** | `/gerencia-nacional`                   | Compliance gauge, heatmap sucursal×unidad, ranking de sucursales, meta vs venta.                                                                                                                                                                         |
| **Coordinador**       | `/coordinador`                         | Panel completo por sucursal con charts dedicados por unidad.                                                                                                                                                                                             |
| **Asesor**            | `/asesor`                              | Panel personal con radar de 5 ejes.                                                                                                                                                                                                                      |
| **DataTable**         | `src/components/resumen/DataTable.tsx` | Tabla simple con columnas configurables, expand/collapse. **Sin sorting, sin CSV export.**                                                                                                                                                               |
| **PDF Export**        | `app-shell.tsx`                        | `window.print()` con `@media print`.                                                                                                                                                                                                                     |
| **Combobox**          | `src/components/ui/combobox.tsx`       | Combobox con chips/multi-select (base-ui).                                                                                                                                                                                                               |
| **Sheet**             | `src/components/ui/sheet.tsx`          | Panel deslizable (base-ui Dialog).                                                                                                                                                                                                                       |
| **useSharedFilters**  | `src/hooks/use-shared-filters.tsx`     | Filtros persistentes en sessionStorage (anio, mes, sucursales[], unidades[]).                                                                                                                                                                            |
| **fetchAllRows**      | `src/lib/fetch-all-rows.ts`            | Paginación explícita para queries >1000 filas.                                                                                                                                                                                                           |
| **funnel.ts**         | `src/lib/analytics/funnel.ts`          | ✅ Ya creado en esta sesión — función pura que cruza cotizaciones→facturas→ventas_perdidas→cobranzas.                                                                                                                                                    |

---

## 2. Brechas reales (lo que falta)

| #   | Brecha                                                                                                                                                                                                | Impacto | Esfuerzo |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------- |
| B1  | **No hay embudo cross-source** (cotizado→facturado→cobrado). El pipeline actual solo muestra etapas dentro de cotizaciones. Gerencia no puede ver cuánto de lo cotizado se factura y cuánto se cobra. | Alto    | Medio    |
| B2  | **No hay vista 360° de cliente.** Un cliente es un string suelto en 4 tablas. No se puede abrir "Cliente X" y ver su historia completa.                                                               | Alto    | Medio    |
| B3  | **No hay tablero de conversión de asesores.** El ranking muestra venta, pero no tasa de conversión (cotizado→facturado) ni tasa de pérdida.                                                           | Medio   | Bajo     |
| B4  | **No hay termómetro de riesgo de cartera.** Gerencia necesita ver qué clientes están en riesgo combinando cartera vencida + ventas perdidas.                                                          | Medio   | Bajo     |
| B5  | **No hay export CSV.** Solo existe PDF (window.print). Gerencia pide "mandame el Pareto en Excel".                                                                                                    | Medio   | Bajo     |
| B6  | **Alertas solo como página completa.** No hay panel lateral (Sheet) accesible desde cualquier ruta con badge count.                                                                                   | Bajo    | Bajo     |
| B7  | **DataTable sin sorting ni búsqueda.** La tabla de resumen solo muestra top N con expand/collapse. No se puede ordenar ni buscar.                                                                     | Medio   | Bajo     |

---

## 3. Módulos nuevos propuestos

### Módulo A — Embudo Comercial Cross-Source (`/embudo`)

**Diferencia con `/pipeline` existente:** El pipeline actual muestra etapas DENTRO de cotizaciones (desarrollo→propuesta_negociacion→venta_perdida). Este nuevo módulo cruza **fuentes distintas**: cotizado (cotizaciones) → facturado (presupuestos) → cobrado (cobranzas).

**Lógica de datos (misma que resumen.tsx):**

```
cotizaciones.monto          → cotizado (neto Lub/Filtros ya restado en parser)
presupuestos.ventas_ccv     → facturado (fuente de verdad, NO tabla facturas)
  + presupuestos.ventas_xibi
  + presupuestos.ventas_estrategicas
cobranzas.monto - saldo     → cobrado (estimado: facturado menos saldo pendiente)
```

**Cálculos:**

- Tasa conversión = facturado / cotizado × 100
- Tasa cobro = cobrado / facturado × 100
- Drop-off = cotizado − facturado (lo que se perdió entre cotizar y facturar)

**UI:**

- PageHeader + FilterHeader (useSharedFilters)
- 4 KpiCards: Cotizado, Facturado, Cobrado, % Conversión
- ComposedChart: barras (cotizado/facturado/cobrado) + línea (% conversión)
- DataTable por cliente: cliente | cotizado | facturado | cobrado | % conv | % cobro

**Componentes a reutilizar:**

- `FilterHeader` (ya existe)
- `KpiCard` (ya existe)
- `ChartContainer` + `ComposedChart` (ya existe en pareto.tsx)
- `DataTable` de resumen (ya existe, pero necesita sorting → ver paso 2)

---

### Módulo B — Cliente 360° (`/cliente-360`)

**Propósito:** Abrir "Cliente X" y ver su historia completa en todas las fuentes.

**Lógica de datos:**

- Match por `cliente` (TEXT normalizado: lowercase, sin acentos)
- Cotizado: `cotizaciones` filtrado por cliente
- Facturado: `presupuestos` NO — presupuestos no tiene cliente. Usar `facturas` para detalle por cliente.
- Perdido: `ventas_perdidas` filtrado por cliente
- Cartera: `cobranzas` filtrado por cliente
- Compromisos: `minutas` filtrado por cliente

**UI:**

- PageHeader + Combobox (búsqueda de cliente)
- Ficha del cliente: KPIs mini (cotizado, facturado, perdido, cartera)
- Tabs: Cotizado | Facturado | Perdido | Cartera | Minutas
- Cada tab con su chart correspondiente

---

### Módulo C — Conversión de Asesores (`/conversion-asesores`)

**Propósito:** Ranking de asesores por efectividad, no solo por venta.

**Lógica de datos:**

- Cotizado: `cotizaciones` agrupado por `asesor_codigo` (resuelto a nombre via `cumplimiento_asesores`)
- Facturado: `cumplimiento_asesores.venta` (fuente de verdad para cumplimiento)
- Perdido: `ventas_perdidas` agrupado por `asesor`
- Tasa conversión = facturado / cotizado
- Tasa pérdida = perdido / cotizado

**UI:**

- BarChart horizontal: tasa de conversión por asesor
- RadarChart: top 5 asesores en 4 dimensiones
- DataTable: asesor | cotizado | facturado | perdido | % conv | % perd

---

### Módulo D — Riesgo de Cartera (`/riesgo-cartera`)

**Propósito:** Heatmap de clientes en riesgo (sin requerir histórico).

**Lógica de datos:**

- `cobranzas` (saldo, días vencido)
- `ventas_perdidas` (monto, razón)
- Score = ponderación de: días vencido + saldo + monto perdido

**UI:**

- Grid de cards con color por severidad
- BarChart de aging apilado por unidad
- DataTable de top clientes en riesgo

---

### Módulo E — Export CSV (mejora transversal)

**Propósito:** Botón "Exportar CSV" en todas las DataTable.

**Implementación:**

- Función `exportCSV(data, columns, filename)` en `src/lib/utils.ts`
- Botón en header de cada tabla
- Serializa filas visibles con `Blob` + `URL.createObjectURL`

---

## 4. Roadmap de ejecución

### Paso 1 — Mejorar `DataTable` con sorting y CSV export

**Archivo:** `src/components/resumen/DataTable.tsx`

Agregar:

- Sorting por columna (click en header)
- Búsqueda/filtro de texto
- Botón "Exportar CSV" (opcional via prop)

**NO instalar @tanstack/react-table** — mantener la tabla simple existente y agregar sorting manual con `useState`.

### Paso 2 — Crear ruta `/embudo`

**Archivos:**

- `src/routes/_app/embudo.tsx`
- `src/components/embudo/embudo-chart.tsx` (ComposedChart)

**Query de datos:**

```ts
// Cotizaciones (monto ya neto de Lub/Filtros)
const { data: cotizaciones } = await scoped(
  supabase.from("cotizaciones").select("cliente, monto").gte("fecha", from).lt("fecha", to),
  role,
  profile,
  profile?.id,
  { sucursal: "sucursal_id", unidad: "unidad_negocio_id", asesor: "asesor_id" },
);

// Facturado (fuente de verdad: presupuestos, igual que resumen.tsx)
const { data: presupuestos } = await scoped(
  supabase
    .from("presupuestos")
    .select("ventas_ccv, ventas_xibi, ventas_estrategicas")
    .eq("anio", anio),
  role,
  profile,
  profile?.id,
  { sucursal: "sucursal_id", unidad: "unidad_negocio_id" },
);
const facturado = presupuestos.reduce(
  (sum, p) =>
    sum +
    Number(p.ventas_ccv || 0) +
    Number(p.ventas_xibi || 0) +
    Number(p.ventas_estrategicas || 0),
  0,
);

// Cobrado (estimado: facturado - saldo de cobranzas)
const { data: cobranzas } = await scoped(
  supabase.from("cobranzas").select("monto, saldo").gt("saldo", 0),
  role,
  profile,
  profile?.id,
  { sucursal: "sucursal_id", unidad: "unidad_negocio_id" },
);
const cobrado = facturado - cobranzas.reduce((sum, c) => sum + Number(c.saldo || 0), 0);
```

**Nota:** El embudo cross-source a nivel **total** es simple (3 números). A nivel **cliente** es más complejo porque `presupuestos` no tiene columna `cliente` — solo tiene sucursal + unidad. Para el MVP, mostrar el embudo a nivel total + desglose por unidad de negocio (no por cliente).

### Paso 3 — Agregar módulo al nav

**Archivos a modificar:**

- `src/components/app-shell.tsx` — agregar `{ to: "/embudo", label: "Embudo", icon: GitBranch, module: "embudo" }`
- `src/lib/permissions.ts` — agregar `"embudo"` a `ModuleKey` y `MODULE_ACCESS`

### Paso 4 — Cliente 360°

**Archivos:**

- `src/routes/_app/cliente-360.tsx`
- `src/components/cliente-360/cliente-ficha.tsx`
- `src/components/cliente-360/cliente-charts.tsx`

### Paso 5 — Conversión de Asesores

**Archivos:**

- `src/routes/_app/conversion-asesores.tsx`

### Paso 6 — Riesgo de Cartera

**Archivos:**

- `src/routes/_app/riesgo-cartera.tsx`

### Paso 7 — Export CSV transversal

**Archivos:**

- `src/lib/utils.ts` — agregar función `exportCSV()`
- Modificar todas las rutas con DataTable para agregar botón

---

## 5. Resumen de ejecución

| Paso | Archivo                               | Depende de | Tiempo |
| ---- | ------------------------------------- | ---------- | ------ |
| 1    | Mejorar `DataTable` con sorting + CSV | nada       | 2-3h   |
| 2    | Ruta `/embudo` + chart                | paso 1     | 3-4h   |
| 3    | Agregar al nav + permissions          | paso 2     | 30min  |
| 4    | Ruta `/cliente-360`                   | paso 1     | 4-6h   |
| 5    | Ruta `/conversion-asesores`           | paso 1     | 3-4h   |
| 6    | Ruta `/riesgo-cartera`                | paso 1     | 3-4h   |
| 7    | Export CSV en todas las tablas        | paso 1     | 2h     |

**Total MVP (pasos 1-3):** 6-8h
**Total completo (pasos 1-7):** 20-25h
