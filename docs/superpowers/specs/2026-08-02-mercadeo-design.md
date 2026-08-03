# Módulo Mercadeo — Diseño

**Fecha:** 2026-08-02
**Estado:** Implementado — ver `docs/superpowers/plans/2026-08-02-mercadeo.md`

## 1. Contexto y objetivo

Se agregaron 6 hojas nuevas al Excel de carga (`CCV Rendimiento.xlsx`): `Canales`, `Instagram`, `Google My Business`, `Post Historias`, `Ventas Clientes Potenciales`, `Clientes Potenciales`. Se necesita:

1. Un menú nuevo **"Mercadeo"**, visible solo para el rol `gerencia` (Gerencia Nacional), con el panorama completo de las 6 hojas.
2. Una sección **"Clientes Potenciales"** embebida en cada página de unidad de negocio (`servicios`, `equipos`, `lubfiltros`, `repuestos`, `alquiler`), visible para `gerente_comercial`, con datos agregados (embudo por estatus + KPIs de monto) filtrados a su unidad — sin el detalle de contacto individual.

`Ventas Clientes Potenciales` queda **fuera del alcance v1** (solo 5 filas cargadas hoy en el Excel — se revisará cuando haya más data).

## 2. Modelo de datos

Tablas nuevas en `src/db/schema.ts` (uuid PK, `created_at`, siguiendo el patrón existente):

### `mercadeo_canales`

`canal` (text) · `tipo` (text) · `mes` (integer) · `cantidad` (numeric)
Texto libre para `canal`/`tipo` — son 7 canales × 21 tipos de métrica distintos, sin catálogo propio.

### `mercadeo_instagram`

`tipo` (text) · `mes` (integer) · `cantidad` (numeric)
Sin columna canal (siempre Instagram). Detalle propio de Instagram (Visualizaciones, Alcance, Interacciones, Seguidores, Clicks en enlace, Visitas) — más granular que la fila "Instagram" agregada en `mercadeo_canales`.

### `mercadeo_google_business`

`sucursal_id` (uuid, FK → `sucursales`) · `mes` (integer) · `tipo` (text) · `cantidad` (numeric)

### `mercadeo_post_historias`

`tipo_publicacion` (text: "Post" | "Historia") · `unidad_negocio` (text libre) · `marca` (text) · `mes` (integer) · `cantidad` (integer, siempre 1 en origen — se agrega por conteo)
`unidad_negocio` es texto libre (sin FK) porque trae categorías de contenido que no son unidades de negocio reales (Entrenamiento, Branding, RRHH, Eventos, Proyectos).

### `clientes_potenciales`

Columnas relevantes del Excel (se descartan columnas puramente de auditoría CRM que no aportan al dashboard: `Modificado Por`, `Cuenta`, `Origen`, `Estatus SIV`, `Cód.Cliente Pot.`):

- `sucursal_id` (uuid, FK → `sucursales`)
- `tipo_negocio` (text libre — no FK; incluye "Entrenamiento Técnico" que no es una unidad real)
- `razon_social`, `nombre_contacto`, `correo`, `telefono`, `identificacion_fiscal` (PII)
- `fecha_detectada` (date)
- `estatus_bis` (text: Nuevo | Asignado | En proceso | Convertidos | Cerrado perdido | Cerrado sin negocio | Desconocido)
- `etapa_oportunidad` (text, nullable: Desarrollo | Propuesta-Negociación | Cerrado ganado | Cerrado perdido | Cerrado sin negocio | Excluida | Desconocido)
- `toma_contacto` (text — canal de origen del lead: WhatsApp, Instagram, Correo, GMB, Página Web, Llamada, Contacto estratégico, Línea 0800, Visita de Campo, Facebook)
- `campana` (text, nullable)
- `usuario_asignado` (text)
- `ingresos_esperados` (numeric — columna AD "Ingresos Esperados Base")
- `monto_facturado_base` (numeric — columna AE "Monto Total Facturado Base (Tasa Neg.)")
- `id_cliente_potencial` (integer — id de origen del Excel, para trazabilidad en recargas)

### Cambio al catálogo existente

