# 002 — Gatear el hover-lift de tarjetas para que no se quede "pegado" en táctil

- **Status**: TODO
- **Commit**: 593684b
- **Severity**: MEDIUM
- **Category**: Accessibility

## Problem

`src/styles.css:234-239` y `253-258` definen el lift de hover de las tarjetas KPI:

```css
/* src/styles.css:234-239 — current */
@utility card-elevated-hover {
  will-change: transform;
  transform: translateY(-2px);
  box-shadow: var(--component-card-shadow-hover);
  border-color: color-mix(in oklab, var(--primary) 30%, var(--border));
}
```

(y su gemelo `card-elevated-2-hover` en `styles.css:253-258`, misma forma). Se aplican vía `hover:card-elevated-hover` / `hover:card-elevated-2-hover` en:

```tsx
// src/components/kpi-card.tsx:60-61 — current
? "card-elevated-2 hover:card-elevated-2-hover"
: "card-elevated hover:card-elevated-hover",
```

```tsx
// src/components/resumen/BusinessUnitCard.tsx:46 — current
<Card className="ring-0 card-elevated hover:card-elevated-hover section-enter" size="sm">
```

`src/components/app-shell.tsx:293-301` confirma que la app se usa en dispositivos táctiles/tablet (hay un botón hamburguesa `lg:hidden` que abre el menú). En touch, `:hover` se dispara con el tap y puede quedar "pegado" (la tarjeta sigue elevada) hasta el siguiente tap en otro lugar — un efecto fantasma, no un problema de reduced-motion (ese ya está cubierto aparte, ver abajo).

**IMPORTANTE — por qué el fix es un override, no una reestructuración**: NO reestructures los bloques `@utility` metiéndolos dentro de un `@media` (eso es sintaxis no probada en este repo y puede no compilar en Tailwind v4). En su lugar, imita exactamente el patrón que YA existe y YA compila en este mismo archivo para anular una utility condicionalmente — el bloque de `prefers-reduced-motion` en `styles.css:269-274`:

```css
/* src/styles.css:269-274 — ya existe, patrón a imitar */
@media (prefers-reduced-motion: reduce) {
  .card-elevated-2-hover:hover,
  .card-elevated-hover:hover {
    transform: none;
  }
}
```

Este bloque prueba que anular `.card-elevated-hover:hover { transform: none; }` dentro de un `@media` normal (sin `@utility` adentro) SÍ compila y funciona en este setup. El fix de este plan usa la misma técnica, pero con el media query inverso (`(hover: hover) and (pointer: fine)` negado) y anulando TODAS las propiedades del hover, no solo `transform`.

## Target

Agregar un bloque nuevo en `src/styles.css`, justo después del bloque `@media (prefers-reduced-motion: reduce)` que empieza en la línea ~269 (después de su cierre `}`):

```css
/* target — nuevo bloque en styles.css, después del bloque de prefers-reduced-motion de la línea ~269-274 */
@media not all and (hover: hover) and (pointer: fine) {
  .card-elevated-2-hover:hover,
  .card-elevated-hover:hover {
    transform: none;
    box-shadow: var(--component-card-shadow-rest);
    border-color: var(--border);
  }
}
```

Esto anula el lift completo (transform + box-shadow + border-color) en cualquier dispositivo que NO tenga hover fino real (es decir, táctil) — dejando el hover con mouse intacto.

## Repo conventions to follow

- El patrón exacto a imitar es el bloque `@media (prefers-reduced-motion: reduce) { .card-elevated-hover:hover { transform: none; } }` en `styles.css:269-274` — mismo mecanismo (anular la utility vía selector `:hover` dentro de un media query), mismas dos clases objetivo (`card-elevated-hover`, `card-elevated-2-hover`).
- No cambies los `@utility` originales (líneas 234-239 y 253-258) — este plan es puramente aditivo.

## Steps

1. En `src/styles.css`, localizar el cierre del bloque `@media (prefers-reduced-motion: reduce)` que contiene `.card-elevated-2-hover:hover, .card-elevated-hover:hover { transform: none; }` (alrededor de la línea 274).
2. Inmediatamente después de ese bloque (antes de la siguiente regla, `@utility card-elevated-2 { ... }` en la línea ~241 si el archivo no cambió, o donde sea que continúe el archivo), insertar el bloque nuevo:

   ```css
   @media not all and (hover: hover) and (pointer: fine) {
     .card-elevated-2-hover:hover,
     .card-elevated-hover:hover {
       transform: none;
       box-shadow: var(--component-card-shadow-rest);
       border-color: var(--border);
     }
   }
   ```

3. No tocar ningún archivo `.tsx` — las clases `hover:card-elevated-hover` en `kpi-card.tsx` y `BusinessUnitCard.tsx` siguen funcionando igual; este bloque nuevo simplemente anula sus efectos visuales cuando el dispositivo no tiene hover fino real.

## Boundaries

- Do NOT tocar ningún archivo `.tsx` — el fix es 100% en `src/styles.css`.
- Do NOT reestructurar los bloques `@utility card-elevated-hover` / `@utility card-elevated-2-hover` originales (líneas 234-239, 253-258) — déjalos exactamente como están.
- Do NOT anidar `@utility` dentro de `@media` — usa el patrón de override por selector `:hover`, igual que el bloque de reduced-motion ya existente.
- Do NOT tocar el bloque `@media (prefers-reduced-motion: reduce)` existente — debe seguir intacto, el bloque nuevo es independiente y adicional.
- Si las líneas citadas no coinciden exactamente (drift desde el commit `593684b`), busca los bloques por el texto `.card-elevated-hover:hover` y `.card-elevated-2-hover:hover` y aplica el mismo cambio junto a ellos.

## Verification

- **Mechanical**: `bun run build` compila sin errores.
- **Feel check**:
  - En desktop con mouse: pasa el cursor sobre una tarjeta KPI en `/resumen` — debe seguir elevándose con el mismo lift de -2px que antes (sin cambios).
  - En Chrome DevTools → toggle "Device Toolbar" (modo responsive/táctil, simular un iPhone) → tocar (click simulado) una tarjeta KPI y luego tocar en otro lugar de la página → la tarjeta NO debe quedar visualmente elevada después del segundo tap.
- **Done when**: el hover-lift sigue funcionando idéntico con mouse real, y ya no se activa (ni queda pegado) en el modo de emulación táctil de DevTools.
