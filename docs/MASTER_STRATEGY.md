# Propuesta Maestra de Escalabilidad y Evolución Comercial — Dashboard Comercial CCV 2026

**Autor:** the-architect (Principal Staff Engineer + Lead UX/UI Designer + Senior Data Scientist)
**Fecha:** 2026-07-13
**Alcance:** Auditoría arquitectónica + hoja de ruta de expansión analítica, UX y de módulos, construyendo estrictamente sobre la base actual (TanStack Start SSR + React 19 + Supabase RLS + Recharts). Ninguna propuesta reescribe la arquitectura; todas la extienden.

> **Premisas invariantes verificadas contra `docs/SCHEMA.md` y `src/integrations/supabase/types.ts` (snapshot real 2026-07-09), respetadas en todo el documento:**
>
> - **Facturado** = `presupuestos.ventas_ccv + ventas_xibi + ventas_estrategicas` (fuente de verdad reconciliada), **no** `facturas.monto`.
> - **Cotizado** = `cotizaciones.monto` (ya **neto** de Lub/Filtros por el parser).
> - `cotizaciones` **no** tiene columna `asesor` → resolver `asesor_codigo` contra `cumplimiento_asesores.codigo_asesor`.
> - Enum real `cotizacion_etapa` = `desarrollo | propuesta_negociacion | venta_perdida | desconocido`, donde `propuesta_negociacion` es funcionalmente "ganada".
> - `presupuestos` **no tiene columna `cliente`** (solo `anio, mes, sucursal_id, unidad_negocio_id`). Cualquier análisis por cliente del lado facturado debe apoyarse en `facturas`.
> - `cobranzas` es **estado actual sin histórico**; la tabla `cobranzas_snapshots` (migración `20260709093000_*.sql`) **existe en el repo pero NO está aplicada en producción**.

---

## 1. Auditoría de Escalabilidad Arquitectónica

### 1.1 Estado actual del fetching y renderizado (hallazgos concretos)

**Patrón de fetching observado.** Todas las rutas protegidas fetchan **dentro del componente** con `useQuery` de TanStack Query, tras `useAuth()`/`useSharedFilters()`, con `enabled: canView` como guard (patrón correcto tras el fix de "hooks después de early return"). Ejemplo canónico en `src/routes/_app/gerencia-nacional.tsx`:

- 4 queries por render: `["sucursales"]`, `["unidades"]`, `["gerencia-nacional", filterKey]`, `["gerencia-nacional-cross", crossFilterKey]`.
- Toda la agregación (branchAcc, unitAcc, matrixAcc → heatmap sucursal×unidad, ranking, donut, meta-vs-venta) ocurre **en el cliente** dentro de `useMemo` sobre el array crudo de `presupuestos`.

**Problema raíz de escalabilidad — configuración de caché por defecto.** En `src/router.tsx`:

```ts
const queryClient = new QueryClient();   // sin defaultOptions
// ...
createRouter({ ..., defaultPreloadStaleTime: 0 });
```

Consecuencias medibles:

- `staleTime` por defecto = **0** → cada montaje de ruta y cada cambio de filtro re-fetcha; navegar `gerencia-nacional → coordinador → gerencia-nacional` re-descarga todo, aun con datos que solo cambian **una vez por semana** (carga de Excel los viernes).
- `defaultPreloadStaleTime: 0` anula el preload del router: aunque un `<Link>` dispare preload, el dato se considera stale inmediatamente y se re-fetcha al navegar.
- No hay `queryClient.prefetchQuery` en ningún `beforeLoad`/loader (solo `_app.tsx` usa `beforeLoad` para auth). El waterfall es: render componente → montar hooks → disparar queries → spinner.

**Catálogos re-fetchados en cada ruta.** `["sucursales"]` y `["unidades"]` se consultan en gerencia-nacional, coordinador, asesores, resumen, etc. como queries independientes sin `staleTime`, cuando son **catálogos casi inmutables**.

**Sobre-fetch de filas anchas.** `scoped(supabase.from("presupuestos").select("*")...)` trae todas las columnas; el heatmap solo necesita `monto, sucursal_id, unidad_negocio_id, ventas_ccv, ventas_xibi, ventas_estrategicas` (ya corregido en `crossRaw`, pero `metrics` sigue con `select("*")`). `fetchAllRows` (`src/lib/fetch-all-rows.ts`) es correcto para paginar >1000 filas de `cotizaciones/facturas`, pero implica múltiples round-trips secuenciales que se ejecutan client-side bajo RLS en cada visita.

**Agregación pesada en el hilo de UI.** El heatmap de gerencia-nacional recomputa 3 `Map` anidados (`matrixAcc: Map<sucursal, Map<unidad, Acc>>`) en cada cambio de `selectedUnidades`. Para el volumen actual (8 sucursales × 5 unidades × 12 meses) es trivial, pero el patrón de "traer filas crudas y agregar en cliente" no escala a análisis multi-año o cross-source (embudo por cliente, cohortes).

### 1.2 Dashboards más pesados (ranking por costo de render/queries)

| Ruta                 | # queries                                                      | Componentes Recharts                                                             | Agregación cliente                                    | Riesgo     |
| -------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------- |
| `/coordinador`       | ~6-8 (usa `useDeferredValue`)                                  | 8 charts (Combo, Area, Bar+markers, Lines, Stacked, Donut, Gauge, Trend) + Radar | Alta                                                  | **Máximo** |
| `/gerencia-nacional` | 4                                                              | Gauge, Donut, MetaVsVenta, Ranking, HeatmapMatrix (CSS), SummaryTable            | Alta (3 Maps)                                         | Alto       |
| `/asesores`          | 4 (facturas+cotiz+perdidas+metas, cada una con `fetchAllRows`) | Ranking, Pareto (Composed), Radar modal                                          | Muy alta (consolidación de 32 asesores + Ventas Casa) | Alto       |
| `/resumen`           | 4 (cotiz+fact+perdidas+presup)                                 | KPI grid + secciones                                                             | Media                                                 | Medio      |
| `/embudo`, `/pareto` | 3-4                                                            | Composed                                                                         | Media                                                 | Medio      |

`/coordinador` es el peor caso: 8 charts Recharts montados simultáneamente. `useDeferredValue` mitiga el jank de input, pero cada `ResponsiveContainer` de Recharts monta un `ResizeObserver` y re-renderiza en resize; con 8 en pantalla el costo de layout es real.