Se agrega **"San Cristóbal"** a la tabla `sucursales` (aparece en `Google My Business` y `Clientes Potenciales`, no existe hoy). Es exclusivamente para soportar estas hojas nuevas — **no debe aparecer en ningún otro filtro/selector de sucursal del sistema** (repuestos, servicios, gerencia-nacional, cobranzas, resumen, etc. — todo lo que hoy consume `useSucursales()`/`getSucursalesAction()`).

Como `getSucursalesAction()` (`src/lib/actions/catalogos.ts`) es la única fuente compartida por `useSucursales()` — usada por prácticamente todos los `FilterHeader` del sistema —, insertar la fila sin más la filtraría en todos lados. Fix explícito:

- Nueva columna `sucursales.visible_general` (boolean, default `true`). San Cristóbal se inserta con `visible_general = false`.
- `getSucursalesAction()` agrega `WHERE visible_general = true` — así todo el resto del sistema (que sigue llamando este action sin cambios) deja de ver San Cristóbal automáticamente, sin tocar cada página una por una.
- El módulo Mercadeo (tanto `/mercadeo` como las secciones embebidas por unidad) usa una acción propia `getSucursalesMercadeoAction()` (o el mismo `getSucursalesAction` con un parámetro `{ incluirTodas: true }`) que sí trae San Cristóbal, para los selectores/tablas de `Google My Business` y `Clientes Potenciales` por sucursal.

## 3. Reglas de negocio — cálculo de montos en Clientes Potenciales

Dos KPIs de dinero, ambos derivados de la misma tabla con condiciones distintas:

- **Monto Facturado** (venta cerrada) = `SUM(monto_facturado_base)` WHERE `estatus_bis = 'Convertidos'` **y** `etapa_oportunidad = 'Cerrado ganado'`.
- **Monto en Orden de Venta** (dinero ya en caja, pendiente de facturar) = `SUM(ingresos_esperados)` WHERE `estatus_bis = 'Convertidos'` **y** `etapa_oportunidad = 'Propuesta-Negociación'`.

Filas que no cumplen ninguna de las dos combinaciones no se cuentan en ninguno de estos dos montos (pueden seguir contando en el embudo por `estatus_bis` como KPI de volumen, solo no aportan a los KPIs de dinero).

Todos los demás cruces (por sucursal, por mes vía `fecha_detectada`, por unidad vía `tipo_negocio`, por canal de origen vía `toma_contacto`) se hacen directo por columna, sin condiciones especiales.

## 4. Carga de datos (loader)

Se extiende `src/db/load-excel.ts` (mismo pipeline delete+insert por tabla, mismo cliente `dbAdmin` con BYPASSRLS) agregando las 5 hojas en alcance. El loader normaliza `sucursal` al cargar `Google My Business` y `Clientes Potenciales` (tildes y variantes: "Maturin"→"Maturín", "Direccion General"→"Dirección General", etc.), igual que ya hace para otras hojas con drift de nombres.

`scripts/run-full-load.ts` no cambia de forma — solo crece el conjunto de tablas que `loadExcelToPostgres` puebla.

## 5. Permisos y navegación

- Nuevo `ModuleKey`: `"mercadeo"` en `src/lib/permissions.ts`.
- `MODULE_ACCESS.mercadeo = ["gerencia"]` — únicamente Gerencia Nacional ve el menú y la ruta `/mercadeo`.
- Nuevo grupo en el sidebar (`src/components/app-shell.tsx`): **"Mercadeo"**, un solo ítem apuntando a `/mercadeo`.
- La sección embebida de Clientes Potenciales en las páginas de unidad **no** pasa por `canAccessModule` — es parte del contenido normal de esas páginas (ya gateadas por `MODULE_ACCESS.servicios/equipos/lubfiltros/repuestos/alquiler`, que incluyen `gerencia` y `gerente_comercial`). Para `gerencia` viendo esas páginas de unidad, también vería la sección agregada (sin problema, es la misma data que ya ve completa en `/mercadeo`).

## 6. Vista Gerencia Nacional (`/mercadeo`)

Página nueva `src/app/(app)/mercadeo/page.tsx`, con `FilterHeader` (mes/año — sin filtro de sucursal/unidad multi-select por ahora, se puede agregar después si hace falta) y estas secciones:

