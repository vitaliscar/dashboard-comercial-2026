# Cobranzas v2 — de lista estática a módulo con tendencia y riesgo

## Problem Statement

¿Cómo podríamos convertir Cobranzas de una foto estática del saldo actual en un módulo que muestre tendencia de cobranza en el tiempo y resalte qué cuentas necesitan atención — a pesar de que el Excel nunca guarda histórico y de que la hoja fuente cambió de estructura (ahora multi-línea por factura, con Total BO / Total DO en vez de un solo TOTAL $)?

## Recommended Direction

Tres bloques que se complementan en una sola pantalla, en vez de tratarse como features sueltas:

1. **Tendencia semanal** (nuevo): guardar una "foto" de `cobranzas` justo antes de cada carga semanal, en una tabla `cobranzas_snapshots`. Con dos fotos consecutivas se calcula: cuánto bajó el vencido, qué facturas nuevas entraron, y los 5 clientes cuyo saldo vencido más creció. Esto es la pieza que gerencia pidió explícitamente y la que más tiempo de desarrollo toma (schema + lógica de diff).
2. **Concentración y riesgo** (reutiliza código existente): Pareto 80/20 de clientes por saldo vencido (mismo patrón que `src/lib/analytics/pareto.ts`), con link directo al perfil de `/cliente-360` de cada cliente top. Da valor desde el primer día, sin depender de semanas acumuladas.
3. **Segmentación** (bajo costo, ya viene en el Excel nuevo): desglose de vencido por sucursal (para coordinador) y por unidad de negocio (la hoja nueva trae esa columna por línea).

Layout propuesto para no saturar la pantalla: KPIs de tendencia arriba (lo que cambió esta semana) → gráfico de antigüedad + segmentación por sucursal/unidad en una fila → tabla de concentración (Pareto + link a 360) abajo, con la tabla de detalle actual como último bloque, colapsable.

## Key Assumptions to Validate

- [ ] "Factura desaparece del Excel = se cobró" es una aproximación, no un hecho — también puede ser anulación o error de captura. Validar con el equipo de cobranza si esto genera falsos positivos frecuentes; si es así, considerar un campo manual de "motivo de baja" a futuro.
- [ ] La primera carga después de este cambio no tiene "semana anterior" — la sección de tendencia debe degradar con gracia (mostrar "primera carga registrada" en vez de un delta vacío o roto).
- [ ] Si el Excel se recarga más de una vez en la misma semana (corrección de datos), el snapshot se sobreescribe o se acumula — decidir esto antes de escribir la lógica de diff, porque cambia el significado de "semana vs. semana".
- [ ] Total DO (dólares) es la columna correcta a sumar como "el monto" del módulo — confirmado por el usuario, pero vale re-confirmar con quien mantiene el Excel que Total DO no es un campo opcional/vacío en algunas filas.

## MVP Scope

**Dentro:**

- Ajustar el parser/loader de `cobranzas` a la nueva estructura del Excel (multi-línea por factura vía Giro, Total DO como monto, DIAS DE CREDITO).
- Tabla `cobranzas_snapshots` + captura automática en cada `load-excel` antes del DELETE+INSERT de `cobranzas`.
- KPI de tendencia semanal (vencido esta semana vs. semana anterior) + lista de 5 clientes que más empeoraron.
- Pareto de clientes por vencido + link a `/cliente-360`.
- Desglose de vencido por sucursal y por unidad de negocio.
- Manejo explícito del caso "primera carga sin histórico previo".

## Not Doing (and Why)

- **Distinguir "cobrado" de "anulado/error"** — no hay dato en el Excel para diferenciarlos; forzar esa distinción ahora sería inventar información que no existe.
- **Snapshots con granularidad distinta a semanal** — la carga es semanal (cron viernes), así que cualquier granularidad más fina sería falsa precisión.
- **Comparación entre rangos arbitrarios de fechas** (no solo última vs. anterior) — se puede agregar después si la vista semanal resulta insuficiente, pero es prematuro construirlo sin haber visto cómo se usa la versión simple.
- **Vista separada para el equipo de cobranza día a día** — el usuario confirmó que el público es gerencia + coordinador, no un cobrador operativo; ese caso de uso queda fuera de esta iteración.
- **Alertas automáticas / notificaciones de cartera vencida** — es una extensión natural, pero es una superficie nueva (email/push) que no estaba en el pedido original.

## Open Questions

- ¿Qué pasa si un cliente cambia de código entre cargas (fusión de cuentas, corrección de maestro)? El diff por factura+cliente podría duplicar o perder continuidad.
- ¿Cuántas semanas de snapshots vale la pena retener/mostrar en la UI antes de que la tabla crezca demasiado? (no bloquea el MVP, pero afecta el diseño del query de tendencia a futuro).