### 1.3 Mejoras de cacheo preventivo (construyendo sobre lo existente)

**M1 — Configurar `QueryClient` con caché alineada al ciclo semanal de datos.** Único cambio en `src/router.tsx`, cero refactor de rutas:

```ts
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 30, // 30 min: los datos cambian 1x/semana (viernes)
      gcTime: 1000 * 60 * 60 * 2, // 2 h en memoria
      refetchOnWindowFocus: false, // evita re-fetch al alt-tab
      retry: 1,
    },
  },
});
```

Y elevar `defaultPreloadStaleTime` a un valor > 0 (p. ej. 30 s) para que el preload del router sirva del caché.

**Impacto:** elimina el 60-80% de los re-fetch de navegación inter-ruta sin tocar una sola query. Es la mejora de mayor ROI del documento.

**M2 — Catálogos como queries "infinitas".** Extraer un hook `src/hooks/use-catalogos.ts` que centralice `["sucursales"]` y `["unidades"]` con `staleTime: Infinity` (invalidados solo tras `/carga`). Reemplaza las definiciones duplicadas en cada ruta. Respeta DRY sin reescribir nada estructural.

**M3 — Prefetch por rol en `beforeLoad` / al montar el AppShell.** En `dashboard.tsx` (el router por rol) ya se conoce el rol antes de navegar. Añadir prefetch de la ruta destino usando el `queryClient` del contexto del router:

```ts
// dashboard.tsx, tras resolver role, antes de navigate()
if (role === "gerencia" || role === "gerente_comercial") {
  queryClient.prefetchQuery({ queryKey: ["gerencia-nacional", filterKey], queryFn: ... });
}
```

Alternativa más limpia: mover el fetch principal de cada ruta a un `loader` de TanStack Router que llame `queryClient.ensureQueryData`, de modo que SSR entregue el HTML con datos y el cliente hidrate sin waterfall. Esto **aprovecha el SSR de TanStack Start que hoy está infrautilizado** (las rutas son efectivamente CSR tras el shell).

**M4 — Optimización de render de los dashboards pesados.**

- Envolver cada chart Recharts pesado en `React.memo` con props primitivas/estables (ya son componentes presentacionales en `src/components/coordinador/*` y `gerencia-nacional/*` → candidatos directos).
- En `/coordinador`, aplicar **lazy mounting por viewport**: los 8 charts no caben above-the-fold; montar con `IntersectionObserver` (o `content-visibility: auto` en CSS, cero JS) los que están fuera de pantalla. `content-visibility: auto` sobre los contenedores `.card-elevated` de charts es la opción de menor riesgo.
- Mantener `useDeferredValue` (ya presente) y extender el patrón a `/asesores`.

### 1.4 Supabase: Materialized Views y RPCs para descargar cálculo del frontend

Hoy **todo KPI se computa en el cliente** tras traer filas crudas bajo RLS. Esto acopla el costo de cálculo al navegador del usuario y multiplica round-trips (`fetchAllRows` pagina de a 1000). La palanca de escalabilidad es mover agregación a PostgreSQL.

**Hallazgo de seguridad relevante para el diseño de MVs/RPCs (bloqueante para gerente_comercial):** en `20260712120200_harden_rls_policies.sql` las políticas de lectura de `presupuestos` y `cumplimiento_asesores` son:

```sql
CREATE POLICY "presupuestos_select" ON public.presupuestos FOR SELECT TO authenticated USING (true);
CREATE POLICY "cumplimiento_asesores_select" ON public.cumplimiento_asesores FOR SELECT TO authenticated USING (true);
```

Es decir, **RLS NO restringe presupuestos ni cumplimiento por unidad/sucursal** — la única defensa hoy es `scoped()` en el cliente (`src/lib/data-scope.ts`), que es explícitamente "UX-level shortcut". Un `gerente_comercial` o `coordinador` puede leer por PostgREST directo el presupuesto/cumplimiento de **toda** la empresa. **Cualquier MV o RPC que exponga estos datos debe re-imponer el scope**, y se recomienda cerrar el gap en las políticas base (ver §1.4.4).

#### 1.4.1 MV — Resumen mensual por sucursal × unidad (base de gerencia-nacional, resumen, coordinador)

Descarga la triple-Map de `gerencia-nacional.tsx` a la BD:

```sql
CREATE MATERIALIZED VIEW public.mv_resumen_mensual AS
SELECT
  p.anio,
  p.mes,
  p.sucursal_id,
  p.unidad_negocio_id,
  SUM(p.monto)                                                   AS meta,
  SUM(p.ventas_ccv + p.ventas_xibi + p.ventas_estrategicas)       AS facturado,
  SUM(p.ventas_ccv)        AS facturado_ccv,
  SUM(p.ventas_xibi)       AS facturado_xibi,
  SUM(p.ventas_estrategicas) AS facturado_estrategicas
FROM public.presupuestos p
GROUP BY p.anio, p.mes, p.sucursal_id, p.unidad_negocio_id;

CREATE UNIQUE INDEX ux_mv_resumen_mensual
  ON public.mv_resumen_mensual (anio, mes, sucursal_id, unidad_negocio_id);
```

El índice único permite `REFRESH MATERIALIZED VIEW CONCURRENTLY`. El frontend consulta la MV filtrada por `anio/mes/scope` y ya no agrega en cliente.

#### 1.4.2 MV — Cotizado neto y ventas perdidas por sucursal × unidad × mes

```sql
CREATE MATERIALIZED VIEW public.mv_cotizado_mensual AS
SELECT
  date_part('year', c.fecha)::int   AS anio,
  date_part('month', c.fecha)::int  AS mes,
  c.sucursal_id,
  c.unidad_negocio_id,
  SUM(c.monto)          AS cotizado,       -- ya neto Lub/Filtros
  SUM(c.monto_perdido)  AS monto_perdido,
  COUNT(*)              AS n_cotizaciones
FROM public.cotizaciones c
GROUP BY 1,2,3,4;

CREATE MATERIALIZED VIEW public.mv_perdidas_mensual AS
SELECT
  date_part('year', v.fecha)::int   AS anio,
  date_part('month', v.fecha)::int  AS mes,
  v.sucursal_id, v.unidad_negocio_id,
  SUM(v.monto) AS perdido, COUNT(*) AS n_perdidas
FROM public.ventas_perdidas v
GROUP BY 1,2,3,4;
```