1. **Canales** — comparativa multicanal (Página Web, LinkedIn, Facebook, WhatsApp, Móvil, YouTube, Instagram): selector de `tipo` de métrica (Visitas, Impresiones, Alcance, Interacciones, etc. — los 21 valores que trae la hoja) + gráfico de barras/línea mensual por canal para el tipo elegido, igual patrón que el selector "Cotizado/Facturado/Perdido" que ya existe en Pareto de Asesores.
2. **Instagram** — detalle mensual propio (Visualizaciones, Alcance, Interacciones, Seguidores, Clicks, Visitas).
3. **Google My Business** — por sucursal (interacciones, vistas, búsquedas, llamadas, clicks a WhatsApp/web, reservas).
4. **Post e Historias** — conteo por tipo de publicación, marca y unidad/categoría de contenido.
5. **Clientes Potenciales** (pieza central):
   - KPIs: total de leads, nuevos, convertidos, tasa de conversión, Monto Facturado, Monto en Orden de Venta.
   - Embudo por `estatus_bis` (barras o funnel).
   - Tabla completa buscable con detalle de contacto (nombre, correo, teléfono, sucursal, unidad, estatus, etapa, monto) — mismo patrón que `ReceivablesTable`.

## 7. Vista embebida por unidad (gerente comercial)

En cada página de unidad se agrega una sección **"Clientes Potenciales"**, usando el mismo server action que alimenta la pieza 5 de arriba, filtrado por `tipo_negocio` correspondiente a esa unidad (mapeo directo: Servicios→"Servicios", Equipos→"Equipos", Repuestos→"Repuestos", Alquiler→"Alquiler"). Contenido:

- KPIs: total leads, convertidos, tasa de conversión, Monto Facturado, Monto en Orden de Venta (mismas reglas de la sección 3, ya acotadas a la unidad).
- Embudo por `estatus_bis`.
- **Sin tabla de contacto individual** — solo agregados, para no exponer PII a nivel de unidad.

**Nota de datos:** hoy `tipo_negocio` en el Excel no trae ningún valor equivalente a "Lub/Filtros" (los 5 valores actuales son Repuestos, Equipos, Entrenamiento Técnico, Servicios, Alquiler). La sección en `lubfiltros/page.tsx` se implementa igual que las demás, pero mostrará estado vacío hasta que aparezca data con ese tipo de negocio en el Excel — no es un bug, es reflejo de los datos actuales.

## 8. Seguridad — RLS y PII

- `mercadeo_canales`, `mercadeo_instagram`, `mercadeo_google_business`, `mercadeo_post_historias`: RLS de un solo gate — `current_app_role() = 'gerencia'`. No se filtra por sucursal/unidad porque solo gerencia las ve.
- `clientes_potenciales`: RLS gate por rol — `current_app_role() IN ('gerencia', 'gerente_comercial')`. **No se filtra por unidad a nivel de RLS** (mismo caso documentado que `equipos_facturacion_sucursal`: `tipo_negocio` es texto libre, no hay FK real a `unidades_negocio` contra la cual comparar con `can_read_row`). El acotado por unidad para `gerente_comercial` se hace en el server action (WHERE `tipo_negocio` = la unidad del perfil, resuelta igual que en el resto del sistema vía `profile.unidades_negocio_ids`).
- El server action que alimenta la vista por unidad **nunca** selecciona columnas de contacto (correo/teléfono/identificación_fiscal/razón_social/nombre_contacto) — devuelve directamente agregados, no filas crudas con PII recortada en el cliente. Esto es una decisión de diseño del action, no solo de UI.
- La tabla detallada de `/mercadeo` (solo accesible a `gerencia`) sí expone el detalle de contacto completo.

## 9. Fuera de alcance (v1)

- Hoja `Ventas Clientes Potenciales` (muy poca data cargada).
- Filtro de sucursal/unidad multi-select en `/mercadeo` (se puede agregar en una iteración futura si se necesita).
- Cruce entre `toma_contacto` (canal de origen del lead) y las métricas de tráfico de `mercadeo_canales`/`mercadeo_instagram`/`mercadeo_google_business` (dato interesante pero no pedido en esta iteración).
