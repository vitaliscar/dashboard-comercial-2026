-- Ponderadores del presupuesto 2026 de Chronus (Lubricantes) y Donaldson (Filtros).
-- El API distribuye el presupuesto mensual vigente con estos pesos, por sucursal y línea.
BEGIN;

CREATE TABLE IF NOT EXISTS presupuestos_lubfiltros_ponderadores (
  anio integer NOT NULL CHECK (anio BETWEEN 2000 AND 2200),
  mes integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
  unidad_negocio_id uuid NOT NULL REFERENCES unidades_negocio(id) ON DELETE CASCADE,
  sucursal_id uuid NOT NULL REFERENCES sucursales(id) ON DELETE CASCADE,
  peso_chronus numeric(16,2) NOT NULL CHECK (peso_chronus >= 0),
  peso_donaldson numeric(16,2) NOT NULL CHECK (peso_donaldson >= 0),
  peso_litros numeric(16,2) NOT NULL CHECK (peso_litros >= 0),
  PRIMARY KEY (anio, mes, unidad_negocio_id, sucursal_id),
  CHECK (peso_chronus + peso_donaldson > 0)
);

CREATE INDEX IF NOT EXISTS presupuestos_lubfiltros_ponderadores_scope_idx
  ON presupuestos_lubfiltros_ponderadores (unidad_negocio_id, anio, mes, sucursal_id);

ALTER TABLE presupuestos_lubfiltros_ponderadores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS presupuestos_lubfiltros_ponderadores_select ON presupuestos_lubfiltros_ponderadores;
CREATE POLICY presupuestos_lubfiltros_ponderadores_select
  ON presupuestos_lubfiltros_ponderadores FOR SELECT
  USING (can_read_row(sucursal_id, unidad_negocio_id, NULL::uuid));
GRANT SELECT ON presupuestos_lubfiltros_ponderadores TO app_user;