#### 1.4.3 RPC `security definer` para el Embudo cross-source con scope re-impuesto

El embudo total (`computeFunnelTotals` en `src/lib/analytics/funnel.ts`) hoy junta 3 fuentes en cliente. RPC que lo resuelve server-side y **re-aplica el scope del rol** (no depende de `scoped()`):

```sql
CREATE OR REPLACE FUNCTION public.rpc_embudo_totales(
  _anio int,
  _meses int[] DEFAULT NULL          -- NULL = todo el año
) RETURNS TABLE (cotizado numeric, facturado numeric, cobrado numeric)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH scope AS (
    SELECT public.get_user_role(auth.uid()) AS rol,
           public.get_user_sucursal(auth.uid()) AS suc,
           public.get_user_unidad(auth.uid())   AS uni
  ),
  cot AS (
    SELECT COALESCE(SUM(c.monto),0) v
    FROM public.cotizaciones c, scope s
    WHERE date_part('year', c.fecha) = _anio
      AND (_meses IS NULL OR date_part('month', c.fecha) = ANY(_meses))
      AND public.can_read_row(c.sucursal_id, c.unidad_negocio_id, c.asesor_id)
  ),
  fac AS (
    SELECT COALESCE(SUM(p.ventas_ccv + p.ventas_xibi + p.ventas_estrategicas),0) v
    FROM public.presupuestos p, scope s
    WHERE p.anio = _anio
      AND (_meses IS NULL OR p.mes = ANY(_meses))
      AND public.can_read_row(p.sucursal_id, p.unidad_negocio_id, NULL)
  ),
  sal AS (
    SELECT COALESCE(SUM(cb.saldo),0) v
    FROM public.cobranzas cb
    WHERE public.can_read_row(cb.sucursal_id, cb.unidad_negocio_id, NULL)
  )
  SELECT cot.v, fac.v, GREATEST(0, fac.v - sal.v) FROM cot, fac, sal;
$$;

REVOKE ALL ON FUNCTION public.rpc_embudo_totales(int, int[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_embudo_totales(int, int[]) TO authenticated;
```

Nota: al usar `can_read_row(...)` dentro del RPC, el scope se impone **aunque las policies base de presupuestos sean `USING(true)`** — cierra el gap para este consumo. Los grants siguen el patrón de hardening ya establecido en `20260712120100_*.sql`.

#### 1.4.4 Cierre del gap de RLS en presupuestos/cumplimiento (recomendado)

Nueva migración `20260714120000_scope_presupuestos_cumplimiento.sql`:

```sql
DROP POLICY IF EXISTS "presupuestos_select" ON public.presupuestos;
CREATE POLICY "presupuestos_select" ON public.presupuestos FOR SELECT TO authenticated
  USING (public.can_read_row(sucursal_id, unidad_negocio_id, NULL)
         OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "cumplimiento_asesores_select" ON public.cumplimiento_asesores;
CREATE POLICY "cumplimiento_asesores_select" ON public.cumplimiento_asesores FOR SELECT TO authenticated
  USING (public.can_read_row(sucursal_id, unidad_negocio_id, asesor_id)
         OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()));
```

**Cuidado (verificar antes de aplicar):** `resumen.tsx` y `gerencia-nacional.tsx` asumen que un coordinador ve el presupuesto **de su sucursal completo** (todas las unidades) para el ranking. `can_read_row` con `_unidad = NULL` debe devolver true para coordinador cuando la sucursal coincide; validar la implementación real de `can_read_row` (está en la migración inicial) antes de desplegar, con el `role-view-qa-checklist.md` existente.

#### 1.4.5 Estrategia de refresh (sin cron externo)

El dato cambia **exactamente cuando corre la carga de Excel**. Por tanto el refresh debe colgarse del final de `src/integrations/supabase/load-excel.ts` (que ya usa `supabaseAdmin`/service role):

```sql
CREATE OR REPLACE FUNCTION public.refresh_todas_mv()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_resumen_mensual;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_cotizado_mensual;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_perdidas_mensual;
END; $$;
```

Al final del pipeline de `load-excel.ts` (tras todos los `insertChunked`): `await supabase.rpc("refresh_todas_mv")`. Así el refresh es determinista (post-carga, viernes) y también se dispara en carga manual desde `/carga`. **No se necesita `pg_cron`.** Después de invalidar, el frontend descubre datos frescos gracias a `queryClient.invalidateQueries` disparado tras la carga en `/carga`.

### 1.5 Resumen de la sección 1

| Palanca                                 | Archivo/objeto                   | Riesgo     | ROI                 |
| --------------------------------------- | -------------------------------- | ---------- | ------------------- |
| M1 `defaultOptions` en QueryClient      | `src/router.tsx`                 | Muy bajo   | Máximo              |
| M2 hook catálogos `staleTime: Infinity` | `src/hooks/use-catalogos.ts`     | Bajo       | Alto                |
| M3 prefetch/loader por rol              | `dashboard.tsx`, loaders de ruta | Medio      | Alto                |
| M4 memo + `content-visibility` charts   | `components/coordinador/*`       | Bajo       | Medio               |
| MV resumen/cotizado/perdidas            | nueva migración SQL              | Medio      | Alto                |
| RPC embudo con scope                    | nueva migración SQL              | Medio      | Alto                |
| Cierre gap RLS presupuestos             | nueva migración SQL              | Medio-Alto | Crítico (seguridad) |

---

## 2. Expansión Analítica y Comercial (Data Science)

### 2.1 El salto descriptivo → predictivo → prescriptivo

Hoy el sistema es 100% **descriptivo** (qué pasó: cumplimiento, Pareto, embudo, ranking). El siguiente estadio requiere una precondición de datos que ya está diseñada pero no activada: **aplicar `cobranzas_snapshots`** (migración `20260709093000_*.sql`) para tener series temporales de cartera, y **derivar series de `cotizaciones/facturas/presupuestos`** que ya tienen `fecha`/`anio`/`mes`.

