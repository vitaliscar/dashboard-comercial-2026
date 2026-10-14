# Avance — Clientes 360 y Presupuesto 2027

Fases terminadas: ~~tachadas~~ y con fecha. Cada cambio deja su evidencia (archivo, consulta o cifra).

## Correcciones previas

- ~~Bloqueo de /cliente-360 al pulsar filtros~~ — 2026-10-14
  - Causa: `useReactTable` recibía `sorting`/`pagination` nuevos en cada render → `_autoResetPageIndex` → `setState` → render infinito.
  - Cambio: `pages/cliente-360.tsx` pagina con `slice` (local). `tsc --noEmit` OK.
  - **Publicado en 4174 — 2026-10-14:** fuente local y servidor con SHA-256 idéntico; build Vite de las 17:23, `cliente-360` servido con el bundle nuevo y HTTP 200. Falta una comprobación interactiva con sesión real de los botones.

## Paso 0 — Evidencia de datos (primera ejecución de ambos planes)

- ~~Conciliación mensual de Servicios 2024–2026 (cron vs PostgreSQL)~~ — 2026-10-14
  - **Causa:** `dump_servicios_json.py` usa `ws.get_all_values()` (texto formateado es-VE, sin decimales: 24.533 → `"24.533"`). `parseNumber()` (`src/lib/excel-parser.ts:1121`) solo trata el punto como miles con 2+ puntos; con uno lo lee como decimal → 24,533 (÷1000).
  - Afecta solo a las filas ≥ $1.000 (594 en 2026). 2024–2025 vienen del backfill AS400 y no están afectados.
  - Lub/Filtros y Cumplimiento no tienen el defecto (sin valores de un punto / ya usan `UNFORMATTED_VALUE`).

    | Mes 2026 | Hoja bruta (corte inicial) | BD antes de corregir |
    |---|---|---|
    | Ene | 206.188 | 71.913 |
    | Feb | 202.297 | 71.004 |
    | Mar | 369.474 | 118.058 |
    | Abr | 219.487 | 87.349 |
    | May | 306.404 | 90.645 |
    | Jun | 382.116 | 108.165 |
    | Jul | 500.939 | 114.909 |
    | Ago | 390.944 | 112.640 |
    | Sep | 520.313 | 128.577 |
    | Oct (parcial) | 38.343 | 10.904 |
    | **Total** | **3.136.505** | **914.166** |

  - La hoja bruta de 2026 ene–sep supera 2025 completo ($3,10 M vs $2,79 M); el importe neto queda documentado abajo. La "caída de −67 %" era el error de carga.
  - **Corrección aplicada 2026-10-14:** el volcado usa `UNFORMATTED_VALUE` y conserva las fechas formateadas. La columna «Real (Sheet)» de la tabla es **bruta**; `getServiciosNuevo()` descuenta el solape Maturín/Puerto La Cruz. PostgreSQL quedó en **$3.006.899,93** para ene–oct y **$2.968.550,82** para ene–sep, un **6,29 %** sobre todo 2025. En septiembre, por ejemplo, la hoja bruta tiene $520.320,17 y la tabla conciliada $399.553,59; $120.766,57 corresponden al solape bruto de Maturín.
- ~~Listado de facturas sin unidad desde el cron activo~~ — 2026-10-14
  - Las 804 filas sin unidad son **11 facturas únicas duplicadas 73–74 veces** (una por corrida desde 28-ago / 11-sep). Real: **$10.720**; inflado: **$776.740**.
  - **Causa:** `scripts/load-facturas-as400.ts` borra solo `unidadNegocioId IN (unidades conocidas)` y luego inserta con `buscarUnidadId()` que puede dar `null` → las filas `null` nunca se borran y se acumulan.
  - Son servicios tipo CURSO/capacitación (p. ej. FA-93116 Prerreducidos Caroní $4.900, Falini $1.200, personas naturales $490–580) sin unidad en catálogo.
  - Log del cron además avisa: `Xibi B.V.|Repuestos` y sucursal `52` no resueltas.
  - **Corrección aplicada 2026-10-14:** el loader borra también las facturas 2026 con `unidad_negocio_id IS NULL` antes de reinsertarlas. Quedaron **11 filas únicas por $10.720**; los duplicados bajaron a **0**. La unidad de esos cursos sigue sin resolver: no se imputó a Servicios sin una regla de negocio confirmada.

