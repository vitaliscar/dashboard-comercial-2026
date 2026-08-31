# 006 — Acotar `transition-all` a las propiedades que realmente animan

- **Status**: TODO
- **Commit**: 593684b
- **Severity**: LOW
- **Category**: Performance (higiene)

## Problem

Cuatro sitios usan `transition-all`, que promete animar cualquier propiedad — hoy solo cambian color/box-shadow/border (seguro, compuesto en GPU), pero `transition-all` es una puerta abierta: si alguien agrega una clase de `width`/`padding`/`margin` a ese mismo elemento en el futuro, empezaría a animarse de layout sin que nadie lo note ni lo decida a propósito.

```tsx
// src/components/kpi-card.tsx:62 — current
"transition-all duration-200",
```

(combinado con `card-elevated hover:card-elevated-hover` en las líneas 59-61 — el hover solo cambia `transform`, `box-shadow`, `border-color`.)

```ts
// src/components/ui/badge.tsx:8 — current (dentro de cva(), string base)
"group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-lg border border-transparent px-2 py-0.5 font-display text-[10px] font-bold tracking-wide whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 ...";
```

(el único cambio de estado relevante es `focus-visible:border-ring` + `focus-visible:ring-[3px]` — border-color y box-shadow/ring.)

```tsx
// src/app/(app)/asesores/page.tsx:344 y :350 — current (dos TabsTrigger)
className =
  "px-4 py-2 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none h-auto font-semibold text-sm transition-all";
```

(el cambio de estado es `data-[state=active]:border-primary` — solo `border-color`.)

## Target

```tsx
/* target — kpi-card.tsx:62 */
"transition-[transform,box-shadow,border-color] duration-200",
```

```ts
/* target — badge.tsx:8, reemplazar solo "transition-all" por "transition-colors" dentro del mismo string largo */
"... rounded-lg border border-transparent px-2 py-0.5 font-display text-[10px] font-bold tracking-wide whitespace-nowrap transition-colors focus-visible:border-ring focus-visible:ring-[3px] ...";
```

```tsx
/* target — asesores/page.tsx:344 y :350, reemplazar "transition-all" por "transition-colors" en ambas */
className =
  "px-4 py-2 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none h-auto font-semibold text-sm transition-colors";
```

## Repo conventions to follow

- El repo ya usa transiciones acotadas por propiedad en varios lugares — exemplar: `src/styles.css:228-231` (`card-elevated`) usa `transition: transform 200ms ..., border-color 200ms ease, box-shadow 200ms ...` en vez de `all`. `kpi-card.tsx` debe alinearse con el mismo criterio que ya usa `card-elevated` (transform + box-shadow + border-color).
- Tailwind soporta `transition-[prop1,prop2,prop3]` (sintaxis arbitraria) para listas de propiedades — es la forma correcta de acotar sin perder ninguna de las propiedades que sí cambian.
- Para casos de una sola familia de propiedades (solo colores/borders), usa la utility corta `transition-colors` en vez de la sintaxis arbitraria — más legible, mismo resultado.

## Steps

1. En `src/components/kpi-card.tsx:62`, reemplazar `"transition-all duration-200",` por `"transition-[transform,box-shadow,border-color] duration-200",`.
2. En `src/components/ui/badge.tsx:8`, dentro del string largo de `cva(...)`, reemplazar la palabra `transition-all` por `transition-colors` (una sola ocurrencia en ese string).
3. En `src/app/(app)/asesores/page.tsx`, en las DOS ocurrencias (línea ~344 y ~350, los dos `<TabsTrigger>`), reemplazar `transition-all` por `transition-colors` en cada una.

## Boundaries

- Do NOT tocar ninguna otra clase en esos 4 sitios (colores, spacing, `data-[state=...]`, etc.) — solo la utility de `transition`.
- Do NOT tocar `src/components/ui/sidebar.tsx` (tiene su propio `transition-all` en la línea ~279) — ese archivo no se usa en ningún lado de la app (código muerto, confirmado por grep de imports), queda fuera de alcance.
- Do NOT buscar más ocurrencias de `transition-all` más allá de las 4 citadas (kpi-card.tsx, badge.tsx, y las 2 de asesores/page.tsx) — si encuentras una quinta en un archivo que SÍ está en uso activo (no vendored/muerto), repórtala en el resumen final pero no la cambies sin confirmar antes qué propiedades anima.

## Verification

- **Mechanical**: `bunx tsc --noEmit` y `bun run build` sin errores. `bun run lint` sobre los 3 archivos tocados sin errores nuevos.
- **Feel check**: en `/resumen`, pasa el mouse sobre una tarjeta KPI — debe elevarse igual que antes (transform + shadow + border). En cualquier página con badges de estado — el focus-visible debe verse igual. En `/asesores`, cambia entre las tabs "Ranking Comercial" / "Distribución Pareto" — el borde inferior debe seguir animando su cambio de color al activar cada tab.
- **Done when**: los 3 archivos tienen las propiedades acotadas, ningún comportamiento visual cambió, y el build/lint pasan limpios.