- **Descriptivo (hoy):** MVs de §1.4.
- **Predictivo (Fase 2):** forecasting de ventas y cobranzas (§2.2).
- **Prescriptivo (Fase 3):** next-best-offer, priorización de cartera, alertas accionables con recomendación (§2.3).

### 2.2 Forecasting de ventas y cobranzas

**Método recomendado: Holt-Winters (suavizado exponencial triple) para ventas, con fallback a media móvil ponderada.** Justificación: la data comercial de CCV es mensual, con estacionalidad anual clara (cierres de trimestre, temporada) y horizonte corto. Holt-Winters captura nivel + tendencia + estacionalidad sin requerir librería ML pesada; es implementable en SQL/TS puro y testeable como función pura (encaja con el patrón de `src/lib/analytics/*.ts` + `.test.ts`).

**Horizonte:** 3 meses (rolling), recalculado tras cada carga.

**Fuente de datos (ventas):** `mv_resumen_mensual` (facturado por anio/mes/sucursal/unidad).

**Fórmula Holt-Winters aditivo** (con L = 12 períodos estacionales):

- Nivel: `ℓ_t = α·(y_t − s_{t−L}) + (1−α)·(ℓ_{t−1} + b_{t−1})`
- Tendencia: `b_t = β·(ℓ_t − ℓ_{t−1}) + (1−β)·b_{t−1}`
- Estacional: `s_t = γ·(y_t − ℓ_t) + (1−γ)·s_{t−L}`
- Pronóstico h pasos: `ŷ_{t+h} = ℓ_t + h·b_t + s_{t−L+((h−1) mod L)+1}`

Donde `y_t` = facturado del mes t. Parámetros `α, β, γ ∈ [0,1]` (arranque: 0.4/0.1/0.3, o grid-search minimizando MAPE).

**Precisión reportada al usuario:** `MAPE = (100/n)·Σ|y_t − ŷ_t|/y_t` sobre backtesting de los últimos 6 meses. Si `n_meses < 24` (menos de 2 ciclos), degradar automáticamente a **media móvil ponderada de 3 meses**: `ŷ_{t+1} = (3·y_t + 2·y_{t−1} + 1·y_{t−2})/6`.

**Cobranzas / forecast de recuperación:** requiere `cobranzas_snapshots` aplicada. Con ≥8 snapshots semanales se puede estimar la **velocidad de recuperación** (roll-rate): fracción del saldo de un bucket de aging que pasa al siguiente vs. el que se cobra.

- `roll_rate(b→b+1) = saldo_bucket_{b+1}(t) / saldo_bucket_b(t−1)`
- Recuperación esperada 30d: `E[cobrado] = Σ_b saldo_b · (1 − roll_rate(b→b+1))`

**Materialización:** función pura `src/lib/analytics/forecast.ts` (Holt-Winters + MMP + MAPE) con su `.test.ts`, alimentada por un RPC `rpc_serie_facturado_mensual(_scope)` que devuelve la serie ya scopeada desde `mv_resumen_mensual`. El forecast se calcula **client-side** sobre la serie (barata: ≤36 puntos) para no requerir extensiones de Postgres. Alternativa server-side si se quiere precomputar: MV `mv_forecast_ventas` refrescada en el pipeline.

### 2.3 Cinco análisis comerciales avanzados nuevos (fórmula + tablas reales)

#### A. Churn de clientes (fuga)

**Definición operativa:** cliente activo que dejó de facturar. Como no hay tabla `clientes`, la identidad es el string `cliente` normalizado (misma `normalize()` de `funnel.ts`).

- Ventana de actividad: cliente con ≥1 factura en `facturas` en los últimos R meses (R=6).
- **Churn flag:** `es_churn = (max(facturas.fecha WHERE cliente=X) < today − R meses) AND (Σ facturas.monto histórico > 0)`
- **Churn rate del período:** `churn_rate = clientes_perdidos / clientes_activos_inicio_período × 100`
- **Recencia (días):** `recencia = today − max(facturas.fecha)`

**Tablas:** `facturas (cliente, fecha, monto, sucursal_id, unidad_negocio_id, asesor)`. Refuerzo de señal cruzando con `ventas_perdidas` (si el cliente aparece con `razon`, churn "explicado").

#### B. LTV cruzado con unidades/servicios (valor de vida + cross-unit)

- **LTV histórico:** `LTV(cliente) = Σ facturas.monto` (todo el histórico del cliente).
- **Amplitud de cartera (cross-sell actual):** `n_unidades(cliente) = COUNT(DISTINCT unidad_negocio_id)` en `facturas` ∪ `servicios`.
- **Índice de penetración:** `penetracion = n_unidades(cliente) / n_unidades_totales_activas`
- **LTV proyectado simple:** `LTV_proj = ventaMensualPromedio × vidaEsperadaMeses`, con `ventaMensualPromedio = Σmonto / meses_activo` y `vidaEsperadaMeses` derivada del inverso del churn rate del segmento: `1 / (churn_rate_mensual)`.

**Tablas:** `facturas`, `servicios (cliente, monto, unidad_negocio_id, tipo_servicio, categoria_venta)`.

#### C. Cohortes de retención

Cohorte = mes de **primera factura** del cliente. Matriz cohorte × meses-desde-alta.

- Cliente pertenece a cohorte `c = min(anio·12+mes de facturas.fecha)`.
- **Retención en offset k:** `retencion(c, k) = clientes_de_c_con_factura_en_mes(c+k) / tamaño_cohorte(c) × 100`
- **Revenue retention (NRR aproximado):** `NRR(c,k) = Σmonto_cohorte_c_en_(c+k) / Σmonto_cohorte_c_en_(c) × 100`

**Tablas:** `facturas`. Visualización: heatmap triangular (reutiliza el patrón CSS-grid de `UnitHeatmapMatrix.tsx`).

#### D. Detección de anomalías en caída de ventas por asesor

Sobre la serie mensual de venta por asesor (de `cumplimiento_asesores.venta`, ya scopeada por catálogo canónico de `asesores-catalogo.ts`).

- **z-score robusto (MAD):** para asesor a, serie `{v_t}`:
  - `mediana = median(v_{t−1..t−n})`, `MAD = median(|v_i − mediana|)`
  - `z_t = 0.6745·(v_t − mediana)/MAD`
  - **Anomalía de caída:** `z_t ≤ −3.5`
