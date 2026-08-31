-- Indices faltantes sobre las columnas que can_read_row() (RLS) filtra fila
-- por fila para coordinador/gerente_comercial/asesor. Sin estos indices,
-- Postgres recurre a Seq Scan sobre estas tablas en cada consulta scoped
-- por rol, degradando linealmente con el crecimiento de datos.

CREATE INDEX IF NOT EXISTS "cobranzas_sucursal_id_idx" ON "cobranzas" ("sucursal_id");
CREATE INDEX IF NOT EXISTS "cobranzas_unidad_negocio_id_idx" ON "cobranzas" ("unidad_negocio_id");

CREATE INDEX IF NOT EXISTS "cobranzas_equipos_sucursal_id_idx" ON "cobranzas_equipos" ("sucursal_id");

CREATE INDEX IF NOT EXISTS "minutas_sucursal_id_idx" ON "minutas" ("sucursal_id");
CREATE INDEX IF NOT EXISTS "minutas_unidad_negocio_id_idx" ON "minutas" ("unidad_negocio_id");

CREATE INDEX IF NOT EXISTS "alertas_sucursal_id_idx" ON "alertas" ("sucursal_id");
CREATE INDEX IF NOT EXISTS "alertas_unidad_negocio_id_idx" ON "alertas" ("unidad_negocio_id");
CREATE INDEX IF NOT EXISTS "alertas_asesor_id_idx" ON "alertas" ("asesor_id");

CREATE INDEX IF NOT EXISTS "presupuestos_sucursal_id_idx" ON "presupuestos" ("sucursal_id");
CREATE INDEX IF NOT EXISTS "presupuestos_unidad_negocio_id_idx" ON "presupuestos" ("unidad_negocio_id");

CREATE INDEX IF NOT EXISTS "cumplimiento_asesores_sucursal_id_idx" ON "cumplimiento_asesores" ("sucursal_id");
CREATE INDEX IF NOT EXISTS "cumplimiento_asesores_unidad_negocio_id_idx" ON "cumplimiento_asesores" ("unidad_negocio_id");
CREATE INDEX IF NOT EXISTS "cumplimiento_asesores_asesor_id_idx" ON "cumplimiento_asesores" ("asesor_id");

CREATE INDEX IF NOT EXISTS "ventas_casa_sucursal_id_idx" ON "ventas_casa" ("sucursal_id");
CREATE INDEX IF NOT EXISTS "ventas_casa_unidad_negocio_id_idx" ON "ventas_casa" ("unidad_negocio_id");

CREATE INDEX IF NOT EXISTS "equipos_inventario_sucursal_id_idx" ON "equipos_inventario" ("sucursal_id");
CREATE INDEX IF NOT EXISTS "equipos_inventario_unidad_negocio_id_idx" ON "equipos_inventario" ("unidad_negocio_id");

CREATE INDEX IF NOT EXISTS "equipos_facturacion_sucursal_id_idx" ON "equipos_facturacion" ("sucursal_id");
CREATE INDEX IF NOT EXISTS "equipos_facturacion_unidad_negocio_id_idx" ON "equipos_facturacion" ("unidad_negocio_id");

CREATE INDEX IF NOT EXISTS "equipos_presupuesto_sucursal_id_idx" ON "equipos_presupuesto" ("sucursal_id");
CREATE INDEX IF NOT EXISTS "equipos_presupuesto_unidad_negocio_id_idx" ON "equipos_presupuesto" ("unidad_negocio_id");

CREATE INDEX IF NOT EXISTS "equipos_por_marca_sucursal_id_idx" ON "equipos_por_marca" ("sucursal_id");
CREATE INDEX IF NOT EXISTS "equipos_por_marca_unidad_negocio_id_idx" ON "equipos_por_marca" ("unidad_negocio_id");

-- asesor_id: can_read_row() lo usa como tercer parametro de scope para el rol 'asesor'.
CREATE INDEX IF NOT EXISTS "cotizaciones_asesor_id_idx" ON "cotizaciones" ("asesor_id");
CREATE INDEX IF NOT EXISTS "facturas_asesor_id_idx" ON "facturas" ("asesor_id");
CREATE INDEX IF NOT EXISTS "ventas_perdidas_asesor_id_idx" ON "ventas_perdidas" ("asesor_id");
