# 007 — Memoizar la función `dot` custom de TalleresMonthlyChart

- **Status**: TODO
- **Commit**: 593684b
- **Severity**: LOW
- **Category**: Performance

## Problem

```tsx
// src/components/servicios/TalleresMonthlyChart.tsx:93,101,109 — current
<Line
  type="monotone"
  dataKey="CRM"
  name="CRM"
  stroke={WORKSHOP_COLORS.CRM}
  strokeWidth={2.5}
  dot={(dotProps) => renderCustomDot(dotProps, selectedMonths)}
/>
<Line
  type="monotone"
  dataKey="CNRC"
  name="CNRC"
  stroke={WORKSHOP_COLORS.CNRC}
  strokeWidth={2.5}
  dot={(dotProps) => renderCustomDot(dotProps, selectedMonths)}
/>
<Line
  type="monotone"
  dataKey="MachineShop"
  name="Machine Shop"
  stroke={WORKSHOP_COLORS.MachineShop}
  strokeWidth={2.5}
  dot={(dotProps) => renderCustomDot(dotProps, selectedMonths)}
/>
```

Cada uno de los 3 `<Line>` recibe una arrow function inline como prop `dot`, recreada en cada render de `TalleresMonthlyChart`. El propio componente ya está envuelto en `memo` (línea ~67), así que solo re-renderiza cuando cambian `data`/`title`/`selectedMonths` — pero cuando SÍ re-renderiza (por ejemplo, al cambiar `selectedMonths` al navegar de mes), las 3 funciones `dot` son nuevas referencias cada vez, lo que puede invalidar comparaciones internas de Recharts por referencia entre renders consecutivos del mismo `<Line>`.

## Target

```tsx
/* target — dentro del cuerpo de TalleresMonthlyChart, antes del return, usando useCallback */
const renderCrmDot = useCallback(
  (dotProps: CustomDotProps) => renderCustomDot(dotProps, selectedMonths),
  [selectedMonths],
);
const renderCnrcDot = useCallback(
  (dotProps: CustomDotProps) => renderCustomDot(dotProps, selectedMonths),
  [selectedMonths],
);
const renderMachineShopDot = useCallback(
  (dotProps: CustomDotProps) => renderCustomDot(dotProps, selectedMonths),
  [selectedMonths],
);
```

```tsx
/* target — cada <Line> usa su callback memoizado en vez de la arrow function inline */
<Line ... dot={renderCrmDot} />
<Line ... dot={renderCnrcDot} />
<Line ... dot={renderMachineShopDot} />
```

## Repo conventions to follow

- El archivo ya importa `memo` de `"react"` en la línea 1 (`import { memo } from "react";`) — agregar `useCallback` al mismo import, mismo estilo: `import { memo, useCallback } from "react";`.
- El tipo `CustomDotProps` ya está definido en el mismo archivo (líneas ~35-40) — reusarlo tal cual para tipar el parámetro de cada callback, no crear un tipo nuevo.

## Steps

1. En `src/components/servicios/TalleresMonthlyChart.tsx`, cambiar el import de React de `import { memo } from "react";` a `import { memo, useCallback } from "react";`.
2. Dentro del cuerpo de la función `TalleresMonthlyChart` (después de la desestructuración de props, antes del `return`), agregar las 3 declaraciones `useCallback` mostradas en el Target, una por cada serie (CRM, CNRC, MachineShop), cada una dependiendo de `[selectedMonths]`.
3. Reemplazar los 3 props `dot={(dotProps) => renderCustomDot(dotProps, selectedMonths)}` por `dot={renderCrmDot}`, `dot={renderCnrcDot}`, `dot={renderMachineShopDot}` respectivamente (en el mismo orden en que aparecen: CRM primero, CNRC segundo, MachineShop tercero).

## Boundaries

- Do NOT tocar la función `renderCustomDot` en sí (líneas ~42-65) — su firma y lógica interna quedan exactamente iguales.
- Do NOT tocar `src/components/servicios/CsaTrendChart.tsx` — aunque tenga un patrón similar de dot custom, no está en el alcance de este plan (revisar si aplica el mismo patrón queda para una iteración futura, no la asumas aquí).
- Do NOT cambiar el comportamiento visual de los puntos — el fix es puramente de memoización, cero cambio de UI.

## Verification

- **Mechanical**: `bunx tsc --noEmit` sin errores (verificar que `CustomDotProps` tipa correctamente el parámetro de cada `useCallback`). `bun run build` compila.
- **Feel check**: en `/servicios`, con el gráfico "Ventas por Taller y Mes" visible, cambia el filtro de mes (o navega con ← / →) varias veces seguidas — el resaltado del mes seleccionado (punto grande/opaco vs. puntos chicos/tenues del resto) debe seguir funcionando exactamente igual que antes, sin parpadeos ni puntos que no se actualicen.
- **Done when**: los 3 `<Line>` usan callbacks memoizados, el comportamiento de resaltado por mes es idéntico al anterior, y `tsc`/`build` pasan limpios.
