# 001 — Poner los 16 gráficos Recharts en el presupuesto de motion de la app y respetar reduced-motion

- **Status**: TODO
- **Commit**: 593684b
- **Severity**: HIGH
- **Category**: Easing & duration / Accessibility / Interruptibility / Purpose & frequency
- **Estimated scope**: 1 archivo nuevo (hook) + 15 archivos de componentes de chart (30 elementos `<Bar>`/`<Line>`/`<Area>`/`<Pie>`/`<RadialBar>`)

## Problem

Ninguno de los 16 componentes de gráficos Recharts de la app configura `animationDuration`/`animationEasing`/`isAnimationActive`. Sin esas props, Recharts anima con su default: **1500ms**, easing `'ease'` (curva simétrica, no `ease-out`). Eso excede 5x el presupuesto de 300ms para UI del playbook, y el easing correcto para una entrada de contenido es `ease-out`, no `ease` (esa curva es solo para hover/color, ver AUDIT.md sección 2).

Los filtros de mes tienen navegación por teclado (flechas ← / →, `aria-keyshortcuts="ArrowLeft ArrowRight"`) en 3 páginas:

- `src/app/(app)/resumen/page.tsx` (líneas ~472-497, handler de `keydown`)
- `src/app/(app)/coordinador/page.tsx` (mismo patrón)
- `src/app/(app)/asesor/page.tsx` (mismo patrón)

Cada pulsación de flecha cambia `filters.meses`/`anio`, dispara un refetch, y reemplaza los `data` props de los charts — cada uno vuelve a correr su animación de entrada de 1500ms. Paginar 12 meses de historial = 12 animaciones de 1.5s consecutivas en la acción que el shortcut existe para acelerar.

Además, Recharts anima vía su propio motor JS (`react-smooth`), completamente fuera de CSS — por lo tanto **ignora `prefers-reduced-motion` por completo**. Un usuario con reduced-motion activado en su SO sigue viendo 1.5s de barras/líneas creciendo en cada carga de página y cada cambio de filtro.

Archivos y elementos afectados (verificado por lectura directa, 30 elementos en 15 archivos — ninguno tiene `animationDuration`/`animationEasing`/`isAnimationActive`):

```
src/components/coordinador/CompanyTrendChart.tsx:49,57,65        → <Line> x3
src/components/coordinador/EquiposAlquilerStacked.tsx:54,61,68   → <Bar> x2, <Line> x1
src/components/coordinador/GlobalMonthlyCombo.tsx:54,73          → <Bar> x1, <Line> x1
src/components/coordinador/LubFiltrosComboLines.tsx:49,58        → <Line> x2
src/components/coordinador/RepuestosAreaChart.tsx:46,64          → <Area> x2
src/components/coordinador/ServiciosBarWithMarkers.tsx:76        → <Bar> x1
src/components/coordinador/UnitAmountBars.tsx:40                 → <Bar> x1
src/components/gerencia-nacional/BranchRanking.tsx:105           → <Bar> x1
src/components/gerencia-nacional/ComplianceGauge.tsx:52          → <RadialBar> x1
src/components/gerencia-nacional/UnitDonut.tsx:85                → <Pie> x1
src/components/gerencia-nacional/UnitMetaVsVenta.tsx:73,115,152  → <Bar> x2, <Line> x1
src/components/servicios/CsaTrendChart.tsx:53                    → <Bar> x1
src/components/servicios/RankedHorizontalBar.tsx:68               → <Bar> x1
src/components/servicios/SucursalPerformanceChart.tsx:102        → <Bar> x1
src/components/servicios/TalleresMonthlyChart.tsx:93,101,109     → <Line> x3
```

Ejemplo actual (`src/components/servicios/CsaTrendChart.tsx:53`):

```tsx
<Bar dataKey="monto" name="Ventas CSA" radius={[4, 4, 0, 0]}>
```

## Target

Un hook nuevo `useChartAnimation()` que devuelve la config de animación correcta según `prefers-reduced-motion`, y todos los elementos de chart la aplican con spread:

```tsx
// src/hooks/use-chart-animation.ts (nuevo)
const chartAnimation = useChartAnimation();
// { animationDuration: 300, animationEasing: "ease-out" }  — motion normal
// { animationDuration: 0 }                                  — prefers-reduced-motion: reduce
```

```tsx
// src/components/servicios/CsaTrendChart.tsx:53 — target
<Bar dataKey="monto" name="Ventas CSA" radius={[4, 4, 0, 0]} {...chartAnimation}>
```

Duración elegida: **300ms** (tope superior del presupuesto de UI del playbook — sección 2, tabla de duraciones — es un chart re-poblándose con datos nuevos, no un modal, así que se usa el máximo del rango "UI" en vez de los 150-250ms de dropdowns). Easing: `"ease-out"` (Recharts acepta strings de easing CSS estándar además de sus propios nombres; `"ease-out"` es válido).

## Repo conventions to follow

