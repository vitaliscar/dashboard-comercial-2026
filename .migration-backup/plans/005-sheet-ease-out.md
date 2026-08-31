# 005 — Cambiar el Sheet de `ease-in-out` a `ease-out` en su entrada/salida

- **Status**: TODO
- **Commit**: 593684b
- **Severity**: LOW
- **Category**: Easing & duration

## Problem

```tsx
// src/components/ui/sheet.tsx:54 — current (extracto relevante)
"fixed z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg transition duration-200 ease-in-out data-ending-style:opacity-0 data-starting-style:opacity-0 ...";
```

El Sheet (panel lateral) usa `ease-in-out` para su entrada/salida. Por el orden de decisión del playbook (AUDIT.md sección 2): "Entering or exiting → `ease-out`" — `ease-in-out` empieza lento, que es exactamente lo que se quiere evitar en el momento en que el usuario está mirando. La duración (200ms) ya está dentro del presupuesto correcto para drawers/paneles (200-500ms) — no se toca.

## Target

```tsx
/* target — sheet.tsx:54, mismo string con "ease-in-out" reemplazado por "ease-out" */
"fixed z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg transition duration-200 ease-out data-ending-style:opacity-0 data-starting-style:opacity-0 ...";
```

## Repo conventions to follow

- Los demás componentes vendored de base-ui/shadcn en `src/components/ui/` (dialog.tsx, popover.tsx, dropdown-menu.tsx) usan `duration-100` sin especificar easing explícito vía clase Tailwind (usan las utilities `data-open:animate-in`/`fade-in-0`/`zoom-in-95` de `tw-animate-css`, que traen su propio easing por defecto). El Sheet es distinto porque usa `transition` de Tailwind directamente con `ease-in-out` explícito — este plan solo corrige esa clase explícita a `ease-out`, no reestructura el mecanismo de animación del Sheet.

## Steps

1. Abrir `src/components/ui/sheet.tsx`, localizar la línea ~54 (el `className` de `SheetPrimitive.Popup`, dentro de la función `SheetContent`).
2. Reemplazar la substring `ease-in-out` por `ease-out` dentro de ese `className` (es la única ocurrencia de `ease-in-out` en ese string).
3. Verificar que no queda ninguna otra ocurrencia de `ease-in-out` en el archivo `sheet.tsx` (debería haber solo esta una).

## Boundaries

- Do NOT tocar ninguna otra clase del `className` (duración, translate, `data-side=*`, etc.) — solo el token de easing.
- Do NOT tocar `src/components/ui/drawer.tsx` — es un componente vendored SIN uso en la app (código muerto), fuera de alcance de este audit.
- Do NOT tocar ningún otro archivo — el Sheet no parece usarse activamente en las páginas actuales, pero es parte de la librería de componentes UI compartida y debe quedar corregido igual, sin expandir el alcance a buscar dónde se usa.

## Verification

- **Mechanical**: `bunx tsc --noEmit` y `bun run build` sin errores.
- **Feel check**: si hay algún punto de la app que abra un `Sheet` (o si no, crear un uso de prueba temporal en una página cualquiera, verificar visualmente, y revertir el uso de prueba dejando solo el cambio de `sheet.tsx`), confirma que el panel entra con una sensación de "arranque rápido" (fast-start) en vez de la aceleración gradual anterior. Si no hay ningún uso activo del Sheet en la app, basta con confirmar el cambio de string y que el build compila — no es necesario inventar un caso de uso solo para probarlo.
- **Done when**: la única ocurrencia de `ease-in-out` en `sheet.tsx` es ahora `ease-out`, y el build pasa.
