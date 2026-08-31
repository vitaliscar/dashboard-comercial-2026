# 008 — Atar el pulso "Online" del header al estado real de conexión

- **Status**: TODO
- **Commit**: 593684b
- **Severity**: LOW
- **Category**: Purpose & frequency

## Problem

```tsx
// src/components/app-shell.tsx:365-367 — current
<div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground pl-2 border-l border-border">
  <span className="w-2 h-2 bg-success border border-border online-indicator-pulse rounded-full"></span>
  <span className="font-display text-[10px] font-bold">Online</span>
</div>
```

```css
/* src/styles.css:417-419 — ya existe, no tocar la keyframe en sí */
@utility online-indicator-pulse {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
```

Este punto verde con pulso corre infinitamente en **todas las páginas de la app, todo el tiempo** (es el elemento con mayor exposición visual de todo el codebase) — pero el texto es literal ("Online") y el color/animación no están atados a ningún estado real de conexión (no hay `navigator.onLine`, ni websocket, ni polling de salud cerca de este código). Es decoración pura en el elemento más visible de la app, sin propósito real de indicar estado — el playbook es explícito: "'se ve cool' en un elemento de alta frecuencia no es un propósito" (AUDIT.md sección 1).

## Target

Un hook nuevo que lee el estado real de conexión del navegador, y el indicador refleja ese estado (color + pulso solo cuando corresponde):

```tsx
// src/hooks/use-online-status.ts (nuevo)
export function useOnlineStatus(): boolean { ... }
```

```tsx
/* target — app-shell.tsx:365-367 */
<div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground pl-2 border-l border-border">
  <span
    className={cn(
      "w-2 h-2 border border-border rounded-full",
      isOnline ? "bg-success online-indicator-pulse" : "bg-danger",
    )}
  />
  <span className="font-display text-[10px] font-bold">{isOnline ? "Online" : "Sin conexión"}</span>
</div>
```

Nota de diseño: el pulso (`online-indicator-pulse`) se mantiene SOLO cuando `isOnline` es true (sigue siendo continuo mientras hay conexión, coherente con su uso actual), pero ahora el color y el texto sí cambian a un estado real cuando el navegador pierde conexión — el punto deja de ser 100% decorativo.

## Repo conventions to follow

- Exemplar exacto para el hook nuevo: `src/hooks/use-mobile.ts` (mismo patrón: `useState` + `useEffect` con listener de evento del navegador + cleanup). Para online/offline se usan los eventos nativos `window.addEventListener("online", ...)` / `"offline"`, no `matchMedia`.
- `app-shell.tsx` ya importa `cn` de `"@/lib/utils"` (línea 31) — reusar esa utilidad para las clases condicionales, no armar un ternario de string a mano.

## Steps

1. Crear `src/hooks/use-online-status.ts`:

   ```tsx
   import { useEffect, useState } from "react";

   /** Estado real de conexión del navegador — usado por el indicador "Online" del header. */
   export function useOnlineStatus(): boolean {
     const [isOnline, setIsOnline] = useState(true);

     useEffect(() => {
       setIsOnline(navigator.onLine);
       const handleOnline = () => setIsOnline(true);
       const handleOffline = () => setIsOnline(false);
       window.addEventListener("online", handleOnline);
       window.addEventListener("offline", handleOffline);
       return () => {
         window.removeEventListener("online", handleOnline);
         window.removeEventListener("offline", handleOffline);
       };
     }, []);

     return isOnline;
   }
   ```

2. En `src/components/app-shell.tsx`, agregar el import: `import { useOnlineStatus } from "@/hooks/use-online-status";`.
3. Dentro del cuerpo de `AppShell` (junto a los demás hooks, cerca de `const { profile, role, signOut } = useAuth();` en la línea ~132), agregar: `const isOnline = useOnlineStatus();`.
4. Reemplazar el bloque de las líneas 365-367 por el Target de arriba (usando `cn(...)` para las clases condicionales del `<span>` del punto, y el texto condicional "Online" / "Sin conexión").

## Boundaries

- Do NOT tocar la keyframe `pulse` ni el `@utility online-indicator-pulse` en `src/styles.css` — el mecanismo de animación en sí está bien, el problema era solo que no reflejaba nada real.
- Do NOT agregar polling al servidor ni websockets — el alcance es exclusivamente `navigator.onLine` + eventos nativos del navegador (conectividad de red del cliente), no salud del backend.
- Usar `bg-danger` (no `bg-destructive`) para el estado offline — es el token que ya usa `src/components/kpi-card.tsx` para su propio semantic status color de "malo", consistente con el resto del dashboard (ver `--danger` en `styles.css:37`); `bg-destructive` es más el convention de shadcn para errores de formulario, no para este tipo de indicador de estado.
- Do NOT cambiar ningún otro elemento del header.

## Verification

- **Mechanical**: `bunx tsc --noEmit` y `bun run build` sin errores.
- **Feel check**:
  - Con la app corriendo y conexión normal, el header debe mostrar el punto verde pulsante y el texto "Online", igual que antes.
  - En Chrome DevTools → Network panel → cambiar el throttling a "Offline" → el punto debe cambiar a color destructivo/rojo SIN pulso, y el texto debe cambiar a "Sin conexión", en cuestión de milisegundos (el evento `offline` del navegador es inmediato).
  - Volver a "Online" en el throttling → el punto vuelve a verde con pulso y el texto vuelve a "Online".
- **Done when**: el indicador refleja el estado real de `navigator.onLine`, el pulso solo corre mientras hay conexión, y el build pasa limpio.