- Los hooks compartidos viven en `src/hooks/`, un archivo por hook, nombrados `use-kebab-case.ts`, exportando una función `useCamelCase()`. Exemplar exacto a imitar: `src/hooks/use-mobile.ts` (usa `window.matchMedia` + `useEffect` + `useState`, mismo patrón que necesitas para leer `prefers-reduced-motion`).
- Los componentes de chart ya importan hooks de React normalmente (`import { memo } from "react"` etc.) — agrega el import del hook nuevo junto a los existentes, mismo estilo.
- No introduzcas una dependencia nueva (no instales `framer-motion` ni nada — esto es 100% CSS/Recharts-nativo, coherente con que el repo no tiene librerías de motion en JS).

## Steps

1. Crear `src/hooks/use-chart-animation.ts`:

   ```tsx
   import { useEffect, useState } from "react";

   const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

   /**
    * Config de animación para elementos Recharts (Bar/Line/Area/Pie/RadialBar).
    * 300ms ease-out en motion normal; sin animación si el usuario prefiere
    * movimiento reducido — Recharts anima vía JS y no lee prefers-reduced-motion
    * por sí solo, así que hay que leerlo aquí.
    */
   export function useChartAnimation() {
     const [reducedMotion, setReducedMotion] = useState(false);

     useEffect(() => {
       const mql = window.matchMedia(REDUCED_MOTION_QUERY);
       const onChange = () => setReducedMotion(mql.matches);
       mql.addEventListener("change", onChange);
       onChange();
       return () => mql.removeEventListener("change", onChange);
     }, []);

     if (reducedMotion) {
       return { isAnimationActive: false } as const;
     }
     return { animationDuration: 300, animationEasing: "ease-out" } as const;
   }
   ```

2. En cada uno de los 15 archivos listados arriba:
   - Agregar `import { useChartAnimation } from "@/hooks/use-chart-animation";` junto a los demás imports.
   - Dentro del componente (antes del `return`), agregar: `const chartAnimation = useChartAnimation();`
   - En cada elemento `<Bar>`, `<Line>`, `<Area>`, `<Pie>`, `<RadialBar>` de ese archivo (las líneas exactas están listadas en la sección Problem), agregar `{...chartAnimation}` como prop — al final de las props existentes, antes del cierre `>` o `/>`. Si el elemento tiene hijos (`<Bar ...>...</Bar>`), el spread va en la etiqueta de apertura, no cambia los hijos.
   - Si el componente es `memo(function X(...) {...})`, el hook va dentro del cuerpo de la función, no fuera.

3. Verificar que ningún archivo quedó con el hook importado pero sin usar (o viceversa) — cada uno de los 15 archivos debe tener exactamente un `useChartAnimation()` y aplicarlo a TODOS sus elementos de chart (algunos archivos tienen 2-3 elementos, todos deben recibir el spread, no solo el primero).

## Boundaries

- Do NOT tocar `src/components/ui/sparkline.tsx` — ya tiene `isAnimationActive={false}` explícito y correcto, no lo cambies.
- Do NOT tocar `src/components/ui/chart.tsx` (el `ChartContainer` wrapper) — este plan no lo necesita, los 16 componentes afectados manejan sus propios elementos Recharts directamente.
- Do NOT cambiar la duración/easing más allá de los valores especificados (300ms / "ease-out" / 0 en reduced-motion) — no "mejorarlos" con otro valor.
- Do NOT tocar la lógica de datos/filtros de ningún componente — solo agregar la prop de animación.
- Si algún archivo de los 15 listados ya no tiene el elemento en la línea citada (drift desde el commit `593684b`), STOP y reporta en vez de improvisar — busca el elemento por su `dataKey`/tipo en el mismo archivo y aplica el mismo patrón, pero avisa que la línea cambió.

## Verification

- **Mechanical**: `bunx tsc --noEmit` (sin errores) y `bun run build` (compila) — ambos deben pasar limpios. `bun run lint` sobre los 16 archivos tocados sin errores nuevos (el CRLF/prettier se puede normalizar con `npx prettier --write <archivos>` si hace falta).
- **Feel check**: con `bun run dev` corriendo, entra a `/resumen`, `/coordinador`, `/servicios`, `/gerencia-nacional`. En cada una:
  - Cambia el filtro de mes (o navega con ← / →) y confirma que los gráficos re-dibujan en ~300ms, no ~1.5s — debe sentirse rápido, no lento.
  - Abre Chrome DevTools → Rendering panel → "Emulate CSS media feature prefers-reduced-motion: reduce" → recarga la página → cambia de filtro de nuevo → los gráficos deben aparecer con los datos correctos SIN animación de crecimiento (aparecen ya completos).
  - Vuelve a poner reduced-motion en "no preference" y confirma que la animación de 300ms vuelve.
- **Done when**: los 15 archivos tienen `useChartAnimation()` aplicado a sus 30 elementos de chart, `tsc`/`build` pasan, y el feel-check de reduced-motion + velocidad de re-render se confirma manualmente en al menos 3 páginas distintas.