WITH source(sucursal_key, mes, peso_chronus, peso_donaldson, peso_litros) AS (
  VALUES
    ('ptoordaz', 1, 87601, 1326.81, 16846),
    ('ptoordaz', 2, 79509, 7463.61, 15290),
    ('ptoordaz', 3, 103177, 6374.75, 19842),
    ('ptoordaz', 4, 114940, 8848.33, 22104),
    ('ptoordaz', 5, 123107, 13275.53, 23674),
    ('ptoordaz', 6, 128485, 8994.27, 24709),
    ('ptoordaz', 7, 140120, 11695.25, 26946),
    ('ptoordaz', 8, 147962, 7972.61, 28454),
    ('ptoordaz', 9, 154139, 8428.71, 29642),
    ('ptoordaz', 10, 162997, 8003.02, 31346),
    ('ptoordaz', 11, 170281, 8696.29, 32746),
    ('ptoordaz', 12, 178859, 6856.69, 34396),
    ('fmopiar', 1, 66085, 1000.93, 12709),
    ('fmopiar', 2, 59980, 5630.45, 11535),
    ('fmopiar', 3, 77836, 4809.02, 14968),
    ('fmopiar', 4, 76626, 5898.88, 14736),
    ('fmopiar', 5, 85549, 9225.36, 16452),
    ('fmopiar', 6, 93041, 6513.10, 17893),
    ('fmopiar', 7, 105704, 8822.73, 20328),
    ('fmopiar', 8, 111621, 6014.43, 21466),
    ('fmopiar', 9, 121109, 6622.56, 23290),
    ('fmopiar', 10, 128069, 6288.09, 24629),
    ('fmopiar', 11, 139321, 7115.15, 26793),
    ('fmopiar', 12, 146339, 5610.02, 28142),
    ('ptolacruz', 1, 23837, 599, 4584),
    ('ptolacruz', 2, 1596, 3766, 307),
    ('ptolacruz', 3, 29047, 2464, 5586),
    ('ptolacruz', 4, 29286, 3785, 5632),
    ('ptolacruz', 5, 29640, 5775, 5700),
    ('ptolacruz', 6, 29891, 3980, 5748),
    ('ptolacruz', 7, 30342, 7063, 5835),
    ('ptolacruz', 8, 30575, 3590, 5880),
    ('ptolacruz', 9, 30820, 3863, 5927),
    ('ptolacruz', 10, 31059, 3668, 5973),
    ('ptolacruz', 11, 31330, 4058, 6025),
    ('ptolacruz', 12, 31538, 3200, 6065),
    ('maracaibo', 1, 41933, 431, 8064),
    ('maracaibo', 2, 18908, 1433, 3636),
    ('maracaibo', 3, 28829, 2182, 5544),
    ('maracaibo', 4, 29177, 2243, 5611),
    ('maracaibo', 5, 29729, 3422, 5717),
    ('maracaibo', 6, 30109, 2358, 5790),
    ('maracaibo', 7, 30800, 4185, 5923),
    ('maracaibo', 8, 31158, 2127, 5992),
    ('maracaibo', 9, 31548, 2289, 6067),
    ('maracaibo', 10, 31922, 2173, 6139),
    ('maracaibo', 11, 32349, 2405, 6221),
    ('maracaibo', 12, 32682, 1896, 6285),
    ('barquisimeto', 1, 598, 8560, 115),
    ('barquisimeto', 2, 5247, 3641, 1009),
    ('barquisimeto', 3, 31117, 3689, 5984),
    ('barquisimeto', 4, 31288, 8808, 6017),
    ('barquisimeto', 5, 31543, 9439, 6066),
    ('barquisimeto', 6, 31726, 9262, 6101),
    ('barquisimeto', 7, 32048, 12435, 6163),
    ('barquisimeto', 8, 32213, 8354, 6195),
    ('barquisimeto', 9, 32396, 8989, 6230),
    ('barquisimeto', 10, 32562, 8535, 6262),
    ('barquisimeto', 11, 32750, 9443, 6298),
    ('barquisimeto', 12, 32906, 7446, 6328),
    ('losruices', 1, 7930, 2170, 1525),
    ('losruices', 2, 23889, 962, 4594),
    ('losruices', 3, 13369, 4622, 2571),
    ('losruices', 4, 13463, 4298, 2589),
    ('losruices', 5, 13603, 6558, 2616),
    ('losruices', 6, 13697, 4519, 2634),
    ('losruices', 7, 13874, 8020, 2668),
    ('losruices', 8, 13967, 4076, 2686),
    ('losruices', 9, 14066, 4386, 2705),
    ('losruices', 10, 14159, 4165, 2723),
    ('losruices', 11, 14258, 4608, 2742),
    ('losruices', 12, 14342, 3633, 2758),
    ('puntofijo', 1, 15380, 2468, 2958),
    ('puntofijo', 2, 27684, 4443, 5324),
    ('puntofijo', 3, 30759, 4937, 5915),
    ('puntofijo', 4, 21941, 3237, 4219),
    ('puntofijo', 5, 22469, 4235, 4321),
    ('puntofijo', 6, 23895, 3525, 4595),
    ('puntofijo', 7, 22865, 5231, 4397),
    ('puntofijo', 8, 25413, 3750, 4887),
    ('puntofijo', 9, 26846, 3961, 5163),
    ('puntofijo', 10, 22723, 3352, 4370),
    ('puntofijo', 11, 24028, 3545, 4621),
    ('puntofijo', 12, 21855, 3224, 4203),
    ('valencia', 1, 10249, 1664, 1971),
    ('valencia', 2, 4727, 321, 909),
    ('valencia', 3, 50789, 11624, 9767),
    ('valencia', 4, 51355, 7543, 9876),
    ('valencia', 5, 52229, 9509, 10044),
    ('valencia', 6, 52844, 7932, 10162),
    ('valencia', 7, 53945, 14075, 10374),
    ('valencia', 8, 54516, 7154, 10484),
    ('valencia', 9, 55140, 7699, 10604),
    ('valencia', 10, 55738, 7310, 10719),
    ('valencia', 11, 56404, 8087, 10847),
    ('valencia', 12, 56940, 6377, 10950)
), unit AS (
  SELECT id FROM unidades_negocio
  WHERE regexp_replace(lower(nombre), '[^a-z0-9]', '', 'g') = 'lubricantesfiltros'
  LIMIT 1
), branches AS (
  SELECT id,
    CASE
      WHEN lower(nombre) LIKE '%ordaz%' THEN 'ptoordaz'
      WHEN lower(nombre) LIKE '%piar%' THEN 'fmopiar'
      WHEN lower(nombre) LIKE '%la cruz%' OR lower(nombre) LIKE '%lacruz%' THEN 'ptolacruz'
      WHEN lower(nombre) LIKE '%maracaibo%' THEN 'maracaibo'
      WHEN lower(nombre) LIKE '%barquisimeto%' THEN 'barquisimeto'
      WHEN lower(nombre) LIKE '%ruices%' OR lower(nombre) LIKE '%caracas%' THEN 'losruices'
      WHEN lower(nombre) LIKE '%punto fijo%' OR lower(nombre) LIKE '%puntofijo%' THEN 'puntofijo'
      WHEN lower(nombre) LIKE '%valencia%' THEN 'valencia'
    END AS sucursal_key
  FROM sucursales
)
INSERT INTO presupuestos_lubfiltros_ponderadores
  (anio, mes, unidad_negocio_id, sucursal_id, peso_chronus, peso_donaldson, peso_litros)
SELECT 2026, source.mes, unit.id, branches.id,
       source.peso_chronus, source.peso_donaldson, source.peso_litros
FROM source
CROSS JOIN unit
JOIN branches ON branches.sucursal_key = source.sucursal_key
ON CONFLICT (anio, mes, unidad_negocio_id, sucursal_id) DO UPDATE
SET peso_chronus = EXCLUDED.peso_chronus,
    peso_donaldson = EXCLUDED.peso_donaldson,
    peso_litros = EXCLUDED.peso_litros;

DO $$
BEGIN
  IF (SELECT count(*) FROM presupuestos_lubfiltros_ponderadores WHERE anio = 2026) <> 96 THEN
    RAISE EXCEPTION 'Se esperaban 96 ponderadores 2026 de lubricantes y filtros; revisa nombres de unidad y sucursales.';
  END IF;
END $$;

COMMIT;