## Hallazgos de conciliación posteriores a la recarga

- **Cliente 360 y Resumen tienen bases distintas.** Cliente 360 suma transacciones con código y excluye el cliente interno Consorcio; el KPI oficial de Resumen y el cálculo 2027 usan `presupuestos.ventas_ccv + ventas_xibi + ventas_estrategicas`. En enero–septiembre 2026, para Servicios, son **$2.793.433,81** transaccionales frente a **$2.912.026,91** oficiales. Las diferencias cambian por mes y requieren conciliación de reglas, no copiar un total sobre el otro.
- **Códigos históricos recuperados 2026-10-14.** Se adaptaron y ejecutaron los tres cargadores históricos: CRM, Servicios y Lubricantes/Filtros. Las facturas 2024 tienen código de cliente en **5.506 de 5.595** filas y de asesor en **5.196**; en 2025, **6.918 de 6.964** y **6.530**. Los servicios conservan sus importes y tienen código de cliente en **21.424/21.424 (2024)** y **21.436/21.436 (2025)**; el reporte de Servicios no aporta código de asesor. El histórico de Lubricantes/Filtros preservó **2.504 filas/$1.825.994,89 (2024)** y **3.598/$1.893.472,75 (2025)**. Sus códigos ahora están persistidos.
- **Duplicados históricos sin unidad retirados.** La carga CRM 2024 tenía 48 filas reales repetidas dos veces; 2025 tenía 7 repetidas seis veces. Quedaron 48/$21.094,60 y 7/$5.310,25 respectivamente. Los totales de `facturas` bajaron **$21.094,60 (2024)** y **$26.551,25 (2025)** por esos duplicados. El cargador histórico ya omite las filas estratégicas de Lubricantes/Filtros antes del borrado, para preservar la carga propia de esa unidad.
- **Sucursal histórica no resuelta, visible desde 2026-10-14.** Algunas filas de Guasare, servicios de campo, depósito territorial y Xibi B.V. no tienen `sucursal_id`. Cliente 360 ahora suma esas ventas al facturado de roles con alcance global, y muestra el importe como «Sin sucursal» fuera del reparto cartera/esporádicos y del detalle. No se inventa una sucursal. Fuera del cliente interno Consorcio son **$116.502,02 en 2024**, **$14.294,51 en 2025** y **$1.462,44 en 2026**. Los roles acotados a sucursal no reciben ventas ajenas a su alcance.
- **Servicios 2026 sin asesor.** De 13.667 filas tras excluir al cliente interno Consorcio, todas carecen de `codigo_asesor`; 112 carecen de `codigo_cliente`. La atribución por cartera vigente necesita distinguir explícitamente los casos sin asesor único.
- **Vigencia de cartera.** El padrón cargado es el de 2026; la pantalla ahora etiqueta explícitamente como retrospectiva la comparación de ventas 2024–2025 con ese padrón. Sigue pendiente cargar vigencias históricas antes de tratar esas etiquetas como asignaciones de cada año.

## Plan 1 — Clientes 360 y atribución de ventas

1. [ ] Medir el punto de partida (cierre mensual 2024–2026, conciliado con Resumen)
2. [ ] Corregir la carga programada (nº de servicio col. S, tipo de venta col. Q, códigos; reglas de unidad; reproceso idempotente)
3. [ ] Preparar CRM y cartera ("Oportunidades Detallado" vía cron; vigencia de cartera; padrón de 15 asesores)
4. [ ] Atribuir cada venta una sola vez (venta → CRM → cartera vigente → «Casa»; `codigo_asesor_atribuido`, `origen_atribucion`)
5. [ ] Completar API y pantalla de Cliente 360
6. [ ] Conciliar y publicar (atribuido + Casa = total; permisos por rol; local y 4174)

## Plan 2 — Presupuesto y crecimiento 2027

1. [x] Corregir el parseo de Servicios 2026 y los duplicados de facturas sin unidad. Los 11 cursos únicos siguen pendientes de clasificación; no se imputaron artificialmente a Servicios.
2. [x] Calcular la proyección 2026 con estacionalidad 2024–2025 y mostrar un backtest 2025 por unidad, con error y dirección del sesgo.
3. [ ] Definir la meta 2027 por causas comerciales
4. [ ] Extender versiones y escenarios (rutas con año como parámetro)
5. [ ] Reorganizar la página en cuatro vistas (Crecimiento, Plan 2027, Escenarios, Seguimiento)
6. [ ] Validar y publicar

