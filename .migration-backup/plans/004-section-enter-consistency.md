# 004 — Aplicar el sistema de entrada `.section-enter` a las páginas que no lo usan

- **Status**: TODO
- **Commit**: 593684b
- **Severity**: MEDIUM
- **Category**: Cohesion & tokens

## Problem

`src/styles.css:352-378` define un sistema de entrada con stagger ya construido:

```css
/* src/styles.css:352-378 — ya existe, no tocar */
@keyframes ccv-fade-in-up {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@utility section-enter {
  animation: ccv-fade-in-up 300ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
@utility section-enter-1 {
  animation-delay: 50ms;
}
@utility section-enter-2 {
  animation-delay: 100ms;
}
@utility section-enter-3 {
  animation-delay: 150ms;
}
```

`src/app/(app)/gerencia-nacional/page.tsx` lo usa así (exemplar — NO tocar este archivo, es la referencia):

```tsx
// src/app/(app)/gerencia-nacional/page.tsx:258 — exemplar existente
<div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_0.75fr_1.25fr] section-enter section-enter-1">
...
<div className="flex flex-col gap-3 section-enter section-enter-2">
...
<div className="grid grid-cols-1 gap-4 xl:grid-cols-2 section-enter section-enter-2">
...
<div className="grid grid-cols-1 gap-4 xl:grid-cols-2 section-enter section-enter-3 ...">
```

`src/components/kpi-card.tsx:63` ya aplica `section-enter` (sin índice de stagger) a cada tarjeta KPI individualmente — por eso las filas de KPI YA animan en todas las páginas que usan `<KpiCard>`. Lo que falta es el stagger a nivel de **sección** (los bloques de gráficos/tablas debajo de las KPIs).

Tres páginas con el mismo patrón de layout (KPIs arriba + secciones de `<section>`/grid debajo) NO usan el sistema en absoluto — sus secciones aparecen de golpe, sin ninguna entrada:

- `src/app/(app)/servicios/page.tsx` — secciones en líneas 406, 417, 442, 465, 482 (`<section className="flex flex-col gap-3">`, cinco bloques secuenciales: Evolución mensual, Desempeño por sucursal, Composición de ingresos, Talleres y CSA, Cuentas por cobrar).
- `src/app/(app)/coordinador/page.tsx` — grids en líneas 496, 506, 511, 516, 541 (sin `<section>`, son `<div className="grid ...">` directos).
- `src/app/(app)/asesor/page.tsx` — grids en líneas 318, 403.

## Target

Cada `<section>` o `<div className="grid ...">` de nivel superior en esas 3 páginas recibe `section-enter` + el índice de stagger correspondiente a su posición (ciclando 1→2→3→1→2… si hay más de 3 bloques, igual que el exemplar de gerencia-nacional que reusa `section-enter-2` dos veces).

Ejemplo de un cambio puntual en `servicios/page.tsx`:

```tsx
/* target — servicios/page.tsx:406 */
<section className="flex flex-col gap-3 section-enter section-enter-1">
```

```tsx
/* target — servicios/page.tsx:417 */
<section className="flex flex-col gap-3 section-enter section-enter-2">
```

## Repo conventions to follow

- Exemplar exacto: `src/app/(app)/gerencia-nacional/page.tsx` (líneas 258, 376, 402, 409) — mismo patrón: agregar `section-enter section-enter-N` al final del `className` existente, ciclando N entre 1, 2 y 3 para bloques consecutivos (no hay `section-enter-4`, si hay un 4to bloque reusa `section-enter-1` o `section-enter-2`, como hace el exemplar con `section-enter-2` repetido).
- No crear `section-enter-4`/`section-enter-5` en `styles.css` — el sistema es de 3 niveles nada más, cíclico.

## Steps

1. En `src/app/(app)/servicios/page.tsx`, agregar `section-enter section-enter-N` a las 5 secciones (línea 406→N=1, 417→N=2, 442→N=3, 465→N=1, 482→N=2), agregando las clases al final del `className` string existente de cada `<section className="flex flex-col gap-3">`.
2. En `src/app/(app)/coordinador/page.tsx`, agregar `section-enter section-enter-N` a los 5 `<div className="grid ...">` de nivel superior (línea 496→N=1, 506→N=2, 511→N=3, 516→N=1, 541→N=2), sin tocar el resto de las clases ya presentes (ej. `[content-visibility:auto] [contain-intrinsic-size:auto_320px]` se mantienen intactas, solo se agrega `section-enter section-enter-N` al final).
3. En `src/app/(app)/asesor/page.tsx`, agregar `section-enter section-enter-N` a los 2 `<div className="grid ...">` de nivel superior (línea 318→N=1, 403→N=2).
4. NO agregar `section-enter` a grids/secciones ANIDADAS dentro de esas secciones (por ejemplo, si dentro de una `<section>` hay un `<div className="grid ...">` interno de 3 columnas de gráficos, ese interno NO lleva la clase — solo el contenedor de más alto nivel de cada bloque, igual que hace el exemplar de gerencia-nacional).

## Boundaries

- Do NOT tocar `src/app/(app)/gerencia-nacional/page.tsx`, `src/app/(app)/alquiler/page.tsx`, ni ningún componente que ya use `section-enter` (`kpi-card.tsx`, `BusinessUnitCard.tsx`, `CotizacionesSection.tsx`, `FacturadoSection.tsx`, `VentasPerdidasSection.tsx`, `BranchRanking.tsx`, `BranchSummaryTable.tsx`) — ya están bien.
- Do NOT tocar `src/app/(app)/carga/page.tsx` — no tiene la misma estructura de grid/sección, queda fuera de este plan.
- Do NOT tocar `src/styles.css` en este plan — el sistema de `section-enter` ya existe completo, esto es solo aplicarlo.
- Do NOT cambiar la estructura/markup de las páginas — solo agregar clases al `className` existente.
- Si alguna de las líneas citadas no coincide (drift), busca el bloque por su contenido (heading/texto cercano descrito arriba) y aplica el mismo criterio de numeración secuencial 1→2→3→1…

## Verification

- **Mechanical**: `bunx tsc --noEmit` y `bun run build` sin errores. `bun run lint` sobre los 3 archivos sin errores nuevos.
- **Feel check**: con `bun run dev`, entra a `/servicios`, `/coordinador`, `/asesor` — al cargar la página (o al navegar hacia ella desde el sidebar), las secciones/grids deben aparecer con un fade-in-up sutil y escalonado (no todas de golpe al mismo tiempo), igual que ya se ve en `/gerencia-nacional`. Compara lado a lado navegando primero a `/gerencia-nacional` y luego a `/servicios` — el "peso" de la entrada debe sentirse igual de intencional en ambas.
  - Con DevTools → Rendering → `prefers-reduced-motion: reduce` activado, las secciones deben aparecer directamente sin animación (ya cubierto por el bloque existente en `styles.css:403-409`, no requiere cambios).
- **Done when**: las 3 páginas tienen sus bloques de nivel superior con `section-enter section-enter-N`, el build pasa, y el feel-check confirma la entrada escalonada visualmente.
