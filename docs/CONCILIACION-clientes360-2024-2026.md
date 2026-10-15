# Conciliación de Clientes 360 con Resumen

Corte: 14 de octubre de 2026. Se comparan años completos 2024–2025 y enero–septiembre de 2026. El detalle mensual por unidad está en [conciliacion-clientes360-2024-2026.csv](./conciliacion-clientes360-2024-2026.csv) (177 combinaciones).

## Criterio

- **Resumen oficial:** `presupuestos.ventas_ccv + ventas_xibi + ventas_estrategicas`, más `ajustes_manuales` por mes, sucursal, unidad y columna. En este corte los 87 ajustes de 2026 tienen sucursal y unidad explícitas, por lo que se aplican una vez a cada combinación mensual.
- **Clientes 360:** `facturas + servicios` por fecha y unidad, excluyendo el cliente interno cuyo nombre contiene `CONSORCIO…COGESTION…VENEQUIP`. Los registros sin sucursal se suman al alcance global; los 11 cursos sin unidad se mantienen como «Sin unidad».
- **Diferencia:** transaccional menos oficial. Una diferencia revela bases o reglas distintas; no se modifica ninguna venta para forzar una igualdad.

| Período | Oficial ajustado | Transaccional | Diferencia |
|---|---:|---:|---:|
| 2024 completo | $11.727.560,72 | $12.504.637,86 | +$777.077,14 |
| 2025 completo | $15.225.068,83 | $14.957.989,49 | −$267.079,34 |
| 2026 ene–sep | $17.479.218,57 | $16.429.585,88 | −$1.049.632,69 |

## Diferencias por unidad

| Unidad | 2024 | 2025 | 2026 ene–sep |
|---|---:|---:|---:|
| Alquiler | $0,00 | +$0,03 | +$110.705,68 |
| Equipos | $0,00 | $0,00 | +$113.911,57 |
| Lubricantes/Filtros | +$13.677,91 | −$81.108,47 | −$840.728,89 |
| Repuestos | +$20.033,62 | −$218.706,03 | −$365.860,20 |
| Servicios | +$722.271,01 | +$27.424,88 | −$78.380,85 |
| Sin unidad | +$21.094,60 | +$5.310,25 | +$10.720,00 |

Los tres cortes que más conviene investigar primero son **Servicios 2024** (+$722.271,01), **Lubricantes/Filtros 2026** (−$840.728,89) y **Repuestos 2026** (−$365.860,20). En 2026, las mayores diferencias mensuales negativas son Lubricantes/Filtros en agosto (−$232.718,27), Repuestos en junio (−$224.855,95) y Servicios en marzo (−$159.916,58). Estas diferencias permanecen tras corregir el parseo de Servicios y eliminar duplicados sin unidad.

## Decisión para el presupuesto 2027

La proyección usa el oficial de `presupuestos` **con** los ajustes manuales, igual que Resumen. El backtest 2025 no cambia porque no hay ajustes de 2024–2025. Clientes 360 sigue usando las transacciones para el análisis por cliente y cartera. Antes de aprobar una meta se deben explicar las diferencias transaccionales más grandes; ningún importe se traslada automáticamente entre fuentes.