- **Gap de run-rate (ya insinuado en `/alertas`):** `run_rate = venta_acumulada / dias_transcurridos × dias_mes`; alerta si `run_rate < 0.7 × (meta/1)`.

**Tablas:** `cumplimiento_asesores (codigo_asesor, asesor, anio, mes, venta, presupuesto, pct_cumplimiento)`. Resolución de identidad vía `resolverAsesor()` (`asesores-catalogo.ts`).

#### E. Cross-sell / Next-Best-Offer (prescriptivo)

Recomendación por co-ocurrencia de unidades entre clientes (market-basket a nivel unidad de negocio, no SKU — es lo que el esquema permite).

- Para cada par de unidades (u_i, u_j): **soporte** `sup(u_i,u_j) = clientes_con_ambas / total_clientes`.
- **Confianza:** `conf(u_i→u_j) = clientes_con_ambas / clientes_con_u_i`
- **Lift:** `lift = conf(u_i→u_j) / (clientes_con_u_j / total_clientes)`
- **Next-best-offer para cliente X:** unidades u_j con mayor `lift` tales que X compra u_i pero **no** u_j.

**Tablas:** `facturas` ∪ `servicios` agrupadas por `(cliente, unidad_negocio_id)`. Salida: por cliente, top-3 unidades sugeridas ordenadas por lift × LTV potencial de la unidad.

Todas estas se implementan como funciones puras en `src/lib/analytics/` (`churn.ts`, `ltv.ts`, `cohortes.ts`, `anomalias.ts`, `cross-sell.ts`), cada una con su `.test.ts` (patrón existente, cobertura 80%), alimentadas por RPCs scopeados o por las MVs.

---

## 3. Evolución de UI/UX y Densidad de Datos

### 3.1 Diagnóstico de la disposición actual

Puntos fuertes existentes: `card-elevated`, `section-enter` (animación escalonada), sistema `statusFromPct`/`statusFromPct90` semántico (verde/ámbar/rojo), `KpiCard` con `progress`, `UnitHeatmapMatrix` en CSS-grid (compositor-friendly), tipografía deliberada (Space Grotesk display + Inter + JetBrains Mono para tabulares con `tabular-nums`). Esto ya cumple varios criterios de la política anti-template.

Debilidades de **densidad**:

- Los "highlights" de gerencia-nacional (mejor sucursal, bajo 70%, unidad alta/baja) son 4 tarjetas de una línea que ocupan una columna entera sin mostrar **tendencia** — puro valor puntual.
- `BranchSummaryTable` / `DataTable` (`src/components/resumen/DataTable.tsx`) no tienen sorting, búsqueda ni sparklines (confirmado en PLAN-EXPANSION §2, brecha B7).
- No hay comparación temporal inline: los KPIs muestran el valor del período pero no "vs mes anterior" de un vistazo.

### 3.2 Mejoras concretas de Data-Ink Ratio y densidad

**D1 — Sparklines en KPIs y tablas.** Añadir un mini-chart de 6-12 meses embebido en `KpiCard` y en cada fila de `BranchSummaryTable`. Recharts ya está; un `<LineChart>` sin ejes/grid/tooltip (~40px alto) es puro data-ink. Componente nuevo `src/components/ui/sparkline.tsx` (presentacional, memoizado). Datos desde `mv_resumen_mensual`.

**D2 — Small multiples para el heatmap.** Complementar `UnitHeatmapMatrix` con una fila de mini-heatmaps por mes (small multiples) para ver evolución del cumplimiento sucursal×unidad a lo largo del año en una sola pantalla — sustituye el toggle mensual/anual (`SegmentedToggle`) por vista simultánea comparable.

**D3 — Tabla densa con sorting/búsqueda/delta.** Extender `DataTable.tsx` (sin instalar `@tanstack/react-table`, per PLAN-EXPANSION §Paso 1): sorting por header (`useState`), filtro de texto, columna delta vs período anterior con flecha ▲▼ coloreada por `statusFromPct`, y `exportCSV()` en `src/lib/utils.ts`. Filas con `tabular-nums` + zebra sutil para escaneo.

**D4 — KPIs comparativos.** Enriquecer `KpiCard` con prop opcional `delta` (valor + dirección), renderizando "vs mes ant." con color semántico. Cero ruptura: prop opcional.

### 3.3 Nuevos flujos de interacción

**F1 — Command Palette global (`⌘K` / `Ctrl+K`).** `cmdk` ya está instalado y `src/components/ui/command.tsx` existe pero solo se usa en `FilterHeader` y `coordinador` (verificado por grep). Elevarlo a **paleta global** montada en `AppShell`: navegación a rutas (filtrada por `getModulesForRole(role)` — respeta permisos), acciones rápidas ("cambiar mes", "ir a Cliente 360 → X", "exportar CSV"), y saltar a un asesor/sucursal. Un solo componente nuevo `src/components/command-palette.tsx`, montado en `app-shell.tsx`, listener `keydown` con cleanup.

**F2 — Drill-down consistente vía `Sheet`.** El modal drill-down de asesor ya existe en `/asesores`. Estandarizar un `DetailSheet` (usando `src/components/ui/sheet.tsx`) reutilizable: clic en cualquier fila de sucursal/unidad/cliente abre panel lateral con KPIs mini + sparkline + últimas transacciones, sin perder contexto de la vista.

**F3 — Vistas modulares personalizables (dashboard por usuario).** Permitir a cada usuario reordenar/ocultar tarjetas de su home. Persistir el layout en `profiles` (nueva columna JSONB `dashboard_layout`) o en `sessionStorage` (MVP, patrón de `use-shared-filters.tsx`). Respeta el data-scope: solo reordena lo que el rol ya puede ver.

**Accesibilidad y motion (no negociable):** Radix/base-ui ya aportan teclado/ARIA. Toda animación nueva (sparklines, sheet, small multiples) debe respetar `prefers-reduced-motion` y limitarse a `transform`/`opacity`. Los colores semánticos deben verificar contraste AA; el rojo/ámbar/verde debe acompañarse de icono o texto (no solo color) para daltonismo — ya se hace parcialmente con iconos lucide en los highlights.

---

## 4. Propuesta de Nuevos Módulos

### Módulo 1 — Comisiones Proyectadas (`/comisiones`)

