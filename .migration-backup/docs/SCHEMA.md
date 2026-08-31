# Esquema real de Supabase (producción)

Este documento refleja el esquema **efectivamente vigente en la base de datos de producción**,
verificado el 2026-07-09 mediante el endpoint OpenAPI de PostgREST (`GET {SUPABASE_URL}/rest/v1/`
con la service role key), no a partir de los archivos de migración ni de `types.ts` — ambos
habían divergido silenciosamente del esquema real (ver "Drift conocido" más abajo).

`src/integrations/supabase/types.ts` fue regenerado a mano a partir de este mismo snapshot y
debe mantenerse sincronizado con él. Ante cualquier duda sobre nombre de tabla/columna, este
archivo y `types.ts` son la fuente de verdad — no `supabase/migrations/*.sql` ni
`docs/supabase-schema.sql` (obsoleto).

## Drift conocido entre migraciones y producción

- **`cotizaciones.asesor`**: la migración inicial (`20260702201106_*.sql`) declara una columna
  `asesor TEXT`, pero la tabla real **no la tiene** — solo tiene `asesor_codigo` y `asesor_id`.
  En algún momento se renombró/eliminó directamente en producción sin una migración que lo
  documentara. Todo el código que necesite el nombre del asesor en cotizaciones debe resolver
  `asesor_codigo` contra `cumplimiento_asesores.codigo_asesor` (que sí tiene el nombre completo).
- **Enum `cotizacion_etapa`**: la migración inicial define
  `'prospecto' | 'presentada' | 'negociacion' | 'ganada' | 'perdida'`, pero el enum real en
  producción es `'desarrollo' | 'propuesta_negociacion' | 'venta_perdida' | 'desconocido'` (ver
  el mapeo `ETAPA_CANONICA` en `src/lib/excel-parser.ts`). **`propuesta_negociacion` es la etapa
  que recibe las cotizaciones "Convertida en Orden" del Excel — funcionalmente es la etapa
  "ganada"**, pese al nombre.
- **Tablas creadas sin drift documentado pero coherentes con su migración**: `servicios`,
  `equipos_inventario`, `equipos_facturacion`, `equipos_presupuesto`,
  `equipos_facturacion_sucursal`, `equipos_por_marca`, `cobranzas_equipos` (todas de
  `20260703120000_equipos_servicios.sql`) — existían en producción pero nunca se habían
  incorporado a `types.ts`, lo que rompía la inferencia de tipos de Supabase en cualquier query
  contra ellas (ver commit de corrección de `types.ts`).
- **`cobranzas_snapshots`**: la migración `20260709093000_cobranzas_snapshots.sql` existe en el
  repo pero **no está aplicada en producción** (no aparece en el schema OpenAPI en vivo). Es la
  base para el histórico de cartera (Fase 2 del plan de expansión, diferida) — aplicarla es un
  paso pendiente antes de construir esa funcionalidad.

## Tablas (18 en producción)

Notación: `col` = nullable, **`col`** = NOT NULL. `PK` = primary key (`uuid`, `gen_random_uuid()`).

### Comerciales / transaccionales

| Tabla               | Columnas                                                                                                                                                                                                                    | Notas                                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `cotizaciones`      | **id** PK, **fecha**, **cliente**, `asesor_codigo`, `asesor_id`, `sucursal_id`, **unidad_negocio_id**, `nro_cotizacion`, **monto**, **monto_facturado**, **monto_perdido**, **etapa** (enum), `descripcion`, **created_at** | Sin columna `asesor` (ver drift). `unidad_negocio_id` es NOT NULL aquí, a diferencia de facturas/ventas_perdidas. |
| `facturas`          | **id**, **fecha**, `numero`, **cliente**, `asesor`, `asesor_id`, `sucursal_id`, `unidad_negocio_id`, **monto**, **created_at**                                                                                              |                                                                                                                   |
| `ventas_perdidas`   | **id**, **fecha**, **cliente**, `asesor`, `asesor_id`, `sucursal_id`, `unidad_negocio_id`, **monto**, **razon**, **created_at**                                                                                             |                                                                                                                   |
| `servicios`         | **id**, **fecha**, **cliente**, **monto**, `tipo_servicio`, `categoria_venta`, `compania`, `asesor`, `sucursal_id`, `unidad_negocio_id`, **created_at**                                                                     |                                                                                                                   |
| `cobranzas`         | **id**, **cliente**, `factura_numero`, **fecha_emision**, **fecha_vencimiento**, **monto**, **saldo**, `sucursal_id`, `unidad_negocio_id`, **created_at**                                                                   | Estado actual únicamente — sin histórico (ver `cobranzas_snapshots`).                                             |
| `cobranzas_equipos` | **id**, **cliente**, **monto**, **saldo**, `sucursal_id`, **created_at**                                                                                                                                                    | Cartera específica de Equipos/Alquiler. Sin `unidad_negocio_id`.                                                  |
| `minutas`           | **id**, **fecha**, `sucursal_id`, `unidad_negocio_id`, **cliente**, **descripcion**, **responsable**, `responsable_id`, `fecha_limite`, **estado** (enum), `created_by`, `updated_by`, **created_at**, **updated_at**       |                                                                                                                   |

