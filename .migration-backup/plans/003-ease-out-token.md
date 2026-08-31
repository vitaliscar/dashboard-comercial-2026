# 003 — Consolidar la curva ease-out repetida en un token `--ease-out`

- **Status**: TODO
- **Commit**: 593684b
- **Severity**: MEDIUM
- **Category**: Cohesion & tokens

## Problem

`cubic-bezier(0.16, 1, 0.3, 1)` está escrito a mano **8 veces** en `src/styles.css`, sin vivir como variable CSS reusable:

```css
/* src/styles.css:229, 231 */
@utility card-elevated {
  ...
  transition:
    transform 200ms cubic-bezier(0.16, 1, 0.3, 1),
    border-color 200ms ease,
    box-shadow 200ms cubic-bezier(0.16, 1, 0.3, 1);
}
```

```css
/* src/styles.css:248, 250 */
@utility card-elevated-2 {
  ...
  transition:
    transform 200ms cubic-bezier(0.16, 1, 0.3, 1),
    border-color 200ms ease,
    box-shadow 200ms cubic-bezier(0.16, 1, 0.3, 1);
}
```

```css
/* src/styles.css:284, 285 */
@utility brutal-button {
  ...
  transition:
    background-color 150ms ease,
    border-color 150ms ease,
    transform 150ms cubic-bezier(0.16, 1, 0.3, 1),
    box-shadow 150ms cubic-bezier(0.16, 1, 0.3, 1);
}
```

```css
/* src/styles.css:365 */
@utility section-enter {
  animation: ccv-fade-in-up 300ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
```

```css
/* src/styles.css:439 */
@utility progress-fill {
  ...
  transition: transform 600ms cubic-bezier(0.16, 1, 0.3, 1);
}
```

Un typo en cualquiera de las 8 copias forkearía silenciosamente la curva en un solo lugar sin que nadie lo note.

## Target

Definir el token una sola vez en `:root` y usarlo en las 8 ocurrencias:

```css
/* target — dentro de :root, junto a los demás tokens de motion/spacing */
--ease-out: cubic-bezier(0.16, 1, 0.3, 1);
```

```css
/* target — cada una de las 8 ocurrencias reemplazada */
transition:
  transform 200ms var(--ease-out),
  ...;
```

## Repo conventions to follow

- Todos los tokens semánticos de este archivo viven dentro del bloque `:root { ... }` que empieza en `src/styles.css:22` (colores, `--radius`, `--font-*`, sombras `--component-*`). Agrega `--ease-out` ahí, cerca de las sombras (`--component-card-shadow-rest` etc., líneas ~92-97), ya que es otro token de "motion/superficie".
- El resto del repo ya usa `var(--token)` para todo lo semántico (`var(--color-border)`, `var(--primary)`, etc.) — sigue exactamente ese patrón, no una convención nueva.

## Steps

1. En `src/styles.css`, dentro del bloque `:root { ... }`, cerca de las líneas 92-97 (donde están `--component-card-shadow-rest`, `--component-card-shadow-hover`, etc.), agregar:
   ```css
   --ease-out: cubic-bezier(
     0.16,
     1,
     0.3,
     1
   ); /* curva de entrada/salida — no usar bare "ease" para animaciones deliberadas */
   ```
2. Reemplazar las 8 ocurrencias literales de `cubic-bezier(0.16, 1, 0.3, 1)` por `var(--ease-out)`, en:
   - `styles.css:229` (`card-elevated`, transform)
   - `styles.css:231` (`card-elevated`, box-shadow)
   - `styles.css:248` (`card-elevated-2`, transform)
   - `styles.css:250` (`card-elevated-2`, box-shadow)
   - `styles.css:284` (`brutal-button`, transform)
   - `styles.css:285` (`brutal-button`, box-shadow)
   - `styles.css:365` (`section-enter`, animation)
   - `styles.css:439` (`progress-fill`, transition)
3. NO tocar los `200ms ease` sueltos (ej. `border-color 200ms ease` en `card-elevated`/`card-elevated-2`) — esos usan bare `ease` deliberadamente para color/border (correcto según el playbook, sección 2: "Hover / color change → ease"), no son parte de esta consolidación.

## Boundaries

- Do NOT tocar ningún archivo `.tsx` — el fix es 100% en `src/styles.css`.
- Do NOT cambiar ningún valor de duración (200ms, 150ms, 300ms, 600ms se mantienen exactamente iguales) — solo reemplazar la curva por el token.
- Do NOT crear tokens adicionales (`--ease-in`, `--ease-in-out`, etc.) — este plan es solo sobre la curva que ya existe repetida.
- Si encuentras una 9na ocurrencia de `cubic-bezier(0.16, 1, 0.3, 1)` que no está en esta lista, agrégala también (reemplázala por el token) y repórtalo en el resumen final.

## Verification

- **Mechanical**: `bun run build` compila sin errores. `grep -c "cubic-bezier(0.16, 1, 0.3, 1)" src/styles.css` debe devolver `1` (solo la definición del token en `:root`), no `0` ni `8`.
- **Feel check**: en `/resumen` o `/servicios`, pasa el cursor sobre una tarjeta KPI (`card-elevated`) y sobre un botón (`brutal-button`) — el lift/press feedback debe verse y sentirse exactamente igual que antes (mismo timing, misma curva), porque el valor resuelto es idéntico, solo cambia de dónde viene.
- **Done when**: las 8 ocurrencias son `var(--ease-out)`, el token está definido una sola vez en `:root`, y el build/feel-check confirman que nada cambió visualmente.
