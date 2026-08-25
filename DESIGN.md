# Design System: CCV Panel de Instrumentos

## 1. Visual Theme & Atmosphere

Un cockpit de datos comerciales: casi-negro, denso, calibrado. No es un dashboard SaaS genérico de tarjetas blancas — es la cabina de un avión de ventas: superficies elevadas apiladas sobre un fondo casi negro, un único acento azul-acero de instrumentación, y cifras en monoespaciada que se leen como telemetría, no como decoración. La sensación es clínica pero no fría — como una sala de control bien iluminada, no un servidor abandonado.

Density: 8/10 (Cockpit Dense — muchas cifras por pantalla, jerarquía por peso y color, no por aire).
Variance: 5/10 (Offset Asymmetric — grids consistentes pero con jerarquía real, nunca simétrico-aburrido).
Motion: 4/10 (Fluid CSS — entradas escalonadas sutiles, sin coreografía cinematográfica; esto es una herramienta de trabajo, no una landing).

## 2. Color Palette & Roles

- **Base Ink** (`oklch(0.13 0.01 255)` ≈ #0E1116) — Fondo primario de la app. Nunca negro puro.
- **Panel Surface** (`oklch(0.17 0.01 255)` ≈ #171B21) — Fondo de cards, la superficie elevada estándar.
- **Panel Surface 2** (`oklch(0.2 0.01 255)` ≈ #1D2229) — Popovers, inputs, hover states, segunda elevación.
- **Sidebar Void** (`oklch(0.11 0.01 255)` ≈ #0A0D11) — Fondo del sidebar, un escalón más oscuro que la base.
- **Instrument Blue** (`oklch(0.72 0.09 230)` ≈ #7FA8C9) — Único acento. Saturación controlada (no neón). CTAs, focus rings, líneas activas, iconografía primaria.
- **Signal White** (`oklch(0.92 0.005 255)` ≈ #E8E9EB) — Texto primario, casi blanco, nunca #FFFFFF puro.
- **Steel Muted** (`oklch(0.6 0.01 255)` ≈ #8B8F96) — Texto secundario, metadata, labels.
- **Hairline Border** (`oklch(0.26 0.01 255)` ≈ #363B44) — Bordes estructurales de 1px, la línea que separa paneles.
- **Gauge Green** (`oklch(0.62 0.16 155)` ≈ #4FA87C) — Éxito, cumplimiento, tendencia positiva.
- **Gauge Amber** (`oklch(0.75 0.15 80)` ≈ #D3A94A) — Advertencia, cerca del umbral.
- **Gauge Red** (`oklch(0.68 0.22 25)` ≈ #E0684A) — Peligro, vencido, incumplimiento.

Regla dura: un solo acento (Instrument Blue) para interacción; verde/ámbar/rojo son exclusivamente semánticos de estado (KPIs, badges), nunca decorativos. Sin morado, sin gradientes neón, sin glow.

## 3. Typography Rules

- **Display** (`h1`–`h6`, títulos de sección): Space Grotesk Variable. Track-tight (`-0.015em` a `-0.02em`), peso 600, jerarquía por peso y color — nunca por tamaño desbocado.
- **Body / UI**: Inter Variable. Interlineado relajado (1.45), tamaño base 14px (esto es una herramienta densa, no editorial).
- **Mono** (todo número, KPI, timestamp, celda de tabla): JetBrains Mono, `font-variant-numeric: tabular-nums`. En density alta, todo dato numérico va en mono — es la regla de "High-Density Override".
- **Banned**: Ningún serif en ninguna pantalla (esto es software, no editorial). `Inter` sí se usa aquí para UI/body — es la excepción deliberada del sistema, no el display (que es Space Grotesk).

## 4. Component Stylings

- **Buttons (`brutal-button`)**: borde 1px, sombra sutil en reposo, feedback táctil `scale(0.98)` en press, sin sombra al presionar. Sin glow exterior, sin cursores custom. Primario = fill Instrument Blue con texto Base Ink; secundario = ghost/outline sobre Hairline Border.
- **Cards (`card-elevated`)**: radio generoso (`--radius: 0.75rem`), sombra apilada de dos capas (peso lo lleva el borde, no la sombra, en dark mode), hover eleva `-2px` + realza borde con 30% de Instrument Blue. En layouts de alta densidad (tablas de KPIs, grillas de sucursales), reemplazar cards por `border-top` dividers — no todo necesita ser una tarjeta.
- **Inputs**: label arriba, texto de ayuda opcional, error debajo. Focus ring en Instrument Blue.
- **Loaders (`skeleton`)**: shimmer que respeta las dimensiones exactas del layout final — nunca un spinner circular genérico.
- **Empty states**: composiciones que indican cómo poblar el dato (p. ej. "cargar Excel"), no un texto plano "Sin datos".
- **Status pills**: fondo tintado al 12% + texto saturado + borde al 30% del color semántico (`status-success`/`status-warning`/`status-danger`) — nunca solo texto de color sobre fondo plano.
- **Progress bars**: track de 6px, `transform-origin: left`, transición de 600ms — nunca `width` animado (compositor-friendly).

## 5. Layout Principles

- Sidebar colapsable (56px colapsado / 220px expandido) sobre `Sidebar Void`, un tono más oscuro que el contenido — separa navegación de datos sin usar solo un borde.
- Header sticky con blur (`sticky-blur`) — nunca contenido tapado detrás del scroll.
- Grids de KPIs: bento asimétrico, no "3 cards iguales en fila" — usar `bento-feature` (span 2) para el KPI que manda en cada vista.
- CSS Grid para layouts de dashboard, nunca hacks de `calc()` porcentual.
- Contención con max-width en vistas de detalle (cliente-360, minutas); las vistas de tabla/grilla van full-width del panel.
- Ningún elemento se superpone a otro — cada tarjeta, cada tabla, ocupa su zona espacial propia.

## 6. Responsive Rules

- Colapso mobile-first estricto (<768px): sidebar se oculta tras trigger, grids bento colapsan a una columna (`bento-feature` → span 1).
- Sin scroll horizontal en la página — tablas anchas (Pareto, Cobranzas, comisiones) van en su propio contenedor `overflow-x: auto`.
- Headlines vía `clamp()`; cuerpo nunca baja de 14px (ya es el tamaño base del sistema).
- Objetivos táctiles mínimo 44px en toda vista usada desde tablet en sucursal.
- `min-h-[100dvh]` para secciones full-height, nunca `h-screen`.

## 7. Motion & Interaction

- Spring/ease por defecto: `cubic-bezier(0.16, 1, 0.3, 1)` (`--ease-out`), 150–300ms — nunca linear.
- Entradas escalonadas (`section-enter-1/2/3`, delays de 50/100/150ms) al montar una vista — nunca todo el dashboard aparece de golpe.
- El único loop perpetuo permitido es el indicador "online" (`online-indicator-pulse`) — este es un panel de trabajo, no una landing con micro-interacciones infinitas por todas partes.
- Animar solo `transform` y `opacity`. `prefers-reduced-motion: reduce` desactiva todas las animaciones no esenciales (ya implementado en el sistema).

## 8. Anti-Patterns (Banned)

- Sin emojis en ninguna pantalla.
- Sin negro puro (`#000000`) — siempre Base Ink u otro tono de la escala.
- Sin morado/azul neón tipo "IA genérica", sin glow exterior en botones.
- Sin acentos sobresaturados — Instrument Blue es el único, y está calibrado por debajo de 80% de saturación.
- Sin serif en ninguna vista — esto es software de gestión, no editorial.
- Sin grid de "3 cards iguales" para KPIs — usar bento asimétrico.
- Sin cursores custom.
- Sin superposición de elementos — cada componente en su zona espacial.
- Sin nombres genéricos de ejemplo ("John Doe", "Acme Corp") — usar nombres de sucursales/asesores reales del catálogo del proyecto o placeholders explícitamente marcados como tal.
- Sin cifras redondas falsas (`99.99%`, `50%` de relleno) en mockups de KPIs — usar valores con decimales creíbles, coherentes con datos reales de ventas/cobranzas.
- Sin clichés de copy IA ("Eleva", "Sin fricciones", "Desbloquea", "Next-Gen").
- Sin "scroll para explorar", flechas rebotando — esto es un dashboard interno, no un hero de marketing.
- Sin spinners circulares genéricos — usar skeletons que respeten el layout.
