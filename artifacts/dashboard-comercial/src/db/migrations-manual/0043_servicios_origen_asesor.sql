-- La API Vite lee el asesor atribuido y su procedencia en la tabla compartida.
ALTER TABLE servicios ADD COLUMN IF NOT EXISTS origen_asesor text;
CREATE INDEX IF NOT EXISTS servicios_numero_cliente_2026_idx
  ON servicios (numero_servicio, codigo_cliente)
  WHERE fecha >= DATE '2026-01-01' AND numero_servicio IS NOT NULL;