**Propósito.** Calcular y proyectar comisiones por asesor según cumplimiento, dando a Gerencia el costo variable esperado del cierre de mes y a cada asesor su comisión estimada — cierra el loop entre el ranking (descriptivo) y el incentivo (accionable).

**Tablas/Datos.**

- Existentes: `cumplimiento_asesores (codigo_asesor, asesor, venta, presupuesto, pct_cumplimiento, anio, mes, sucursal_id, unidad_negocio_id)`, `cotizaciones` (para run-rate), catálogo `asesores-catalogo.ts`.
- Nueva tabla de reglas (DDL):

```sql
CREATE TABLE public.comisiones_reglas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidad_negocio_id UUID REFERENCES public.unidades_negocio(id) ON DELETE CASCADE,
  umbral_min_pct NUMERIC(6,2) NOT NULL,     -- p.ej. 80.00
  umbral_max_pct NUMERIC(6,2),               -- NULL = sin tope
  tasa_comision NUMERIC(6,4) NOT NULL,       -- fracción sobre venta, p.ej. 0.0150
  activa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.comisiones_reglas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comisiones_reglas_read" ON public.comisiones_reglas FOR SELECT TO authenticated USING (true);
CREATE POLICY "comisiones_reglas_write" ON public.comisiones_reglas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'gerencia') OR (SELECT is_admin FROM public.profiles WHERE id=auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'gerencia') OR (SELECT is_admin FROM public.profiles WHERE id=auth.uid()));
```

**Fórmula.** `comision(asesor) = venta × tasa_comision(pct_cumplimiento)`, donde la tasa sale del tramo de `comisiones_reglas` que contiene `pct_cumplimiento`. Proyección de cierre: `venta_proyectada = run_rate` (§2.3.D) → `comision_proyectada`.

**Componentes UI.** Ruta `src/routes/_app/comisiones.tsx`; `src/components/comisiones/TablaComisiones.tsx` (tabla densa D3), `EditorReglas.tsx` (React Hook Form + Zod, solo gerencia), KPIs (comisión total proyectada, top earners). Reutiliza `KpiCard`, `DataTable`, `resolverAsesor`.

**Visibilidad y data-scope por rol.**

- `gerencia`: todas las reglas + comisiones de todos; único que edita reglas (`canManageUsers`-style guard nuevo `canEditComisiones`).
- `gerente_comercial`: comisiones de asesores de su(s) `unidades_negocio_ids` — `scoped(..., { unidad: "unidad_negocio_id" })` sobre `cumplimiento_asesores`.
- `coordinador`: comisiones de asesores de su `sucursal_id` — `scoped(..., { sucursal: "sucursal_id" })`.
- `asesor`: solo su propia comisión — filtrar por `codigo_asesor` del asesor autenticado. **Requiere** un RPC `security definer` `rpc_mi_comision()` porque hoy `cumplimiento_asesores` no está scopeada por `asesor_id` a nivel RLS de forma que un asesor solo vea su fila (política es `USING(true)`); el RPC re-impone `codigo_asesor = perfil del usuario`.

Añadir `"comisiones"` a `ModuleKey`/`MODULE_ACCESS` en `src/lib/permissions.ts` (roles: gerencia, gerente_comercial, coordinador, asesor) y al nav en `app-shell.tsx`.

### Módulo 2 — Simulador de Escenarios de Presupuesto (`/simulador`)

**Propósito.** Herramienta what-if para Gerencia: ajustar supuestos (crecimiento %, redistribución de meta entre sucursales/unidades, tasa de conversión objetivo) y ver el impacto proyectado en facturado, comisiones y cumplimiento antes de fijar el presupuesto del próximo período. Es el módulo **prescriptivo** insignia.

**Tablas/Datos.**

- Existentes (solo lectura): `mv_resumen_mensual`, `mv_cotizado_mensual`, `presupuestos`.
- Nueva tabla para guardar escenarios (DDL):

```sql
CREATE TABLE public.escenarios_presupuesto (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  anio INT NOT NULL,
  creado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  supuestos JSONB NOT NULL,   -- { crecimiento_pct, conversion_objetivo, redistribucion:{...} }
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.escenarios_presupuesto ENABLE ROW LEVEL SECURITY;
CREATE POLICY "escenarios_rw" ON public.escenarios_presupuesto FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'gerencia') OR public.has_role(auth.uid(),'gerente_comercial')
         OR (SELECT is_admin FROM public.profiles WHERE id=auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'gerencia') OR public.has_role(auth.uid(),'gerente_comercial')
         OR (SELECT is_admin FROM public.profiles WHERE id=auth.uid()));
```

**Fórmulas de simulación (client-side, puras).**

- `meta_simulada(s,u) = meta_actual(s,u) × (1 + crecimiento_pct) ± redistribucion(s,u)`
- `facturado_proyectado(s,u) = cotizado_esperado(s,u) × conversion_objetivo`, con `cotizado_esperado` = forecast Holt-Winters de cotizado (§2.2) sobre `mv_cotizado_mensual`.
- `cumplimiento_simulado(s,u) = facturado_proyectado / meta_simulada × 100`
- Restricción de balanceo: `Σ redistribucion(s,u) = 0` (la redistribución no crea meta, la mueve).

**Componentes UI.** Ruta `src/routes/_app/simulador.tsx`; `src/components/simulador/PanelSupuestos.tsx` (sliders con `src/components/ui/slider.tsx` + inputs), `MatrizSimulada.tsx` (reutiliza `UnitHeatmapMatrix` mostrando cumplimiento simulado vs. base), `ComparadorEscenarios.tsx` (guardar/comparar 2 escenarios lado a lado). Lógica pura en `src/lib/analytics/simulador.ts` + test.

**Visibilidad y data-scope por rol.**

- `gerencia`: simula sobre todas las sucursales y unidades; guarda escenarios globales.
- `gerente_comercial`: solo puede simular dentro de sus `unidades_negocio_ids`; sliders de sucursal deshabilitados fuera de su alcance; lectura vía MVs scopeadas.
- `coordinador` / `asesor`: **sin acceso** (`MODULE_ACCESS.simulador = ["gerencia","gerente_comercial"]`). Es una herramienta de planeación de alto nivel.

### Módulo 3 — Salud de Cliente 360° + Riesgo (`/cliente-360`)

