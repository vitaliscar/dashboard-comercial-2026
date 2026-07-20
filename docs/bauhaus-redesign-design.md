# Rediseño Bauhaus Edition — Reemplazo del sistema visual

## Contexto

El usuario proveyó un nuevo project brief y 6 mockups HTML bajo un segundo sistema de diseño ("Bauhaus Edition") — neo-brutalista, modo claro, con bordes negros gruesos, sombras duras (offset, no blur) y amarillo Bauhaus (#ffcc00) como acento. Decisión confirmada: **reemplaza por completo** el sistema "Industrial Editorial" (oscuro/ámbar) construido en la sesión anterior — no coexisten.

Esto es un **reskin de superficie**, no una reconstrucción: toda la lógica de datos, estructura de rutas, hooks y componentes React existentes se conservan. Cambian los tokens de diseño (`styles.css`) y el tratamiento visual de los componentes compartidos (bordes, sombras, tipografía, radio).

## Decisiones confirmadas

1. **Sin modo oscuro**: se elimina `.dark` y `.coordinator-dashboard-theme` por completo. Un único tema claro.
2. **Semántica de color clásica**: success=verde, warning=ámbar, danger=rojo-naranja (no la paleta literal del mockup donde "vigente" es azul) — mismo mapeo semántico ya usado, solo re-texturizado a bordes gruesos sin relleno suave.
3. **Iconografía**: se mantiene `lucide-react` (el brief lo especifica explícitamente en "Technical Specifications"), no se adopta Material Symbols de los mockups.

## Nuevos tokens (reemplazan los OKLCH oscuros actuales)

Aproximaciones OKLCH de la paleta hexadecimal del brief (se mantiene el formato OKLCH del proyecto):

| Rol                              | Hex mockup            | OKLCH aprox.           | Uso                                                                |
| -------------------------------- | --------------------- | ---------------------- | ------------------------------------------------------------------ |
| `--foreground` / borde universal | `#1a1a1a`             | `oklch(0.22 0 0)`      | Texto, TODOS los bordes (2-4px), sombras duras                     |
| `--background`                   | `#f5f0e8`             | `oklch(0.96 0.01 85)`  | Fondo general (crema cálido)                                       |
| `--card` / superficie            | `#ffffff`             | `oklch(1 0 0)`         | Tarjetas, inputs                                                   |
| `--primary` (acento Bauhaus)     | `#ffcc00`             | `oklch(0.85 0.18 95)`  | CTA, highlights, activo                                            |
| `--secondary` (rojo-naranja)     | `#e63b2e`             | `oklch(0.58 0.19 25)`  | Alertas fuertes, prioridad alta                                    |
| `--tertiary` (azul info)         | `#0055ff`             | `oklch(0.55 0.22 260)` | Info/dato secundario (no estados)                                  |
| `--success`                      | — (nuevo)             | `oklch(0.65 0.16 145)` | Estados OK, retextura ado a borde grueso                           |
| `--warning`                      | — (deriva de primary) | `oklch(0.80 0.16 90)`  | Estados de alerta media                                            |
| `--danger`                       | `#cc0000`             | `oklch(0.50 0.20 25)`  | Estados críticos                                                   |
| `--radius`                       | —                     | `0`                    | Cero en todo, excepto elementos circulares reales (avatares, dots) |

Superficies contenedoras (`surface-container`, `surface-container-high/low`, etc.) se colapsan a 2-3 tonos crema intermedios entre `--background` y blanco — no se replica la escala de 6 pasos del mockup, es innecesaria granularidad para nuestros componentes reales.

## Tipografía

- **Space Grotesk** (self-hosted vía `@fontsource`) reemplaza Geist Variable para `font-display`/headings/labels/botones — todo en mayúsculas donde el mockup lo muestra (`uppercase tracking-tight`).
- **Inter** (self-hosted) reemplaza Geist Variable para `font-sans`/cuerpo de texto.
- **JetBrains Mono** se conserva sin cambios (ya autohospedada) para datos tabulares/numéricos — el mockup 6 la reintroduce explícitamente como `font-data-tabular`, confirma que sigue vigente.

## Elevación y bordes (el cambio más disruptivo)

Reemplaza el sistema `card-elevated` / `card-elevated-2` / `card-elevated-3` (sombra suave, borde 1px) por:

- `brutal-card`: `border: 2px solid var(--foreground); box-shadow: 4px 4px 0 var(--foreground);` + hover `translate(-1px,-1px)` y sombra a 6px/6px.
- `brutal-card-lg`: variante con borde 4px para paneles principales/hero (headers de sección, tarjetas ancla).
- `brutal-button`: borde 2px + sombra dura 2-3px, `:active` colapsa a `translate(1px,1px)` sin sombra (efecto "presionado").
- Los "pills" de estado (`StatusPill`) pasan de fondo tintado suave a **borde de 2px del color semántico + texto del mismo color, sin relleno** (el patrón dominante en los mockups), manteniendo mayúsculas y `font-black`.

## Componentes a re-texturizar (mismo alcance que la capa compartida de la adaptación anterior)

- `styles.css`: reemplazo completo de tokens `:root`, eliminación de `.dark`, nuevas utilities `brutal-card`/`brutal-card-lg`/`brutal-button` reemplazando `card-elevated*`, `--radius: 0`.
- `kpi-card.tsx`, `ui/card.tsx`, `ui/badge.tsx`, `status-pill.tsx`, `ui/button.tsx`: bordes gruesos, sombra dura, mayúsculas Space Grotesk en labels.
- `app-shell.tsx`: sidebar con `border-r-4`, header con `border-b-2/4`, botones "Cargar Excel"/"Exportar PDF" con `brutal-button`, nav activo con fondo amarillo Bauhaus sólido (no borde-stripe sutil).
- `page-header.tsx`: eyebrow y título en mayúsculas Space Grotesk, `tracking-tighter`.
- Gráficos (Recharts): colores de series a los nuevos `--chart-*` (se recalculan desde la nueva paleta), tooltips con `brutal-card` en vez de sombra suave + radio 4px.
- Encabezados de tabla: se mantiene el patrón ya dominante (`bg-primary`/fondo sólido + texto contrastante), ahora en amarillo Bauhaus con texto negro en vez de ámbar oscuro con texto claro.

## Fuera de alcance

- No se reestructuran layouts, bento compositions, ni lógica de datos ya construidos en la adaptación anterior — se re-texturizan in situ.
- No se implementa selector de tema (claro/oscuro) ni se preserva el tema anterior en ningún toggle.
- `GoalFeedback.tsx` (ilustraciones SVG) se mantiene sin cambios de contenido, solo ajusta el marco/tipografía circundante si aplica.

## Secuencia de implementación

1. **Fundación**: `styles.css` (tokens + utilities brutalistas), fuentes (Space Grotesk + Inter), eliminar `.dark`/`.coordinator-dashboard-theme`.
2. **Capa compartida**: `kpi-card`, `status-pill`, `ui/card`, `ui/badge`, `ui/button`, `app-shell`, `page-header`.
3. **Barrido de colores hardcodeados en componentes de gráficos** (los que ya usaban oklch/hex literales en vez de tokens — ya identificados en la auditoría anterior).
4. **Rutas** (mismo universo de ~15 rutas): reskin visual, sin tocar estructura de datos.
5. **Verificación**: `tsc --noEmit` + smoke visual en navegador (login + 1-2 rutas representativas).
