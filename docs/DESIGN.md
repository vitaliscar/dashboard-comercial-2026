# Design System

## Overview

This repository uses a single, shared CSS design tokens file in `src/styles.css`.
The theme is defined with Tailwind CSS v4 using `@theme inline` and OKLCH-based semantic tokens.

### Key principles

- Light/dark themes are defined via `:root` and `.dark`
- Semantic states use accessible OKLCH color roles for `success`, `warning`, `danger`, `accent`, and `destructive`
- Spacing, typography, and surfaces are normalized with CSS custom properties and utility definitions
- UI primitives are built in `src/components/ui/` using Tailwind utility classes and CVA-style variant systems

## Theme Tokens

### Light theme (base)

- `--background`: `oklch(0.99 0.01 276)` — near-white surface
- `--foreground`: `oklch(0.12 0.01 250)` — dark text
- `--muted`: `oklch(0.73 0.02 250)` — subdued text
- `--border`: `oklch(1 0 0 / 10%)`
- `--radius`: `1.25rem`
- `--shadow`: layered surface shadow stack

### Semantic states

- `--success`: `oklch(0.7 0.15 160)`
- `--success-foreground`: `oklch(0.20 0.02 160)`
- `--warning`: `oklch(0.78 0.15 70)`
- `--warning-foreground`: `oklch(0.2 0.02 70)`
- `--danger`: `oklch(0.62 0.22 25)`
- `--danger-foreground`: `oklch(0.18 0.01 25)`
- `--accent`: `oklch(0.279 0.041 260.031)`
- `--accent-foreground`: `oklch(0.984 0.003 247.858)`
- `--destructive`: `oklch(0.704 0.191 22.216)`
- `--destructive-foreground`: `oklch(0.18 0.01 22.216)`

### Dark theme overrides

- `--background`: `oklch(0.07 0.005 240)`
- `--foreground`: `oklch(0.94 0.004 280)`
- `--muted`: `oklch(0.71 0.03 260)`
- `--border`: `oklch(0.16 0.03 220 / 10%)`
- `--surface`: `oklch(0.12 0.02 260)`
- `--surface-muted`: `oklch(0.15 0.02 260)`
- `--surface-emphasis`: `oklch(0.16 0.03 250)`

## Component Primitives

The UI primitives are located under `src/components/ui/`.
These are reusable, low-level building blocks used across routes and pages.

### Key primitives

- `Button` (`src/components/ui/button.tsx`)
- `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` (`src/components/ui/card.tsx`)
- `Badge` (`src/components/ui/badge.tsx`)
- `Sidebar`, `Sheet`, `SheetContent`, `SheetTrigger` (`src/components/ui/sidebar.tsx`)

### Usage patterns

- Buttons use variant systems (`default`, `secondary`, `outline`, `destructive`, `ghost`, `link`)
- Cards and badges rely on semantic color utilities like `bg-success`, `bg-warning`, `bg-danger`, `bg-destructive`
- Layout shell and navigation are composed in `src/components/app-shell.tsx`
- KPI summaries use accent and status colors in `src/components/kpi-card.tsx`

## Accessibility Notes

- Semantic foreground tokens for `success`, `danger`, and `destructive` were adjusted to darker OKLCH values to meet contrast requirements on their own backgrounds.
- `destructive` now uses a darker foreground in both light and dark themes for readable label text against the semantic container.
- The shared theme avoids hardcoded hex values inside components; use CSS custom properties instead.
- Text-transform utilities such as uppercase should be used sparingly and only for labels, badges, or secondary metadata.

## Design Implementation

### Typography

The project uses system fonts and utility-first spacing.
Typography is controlled through CSS custom properties and Tailwind classes in `src/styles.css`.

### Surface and shadows

- Elevated surfaces use `box-shadow` and `backdrop-filter` utilities defined in `src/styles.css`
- Cards use consistent border radius and background token values across light and dark mode

## How to update

1. Edit semantic tokens in `src/styles.css`.
2. Adjust the OKLCH values for hue, chroma, and lightness as needed.
3. Review usage in `src/components/ui/` for any components that hardcode colors.
4. Run typography/accessibility validation manually after token changes.