**Propósito.** Unifica las brechas B2 (vista 360° de cliente) y B4 (riesgo de cartera) de `PLAN-EXPANSION.md` en un módulo con score de salud accionable por cliente, incorporando churn (§2.3.A), LTV (§2.3.B) y next-best-offer (§2.3.E).

**Tablas/Datos.** Todas existentes: `cotizaciones`, `facturas`, `ventas_perdidas`, `cobranzas`, `servicios`, `minutas` — match por `cliente` normalizado. No requiere tablas nuevas (usa MVs de §1.4 más consultas puntuales por cliente). Se beneficia de `cobranzas_snapshots` si se aplica (tendencia de saldo).

**Fórmula del Health Score (0-100, mayor = más sano).**

```
health = 100
  − w1·norm(dias_vencido_max)        // morosidad (cobranzas.fecha_vencimiento)
  − w2·norm(saldo_vencido)            // exposición (cobranzas.saldo)
  − w3·norm(recencia_dias)            // inactividad (max facturas.fecha)
  − w4·norm(monto_perdido_reciente)   // fricción (ventas_perdidas.monto)
  + w5·norm(LTV)                       // valor (Σ facturas.monto)
```

con `norm(x)=min(1, x/x_ref)` y pesos por defecto `w1=25, w2=25, w3=20, w4=15, w5=15`. Bandas: ≥70 sano, 40-69 atención, <40 riesgo (reutiliza `statusFromPct`-style).

**Componentes UI.** Ruta `src/routes/_app/cliente-360.tsx`; `src/components/cliente-360/ClienteBuscador.tsx` (`combobox.tsx`), `FichaCliente.tsx` (KPIs mini + sparkline de facturación + health gauge reutilizando `ComplianceGauge`), tabs (Cotizado/Facturado/Perdido/Cartera/Minutas), `NextBestOffer.tsx` (chips de unidades sugeridas por lift). Vista índice = grid de clientes en riesgo ordenados por `saldo_vencido × (1 − health/100)`.

**Visibilidad y data-scope por rol.** Match por `cliente` (string) no lleva `sucursal_id`/`unidad_negocio_id` propios, así que el scope se aplica en las **transacciones** consultadas, no en el cliente:

- `gerencia`: todos los clientes, todas las fuentes.
- `gerente_comercial`: `scoped(..., { unidad })` en cotizaciones/facturas/ventas_perdidas/cobranzas → el cliente solo agrega transacciones de sus unidades.
- `coordinador`: `scoped(..., { sucursal })` → solo transacciones de su sucursal.
- `asesor`: `scoped(..., { asesor })` sobre cotizaciones/facturas (por `asesor_id`) → solo sus clientes. **Consistente con RLS** existente (`can_read_row(sucursal_id, unidad_negocio_id, asesor_id)` en cotizaciones/facturas/ventas_perdidas). `MODULE_ACCESS.cliente_360 = ["gerencia","gerente_comercial","coordinador","asesor"]`.

---

## 5. Roadmap de Implementación

### 5.1 Matriz Esfuerzo vs. Impacto

| #   | Propuesta                                                  | Esfuerzo      | Impacto comercial            | Riesgo desestabilización | Cuadrante       |
| --- | ---------------------------------------------------------- | ------------- | ---------------------------- | ------------------------ | --------------- |
| P1  | M1 `defaultOptions` QueryClient (`router.tsx`)             | XS (1-2h)     | Alto (rendimiento percibido) | Muy bajo                 | **Quick win**   |
| P2  | M2 hook catálogos `staleTime:∞`                            | S (2-3h)      | Medio                        | Bajo                     | Quick win       |
| P3  | Cierre gap RLS presupuestos/cumplimiento (§1.4.4)          | S (3-4h + QA) | Crítico (seguridad)          | Medio-Alto               | **Prioritario** |
| P4  | DataTable sorting/búsqueda/CSV/delta (D3)                  | M (4-6h)      | Medio-Alto                   | Bajo                     | Quick win       |
| P5  | MVs resumen/cotizado/perdidas + refresh en pipeline        | M (6-8h)      | Alto                         | Medio                    | Estratégico     |
| P6  | RPC embudo scopeado (§1.4.3)                               | S (3-4h)      | Medio                        | Medio                    | Estratégico     |
| P7  | Sparklines + KpiCard delta (D1/D4)                         | M (4-6h)      | Alto (densidad)              | Bajo                     | Quick win       |
| P8  | Command Palette global (F1)                                | M (5-7h)      | Medio-Alto (UX)              | Bajo                     | Alto valor      |
| P9  | Aplicar `cobranzas_snapshots` + snapshot en pipeline       | S (3-4h)      | Alto (habilita forecast)     | Bajo                     | Habilitador     |
| P10 | `forecast.ts` (Holt-Winters + MAPE) + tests                | M (6-8h)      | Alto                         | Bajo                     | Estratégico     |
| P11 | Módulo Cliente 360° + Riesgo                               | L (12-16h)    | Muy alto                     | Medio                    | Gran apuesta    |
| P12 | Analytics churn/LTV/cohortes/anomalías/cross-sell          | L (16-20h)    | Muy alto                     | Bajo (funciones puras)   | Gran apuesta    |
| P13 | Módulo Comisiones Proyectadas                              | L (12-16h)    | Alto                         | Medio                    | Gran apuesta    |
| P14 | Módulo Simulador de Presupuesto                            | XL (16-24h)   | Alto (estratégico)           | Medio                    | Gran apuesta    |
| P15 | Small multiples heatmap + memo/`content-visibility` charts | M (5-7h)      | Medio                        | Bajo                     | Pulido          |

### 5.2 Plan secuencial por fases

**Fase 0 — Estabilización y seguridad (semana 1). Sin nuevos módulos.**
Orden exacto de archivos a tocar, de menor a mayor riesgo:

1. `src/router.tsx` — P1 (defaultOptions + `defaultPreloadStaleTime`).
2. `src/hooks/use-catalogos.ts` (nuevo) — P2; reemplazar las definiciones `["sucursales"]`/`["unidades"]` duplicadas en `gerencia-nacional.tsx`, `resumen.tsx`, `coordinador.tsx`, `asesores.tsx`.
3. Nueva migración `20260714120000_scope_presupuestos_cumplimiento.sql` — P3; **validar `can_read_row` con `role-view-qa-checklist.md` antes de merge** (riesgo de romper la vista del coordinador). Este es el único cambio que puede romper lecturas: probar los 4 roles en staging.

