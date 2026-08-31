-- alertas.clave_natural nunca tuvo UNIQUE: reconcileAlertasAction
-- (src/lib/actions/alertas.ts) hacia un patron check-then-act (SELECT
-- existentes, decide UPDATE vs INSERT en memoria) sin ON CONFLICT ni
-- bloqueo. Dos visitas concurrentes a /alertas podian insertar la misma
-- alerta logica dos veces. Confirmado en datos reales antes de este fix
-- (30 grupos duplicados en la carga actual).

-- Dedup: para cada clave_natural repetida, conservar solo la fila mas
-- reciente (updated_at, luego id como desempate).
DELETE FROM alertas a
USING alertas b
WHERE a.clave_natural = b.clave_natural
  AND a.id <> b.id
  AND (a.updated_at, a.id) < (b.updated_at, b.id);

ALTER TABLE alertas
  ADD CONSTRAINT alertas_clave_natural_key UNIQUE (clave_natural);

-- El UNIQUE de arriba ya crea su propio indice — el indice plano original
-- queda redundante.
DROP INDEX IF EXISTS alertas_clave_natural_idx;
