# Plans — Audit de animaciones (2026-07-27)

Generado por la skill `improve-animations`. Commit base: `593684b`.

| #                                         | Título                                                           | Severidad | Categoría                                                 | Status |
| ----------------------------------------- | ---------------------------------------------------------------- | --------- | --------------------------------------------------------- | ------ |
| [001](001-recharts-animation-budget.md)   | Presupuesto de motion + reduced-motion para 16 gráficos Recharts | HIGH      | Easing/Duration, Accessibility, Interruptibility, Purpose | TODO   |
| [002](002-touch-gate-card-hover-lift.md)  | Gatear hover-lift de tarjetas para táctil                        | MEDIUM    | Accessibility                                             | TODO   |
| [003](003-ease-out-token.md)              | Token `--ease-out` (consolidar 8 cubic-bezier hand-typed)        | MEDIUM    | Cohesion & tokens                                         | TODO   |
| [004](004-section-enter-consistency.md)   | Aplicar `.section-enter` en servicios/coordinador/asesor         | MEDIUM    | Cohesion & tokens                                         | TODO   |
| [005](005-sheet-ease-out.md)              | Sheet: `ease-in-out` → `ease-out`                                | LOW       | Easing & duration                                         | TODO   |
| [006](006-scope-transition-all.md)        | Acotar `transition-all` en 3 archivos                            | LOW       | Performance (higiene)                                     | TODO   |
| [007](007-memoize-chart-dot.md)           | Memoizar `dot` custom de TalleresMonthlyChart                    | LOW       | Performance                                               | TODO   |
| [008](008-online-indicator-real-state.md) | Indicador "Online" atado a `navigator.onLine` real               | LOW       | Purpose & frequency                                       | TODO   |

## Orden de ejecución recomendado

1. **001** primero y solo — es el de mayor alcance (16 archivos + 1 hook nuevo) y el de mayor severidad. Verificarlo completo antes de tocar nada más reduce el riesgo de mezclar diffs grandes.
2. **003** antes de tocar de nuevo `styles.css` en cualquier otro plan — define el token `--ease-out` que no depende de nada más y es puramente aditivo/de bajo riesgo.
3. **002** — también en `styles.css`, independiente de 003 (no comparten líneas), pero se recomienda hacerlo después de 003 para evitar que dos ediciones concurrentes del mismo archivo choquen en el mismo diff.
4. **004**, **005**, **006**, **007**, **008** — no tienen dependencias entre sí ni con los anteriores (tocan archivos completamente distintos: páginas de servicios/coordinador/asesor, sheet.tsx, kpi-card.tsx+badge.tsx+asesores/page.tsx, TalleresMonthlyChart.tsx, app-shell.tsx respectivamente). Pueden ejecutarse en cualquier orden o incluso en paralelo si el ejecutor lo soporta.

## Dependencias

- Ninguno de los 8 planes depende de que otro esté "Status: DONE" para funcionar — todos son independientes a nivel de código. El orden de arriba es por higiene de diffs (evitar tocar el mismo archivo en dos planes a la vez), no por dependencia funcional real.
- **002** y **003** ambos editan `src/styles.css` — si se ejecutan en paralelo, aplicar primero 003 (agrega el token en `:root`) y luego 002 (agrega un bloque nuevo más abajo) para minimizar conflictos de merge.

## Cómo verificar todos juntos al final

Después de aplicar los 8:

```bash
bunx tsc --noEmit
bun run lint
bun run build
```

Y un recorrido visual por `/resumen`, `/servicios`, `/coordinador`, `/asesor`, `/gerencia-nacional` con DevTools → Rendering → `prefers-reduced-motion: reduce` activado y desactivado, comparando antes/después.