**Fase 1 — Densidad de datos y quick wins de UX (semana 2).** 4. `src/components/resumen/DataTable.tsx` + `src/lib/utils.ts` (`exportCSV`) — P4. 5. `src/components/ui/sparkline.tsx` (nuevo) + `src/components/kpi-card.tsx` (prop `delta`) — P7. 6. `src/components/command-palette.tsx` (nuevo) montado en `src/components/app-shell.tsx` — P8 (filtrar acciones por `getModulesForRole`).

**Fase 2 — Capa de agregación server-side (semanas 3-4).** 7. Migración de MVs (`mv_resumen_mensual`, `mv_cotizado_mensual`, `mv_perdidas_mensual`) + `refresh_todas_mv()` — P5. 8. `src/integrations/supabase/load-excel.ts` — añadir `await supabase.rpc("refresh_todas_mv")` al final del pipeline; en `src/routes/_app/carga.tsx` invalidar queries tras carga. 9. Migrar `gerencia-nacional.tsx` y `resumen.tsx` a leer de MVs (reduce agregación cliente). RPC embudo P6 + refactor de `embudo.tsx` para usarlo.

**Fase 3 — Predictivo (semana 5). Habilitador + forecast.** 10. Aplicar migración `20260709093000_cobranzas_snapshots.sql` (ya escrita) + paso de snapshot semanal en `load-excel.ts` (INSERT append-only del estado de `cobranzas` con `snapshot_date`) — P9. 11. `src/lib/analytics/forecast.ts` + `.test.ts` + RPC `rpc_serie_facturado_mensual` — P10. Integrar forecast como overlay en `CompanyTrendChart`/`GlobalMonthlyCombo` existentes.

**Fase 4 — Módulos de alto valor (semanas 6-9).** Orden por dependencia y ROI: 12. `src/lib/analytics/{churn,ltv,cohortes,anomalias,cross-sell}.ts` + tests — P12 (funciones puras, bajo riesgo, se testean aisladas antes de tener UI). 13. Módulo **Cliente 360° + Riesgo** (`/cliente-360`) — P11 (consume P12; cubre brechas B2+B4). 14. Módulo **Comisiones Proyectadas** (`/comisiones`) — P13 (tabla `comisiones_reglas` + RPC `rpc_mi_comision`). 15. Módulo **Simulador de Presupuesto** (`/simulador`) — P14 (consume forecast P10 + MVs P5).

**Fase 5 — Pulido (semana 10).** 16. P15: small multiples en heatmap, `React.memo` + `content-visibility` en `components/coordinador/*` y `gerencia-nacional/*`.

### 5.3 Principios de ejecución (no negociables)

- **Cada módulo nuevo** registra su `ModuleKey` en `src/lib/permissions.ts`, su entrada con campo `roles` en `app-shell.tsx`, y aplica `scoped()` en el cliente **más** RLS/RPC scopeado en el servidor. Nunca confiar solo en `scoped()` (es UX-shortcut).
- **Toda lógica de cálculo** vive en `src/lib/analytics/*.ts` como función pura con `.test.ts` (cobertura ≥80%), consumida por rutas — nunca cálculo de negocio embebido en JSX.
- **Todo RPC** sigue el patrón de hardening: `SECURITY DEFINER SET search_path=public`, `REVOKE` a `public`/`anon`, `GRANT EXECUTE` solo a `authenticated`, y re-imposición de scope vía `can_read_row`.
- **Toda MV** con índice único para `REFRESH ... CONCURRENTLY`, refrescada exclusivamente desde el pipeline de carga (determinismo semanal, sin `pg_cron`).
- **Guard de rol siempre después de todos los hooks** (regla documentada en `CLAUDE.md`: bug de "Rendered more hooks"), con queries usando `enabled: canView`.
- Respetar convención del proyecto: español es-VE, sin comentarios superfluos, Prettier printWidth 100, archivos <800 líneas (muchos archivos pequeños).

---

### Archivos clave referenciados (rutas absolutas)

- `D:\Users\v52anap\Documents\CCV 2026\Dashboard Comercial 2026\src\router.tsx` — config QueryClient (P1).
- `D:\Users\v52anap\Documents\CCV 2026\Dashboard Comercial 2026\src\lib\data-scope.ts` — `scoped()` (UX-shortcut, no defensa real).
- `D:\Users\v52anap\Documents\CCV 2026\Dashboard Comercial 2026\src\lib\permissions.ts` — `MODULE_ACCESS`/`ModuleKey` a extender.
- `D:\Users\v52anap\Documents\CCV 2026\Dashboard Comercial 2026\src\routes\_app\gerencia-nacional.tsx` — patrón de fetching/agregación cliente a migrar a MV.
- `D:\Users\v52anap\Documents\CCV 2026\Dashboard Comercial 2026\src\integrations\supabase\load-excel.ts` — enganche de `refresh_todas_mv()` y snapshot de cartera.
- `D:\Users\v52anap\Documents\CCV 2026\Dashboard Comercial 2026\src\lib\analytics\funnel.ts` — base del RPC embudo.
- `D:\Users\v52anap\Documents\CCV 2026\Dashboard Comercial 2026\src\lib\asesores-catalogo.ts` — identidad canónica de 32 asesores para comisiones/anomalías.
- `D:\Users\v52anap\Documents\CCV 2026\Dashboard Comercial 2026\supabase\migrations\20260712120200_harden_rls_policies.sql` — gap `USING(true)` en presupuestos/cumplimiento (P3).
- `D:\Users\v52anap\Documents\CCV 2026\Dashboard Comercial 2026\supabase\migrations\20260709093000_cobranzas_snapshots.sql` — migración escrita, pendiente de aplicar (P9, habilita forecast de cobranzas).
- `D:\Users\v52anap\Documents\CCV 2026\Dashboard Comercial 2026\src\components\resumen\DataTable.tsx` — extender con sorting/CSV/delta (P4).
- `D:\Users\v52anap\Documents\CCV 2026\Dashboard Comercial 2026\src\components\ui\command.tsx` — base del command palette global (P8).

**Fin del documento.**
