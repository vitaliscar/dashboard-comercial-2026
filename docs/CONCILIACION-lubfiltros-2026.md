# Conciliación Lubricantes/Filtros 2026

Fecha: 2026-10-15. Importes USD, enero–septiembre. El total oficial es `presupuestos.ventas_ccv + ventas_xibi + ventas_estrategicas`, con los ajustes manuales de agosto y septiembre; el detalle de Clientes 360 proviene de `facturas`.

| Mes | Oficial ajustado | Facturas del Sheet | Diferencia oficial menos facturas |
|---|---:|---:|---:|
| Ene | 260.873,45 | 161.667,95 | 99.205,50 |
| Feb | 196.203,44 | 179.742,30 | 16.461,14 |
| Mar | 342.280,63 | 266.502,23 | 75.778,40 |
| Abr | 403.379,16 | 271.564,05 | 131.815,11 |
| May | 308.323,69 | 252.794,01 | 55.529,68 |
| Jun | 479.791,89 | 401.206,88 | 78.585,01 |
| Jul | 456.647,93 | 375.472,82 | 81.175,11 |
| Ago | 534.730,00 | 302.011,73 | 232.718,27 |
| Sep | 505.913,96 | 436.453,29 | 69.460,67 |
| **Total diferencia** | | | **840.728,89** |

El cron carga `facturas` de esta unidad desde la hoja «Lubricantes/Filtros» del Sheet. El volcado actual tiene 4.259 filas; por ejemplo, el monto `1.223,88` conserva los dos decimales y `parseNumber()` lo interpreta como 1.223,88. La suma de la hoja y de las facturas cargadas coincide por mes. La corrección de formato aplicada a Servicios no explica esta brecha.

El oficial se alimenta del reporte crudo AS400 `ventasrepuesto` y de ventas estratégicas reclasificadas. El detalle por marca se reconstruye desde el mismo reporte y coincide aproximadamente con el oficial antes de ajustes. Los archivos crudos disponibles hoy cubren el mes corriente y algunas ventanas anteriores, pero no todos los meses de enero–septiembre. Por eso todavía no es posible identificar cada documento que falta en el Sheet ni atribuir esa diferencia a clientes o asesores. Se conserva el oficial como base de Presupuesto 2027 y el Sheet como base transaccional de Clientes 360, con la brecha visible en la conciliación.

Siguiente control de datos: conservar los reportes crudos mensuales de ambas compañías y comparar `N° Factura` + código de cliente + sucursal entre AS400 y el Sheet antes de ampliar la atribución de Lubricantes/Filtros.