### Presupuesto / cumplimiento

| Tabla                   | Columnas                                                                                                                                                                                           | Notas                                                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `presupuestos`          | **id**, **anio**, **mes**, `sucursal_id`, `unidad_negocio_id`, **monto**, **ventas_ccv**, **ventas_xibi**, **ventas_estrategicas**                                                                 | Fuente de verdad del KPI "Facturado" (no `facturas`, que es transaccional y no reconciliada).                   |
| `cumplimiento_asesores` | **id**, **anio**, **mes**, **codigo_asesor**, **asesor**, `asesor_id`, `sucursal_id`, `unidad_negocio_id`, **presupuesto**, **venta**, **pct_cumplimiento**, **pct_participacion**, **created_at** | Única tabla con el nombre completo del asesor junto a su código — úsala para resolver `asesor_codigo` → nombre. |

### Equipos (dashboard Equipos)

| Tabla                          | Columnas                                                                                                               |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `equipos_inventario`           | **id**, **anio**, **mes**, **marca**, **disponible**, **transito**, `sucursal_id`, `unidad_negocio_id`, **created_at** |
| `equipos_facturacion`          | **id**, **anio**, **mes**, **facturado**, **presupuesto**, `sucursal_id`, `unidad_negocio_id`, **created_at**          |
| `equipos_presupuesto`          | **id**, **anio**, **monto**, `sucursal_id`, `unidad_negocio_id`, **created_at**                                        |
| `equipos_facturacion_sucursal` | **id**, **anio**, **mes**, **sucursal** (texto, no FK), **facturado**, `unidad_negocio_id`, **created_at**             |
| `equipos_por_marca`            | **id**, **anio**, **mes**, **marca**, **monto**, `sucursal_id`, `unidad_negocio_id`, **created_at**                    |

### Catálogos / identidad

| Tabla              | Columnas                                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `sucursales`       | **id**, **nombre** (unique), `ciudad`, **activa**, **created_at**                                                            |
| `unidades_negocio` | **id**, **nombre** (unique), `descripcion`, **activa**, **created_at**                                                       |
| `profiles`         | **id** (= `auth.users.id`), **email**, `nombre_completo`, `sucursal_id`, `unidad_negocio_id`, **created_at**, **updated_at** |
| `user_roles`       | **id**, **user_id**, **role** (enum `app_role`)                                                                              |

## Enums

- `app_role`: `gerencia` \| `gerente_comercial` \| `coordinador` \| `asesor`
- `cotizacion_etapa`: `desarrollo` \| `propuesta_negociacion` \| `venta_perdida` \| `desconocido` (ver drift arriba)
- `minuta_estado`: `pendiente` \| `en_proceso` \| `cumplido`

## Funciones RPC (`SECURITY DEFINER`)

- `can_read_row(_sucursal uuid, _unidad uuid, _asesor uuid) → boolean` — regla central de alcance por rol, usada en casi todas las policies de `SELECT`.
- `has_role(_user_id uuid, _role app_role) → boolean`
- `get_user_role(_user_id uuid) → app_role`
- `get_user_sucursal(_user_id uuid) → uuid`
- `get_user_unidad(_user_id uuid) → uuid`

## Cómo verificar el esquema real tú mismo

Si vuelves a sospechar drift entre `types.ts` y producción, no confíes en las migraciones —
pídele a Claude (o hazlo manualmente) que llame al endpoint OpenAPI con la service role key:

```bash
curl -s "$SUPABASE_URL/rest/v1/?apikey=$SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" | jq '.definitions | keys'
```

Esto lista las 18 tablas reales y sus columnas/tipos/nullability exactos, sin pasar por RLS.
