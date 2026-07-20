-- Histórico semanal de cartera para análisis de tendencia de cobranza.
-- No reemplaza la tabla operativa `cobranzas`; agrega snapshots append-only.

CREATE TABLE IF NOT EXISTS public.cobranzas_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    snapshot_date DATE NOT NULL,
    cliente TEXT NOT NULL,
    factura_numero TEXT,
    fecha_emision DATE NOT NULL,
    fecha_vencimiento DATE NOT NULL,
    monto NUMERIC(14, 2) NOT NULL DEFAULT 0,
    saldo NUMERIC(14, 2) NOT NULL DEFAULT 0,
    sucursal_id UUID REFERENCES public.sucursales (id) ON DELETE SET NULL,
    unidad_negocio_id UUID REFERENCES public.unidades_negocio (id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cobranzas_snapshots_snapshot_date ON public.cobranzas_snapshots (snapshot_date);

CREATE INDEX IF NOT EXISTS idx_cobranzas_snapshots_cliente_fecha ON public.cobranzas_snapshots (cliente, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_cobranzas_snapshots_scope ON public.cobranzas_snapshots (
    sucursal_id,
    unidad_negocio_id,
    snapshot_date DESC
);

GRANT
SELECT, INSERT,
UPDATE, DELETE ON public.cobranzas_snapshots TO authenticated;

GRANT ALL ON public.cobranzas_snapshots TO service_role;

ALTER TABLE public.cobranzas_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read cobranzas_snapshots" ON public.cobranzas_snapshots FOR
SELECT TO authenticated USING (
        public.can_read_row (
            sucursal_id, unidad_negocio_id, NULL
        )
    );

CREATE POLICY "manage cobranzas_snapshots" ON public.cobranzas_snapshots FOR ALL TO authenticated USING (
    public.has_role (auth.uid (), 'gerencia')
    OR public.has_role (auth.uid (), 'coordinador')
)
WITH
    CHECK (
        public.has_role (auth.uid (), 'gerencia')
        OR public.has_role (auth.uid (), 'coordinador')
    );