## Bitácora

| Fecha | Qué | Evidencia |
|---|---|---|
| 2026-10-14 | Paso 0 cerrado: Servicios 2026 subcargado $2,22 M (parseo de miles); facturas sin unidad = 11 únicas × 73 duplicados ($776.740 inflados). Pendiente de aprobación: corregir cargadores y limpiar BD de producción. | Consultas en `dashboard-comercial-postgres`, `/tmp/servicios_sheet.json`, `/tmp/cierres_aux.json`, `reconciliar-mensual.log` |
| 2026-10-14 | Servicios 2026 entra por otra vía que 2024–2025: hoja "Servicios" del Sheet → `/tmp/servicios_sheet.json` → `scripts/load-servicios-from-sheet.ts` (borra y recarga solo ≥ 2026-01-01). 2024–2025 vienen del backfill histórico AS400. | `/home/ubuntu/reconciliar-mensual.sh`, `getServiciosNuevo()` en `src/lib/excel-parser.ts` |
| 2026-10-14 | Cargadores corregidos en el cron activo y recargadas solo las tablas afectadas bajo el mismo lock del cron. Servicios 2026: $908.904,64 → $3.006.899,93 netos; facturas sin unidad: 804/$787.460 → 11/$10.720. Servicios 2024 y 2025 permanecen en $2.581.433,79 y $2.792.945,09. | Respaldo `/home/ubuntu/backups/conciliacion_clientes_presupuesto_20261014_171658/` (dump de ambas tablas y scripts originales); consultas PostgreSQL por año/mes y unicidad. |
| 2026-10-14 | Build Vite de 4174 actualizado con la corrección ya existente de Cliente 360. Se confirmó que el servidor entrega el nuevo asset y responde HTTP 200; la prueba de clics con sesión real sigue pendiente. | `dist/public/index.html` 17:23; asset `cliente-360-qIJSZbBd.js`; `dashboard-vite-web.service` activo. |
| 2026-10-14 | Backfill de códigos históricos 2024–2025 completado en Servicios, CRM y Lubricantes/Filtros. Los importes de Servicios y de todas las unidades conocidas de facturas quedaron idénticos; se retiraron $47.645,85 de duplicados históricos sin unidad. | Dry runs por año y unidad; respaldo adicional `antes_backfill_codigos.dump`; consultas PostgreSQL de filas, importes y códigos después de cada recarga. |
| 2026-10-14 | Cliente 360 publicado en 4174 con bucket «Sin sucursal» para totales globales y aviso de calidad. API y frontend compilados; comprobación de tipos local en ambos paquetes; servicios API/web activos y nueva versión servida. La prueba interactiva autenticada sigue pendiente porque este entorno no dispone de navegador conectado. | `cliente-360.ts` de API, `cliente-360-http.ts`, `pages/cliente-360.tsx`; asset `cliente-360-CaDz19jU.js`; API reiniciada y HTTP 401 esperado sin sesión; web HTTP 200. |
| 2026-10-14 | Backtest del método 2027: se proyectó 2025 con enero–septiembre 2025 y estacionalidad 2024. Alquiler +4,4 %, Equipos +9,1 %, Lubricantes/Filtros −21,1 %, Repuestos −7,5 % y Servicios +12,9 % frente al cierre real. Lubricantes/Filtros y Servicios superan 10 % de desvío y quedan destacados en pantalla; la estimación exige revisión comercial antes de aprobar una meta. | `calcularPresupuesto2027()` y tabla «Precisión de la proyección» en el componente 2027. |
| 2026-10-14 | Se detectó que la metodología 2027 ya estaba integrada en la página local, pero el componente y su importación faltaban en el servidor 4174. Se publicó el componente junto con el cálculo de backtest y la integración de la página; el cambio no altera metas aprobadas ni presupuestos vigentes. Tipos API/web sin errores, build servido como `presupuestos-D1gZSlwd.js`, web HTTP 200, API reiniciada y HTTP 401 esperado sin sesión. Falta la prueba autenticada en navegador. | `pages/presupuestos.tsx`, `components/budget/presupuesto-2027-methodology.tsx`, `lib/presupuesto-2027.ts`; respaldo previo en `budget_before_backtest/`. |
