# Guía de Accesibilidad (WCAG 2.1 AA)

**Proyecto**: `dashboard-comercial-2026`

Este documento detalla los estándares de accesibilidad aplicados para garantizar que el Dashboard Comercial cumpla con el nivel **WCAG 2.1 AA**.

---

## 1. Principios Cumplidos

### Perceptible

- **Contraste de Colores (Criterio 1.4.3)**: Relación de contraste mínimo de **4.5:1** para texto normal y **3.0:1** para texto grande/componentes interactivos.
- **Modo Oscuro / Claro Harmonizado**: Paleta Tailwind Tailored HSL con suficientes niveles de contraste en estados inactivos, hover y focus.
- **Etiquetas Alt en Elementos Visuales (Criterio 1.1.1)**: Imágenes y logotipos corporativos (`Logo_CCV.png`) incluyen atributos `alt` descriptivos.

### Operable

- **Navegación Completa por Teclado (Criterio 2.1.1)**: Todos los enlaces, botones y desplegables son enfocables mediante `Tab` y activables con `Space` / `Enter`.
- **Indicadores Visibles de Foco (Criterio 2.4.7)**: Anillos de foco visibles (`focus-visible:ring-2 focus-visible:ring-primary`).

### Comprensible

- **Validación de Formularios y Mensajes de Error (Criterio 3.3.1 / 3.3.2)**: Errores en formularios de login e inserción de datos explican claramente el error sin depender únicamente del color.

### Robusto

- **Atributos ARIA (Criterio 4.1.2)**: Componentes complejos (diálogos, acordeones de Radix UI / Shadcn) utilizan roles `role="dialog"`, `aria-expanded`, `aria-controls` y `aria-label`.
