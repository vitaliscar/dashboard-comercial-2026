# PWA + Mobile — Plan de Implementación

> **Para agentes ejecutores:** SUB-SKILL REQUERIDA: usar `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para ejecutar tarea por tarea. Los pasos usan checkbox (`- [ ]`).

**Goal:** Convertir el dashboard en una PWA instalable (home screen + `standalone`) con notificaciones push para alertas de negocio, y adaptar la UI a teléfono y tablet reutilizando el mismo backend (Server Actions + RLS).

**Architecture:** `@ducanh2912/next-pwa` para manifest/SW; tabla `push_subscriptions` + job cron con `web-push`; shell móvil con `MobileBottomNav` en `app-shell.tsx`; layouts responsive módulo a módulo empezando por Resumen, Cobranzas, Alertas y Minutas; primitives compartidos en `src/components/mobile/`.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4, `@ducanh2912/next-pwa`, `web-push`, Drizzle ORM, PostgreSQL 18, Playwright (viewports móvil), Bun.

**Spec fuente:** `docs/superpowers/specs/2026-08-02-pwa-mobile-design.md` — leerla antes de empezar (decisiones de bottom nav, breakpoints, fuera de alcance).

**Mockup de referencia:** [Artifact Claude — layouts móvil/tablet](https://claude.ai/code/artifact/919384b1-f804-4b24-9c47-9bf6f7d5bc35) (4 módulos, paleta Terminal Ámbar).

## Global Constraints

- Idioma de UI y comentarios: español. Commits: conventional commits (`feat:`, `fix:`, `test:`, `docs:`).
- **No duplicar backend:** push, layouts y PWA consumen las mismas Server Actions y RLS existentes. Nada de API REST paralela salvo el handler de push del SW (estándar del navegador).
- **Bug recurrente:** guards de rol después de todos los hooks; `enabled: canView` en queries condicionadas.
- **Desktop sin regresiones:** cambios responsive con prefijos `max-md:` / `md:` / `lg:`; la barra inferior y sheets móviles llevan `lg:hidden`.
- **HTTPS en producción** obligatorio para PWA y push — ver `deploy/nginx.conf.example`.
- **CSP:** actualizar `next.config.ts` para `worker-src 'self'` cuando se active el SW.
- **PII:** las notificaciones push llevan solo título genérico + conteo ("3 cobranzas vencidas"); el detalle se ve dentro de la app autenticada.
- Migraciones Drizzle → `src/db/migrations/`; RLS manual → `src/db/migrations-manual/`.
- Verificación por tarea: `bunx tsc --noEmit` antes de cada commit. Si `bun run lint` global se cuelga, lint focalizado en archivos tocados.

## Estado actual del repo (verificado 2026-08-02)

| Pieza | Estado |
|-------|--------|
| `src/hooks/use-mobile.ts` | Existe (`< 768px`) — extender, no reemplazar |
| `src/hooks/use-online-status.ts` | Indicador Online en header — reutilizar en banner offline |
| `src/components/app-shell.tsx` | Sidebar slide-in en móvil (`lg:`), sin bottom nav |
| `src/styles.css` | `--sidebar-collapsed-width: 56px` definido, poco usado en app-shell actual |
| Manifest / SW / push | **No existe** |
| Iconos PWA dedicados | Solo `public/Logo_CCV.png` (no maskable ni 512) |
| Módulo Mercadeo | Implementado (`2cd1f08`) — incluir en sheet "Más" cuando aplique rol |

---

### Task 1: Infraestructura PWA — dependencia, manifest e iconos

**Files:**
- Modify: `package.json`, `next.config.ts`
- Create: `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/icon-maskable-512.png`
- Modify: `src/app/layout.tsx` (metadata PWA)
- Modify: `.env.example` (comentario HTTPS)

**Interfaces:**
- Produces: app instalable en Chrome/Edge (Android/desktop); `display: standalone`; Lighthouse PWA parcial (falta SW hasta Task 2).

- [ ] **Step 1: Instalar `@ducanh2912/next-pwa`**

```bash
bun add @ducanh2912/next-pwa
```

- [ ] **Step 2: Generar iconos PWA**

Desde `public/Logo_CCV.png`, generar (ImageMagick, sharp script o herramienta online) y guardar en `public/icons/`:
- `icon-192.png` (192×192)
- `icon-512.png` (512×512)
- `icon-maskable-512.png` (512×512 con padding safe-zone ~20%)

Opcional: script `scripts/generate-pwa-icons.ts` con `sharp` si se agrega como devDependency.

- [ ] **Step 3: Configurar `next.config.ts`**

Envolver el config existente con `withPWA` (deshabilitado en dev):

```ts
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  workboxOptions: {
    // No precachear rutas de API ni Server Actions
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
        handler: "CacheFirst",
        options: { cacheName: "google-fonts", expiration: { maxEntries: 4 } },
      },
    ],
  },
});

export default withPWA(nextConfig);
```

Actualizar CSP: agregar `worker-src 'self';` al `cspHeader`.

- [ ] **Step 4: Metadata en `src/app/layout.tsx`**

Extender `metadata`:

```ts
export const metadata: Metadata = {
  // ...existente...
  manifest: "/manifest.json", // generado por next-pwa en build, o estático en public/
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CCV",
  },
  themeColor: "#1a1a1a",
};
```

Agregar en `<head>` vía metadata viewport si falta: `viewport-fit=cover` para safe areas.

- [ ] **Step 5: Build y verificación**

```bash
bun run build
bun run start
```

En Chrome DevTools → Application → Manifest: verificar nombre, iconos, `display: standalone`.

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock next.config.ts src/app/layout.tsx public/icons .env.example
git commit -m "feat: infraestructura PWA con manifest e iconos"
```

---

### Task 2: Service Worker en producción + prompt de instalación

**Files:**
- Create: `src/components/mobile/InstallPrompt.tsx`
- Modify: `src/components/app-shell.tsx` (montar prompt)
- Create: `src/hooks/use-install-prompt.ts`

**Interfaces:**
- Produces: SW registrado en producción; banner discreto "Instalar app" cuando `beforeinstallprompt` dispara.

- [ ] **Step 1: Hook `useInstallPrompt`**

Capturar `beforeinstallprompt`, exponer `{ canInstall, promptInstall, dismiss }`. Persistir dismiss en `sessionStorage`.

- [ ] **Step 2: Componente `InstallPrompt`**

Card fija abajo (encima de bottom nav futura) con CTA "Instalar" y cerrar. Solo `lg:hidden`. Paleta Terminal Ámbar (`card-elevated`, botón primary).

- [ ] **Step 3: Montar en `app-shell.tsx`**

Dentro del layout autenticado, después del `<main>`.

- [ ] **Step 4: Verificar en build de producción**

`bun run build && bun run start` — en Application → Service Workers debe aparecer `sw.js` (o nombre que genere next-pwa).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-install-prompt.ts src/components/mobile/InstallPrompt.tsx src/components/app-shell.tsx
git commit -m "feat: prompt de instalación PWA"
```

---

### Task 3: Breakpoints y shell móvil (bottom nav)

**Files:**
- Create: `src/hooks/use-breakpoint.ts`
- Create: `src/lib/mobile-nav.ts`
- Create: `src/components/mobile/MobileBottomNav.tsx`
- Create: `src/components/mobile/MoreNavSheet.tsx`
- Modify: `src/components/app-shell.tsx`
- Modify: `src/styles.css` (safe-area)

**Interfaces:**
- Consumes: `canAccessModule`, `NAV_GROUPS` / `UNIT_NAV` de app-shell.
- Produces: navegación inferior en `< lg`; padding `pb-safe` en main.

- [ ] **Step 1: Hook `useBreakpoint`**

```ts
export type Breakpoint = "mobile" | "tablet" | "desktop";
// mobile: < 768, tablet: 768-1023, desktop: >= 1024
```

Reutilizar la misma lógica de `matchMedia` que `use-mobile.ts` (considerar refactor interno compartido).

- [ ] **Step 2: Config central `src/lib/mobile-nav.ts`**

```ts
export const MOBILE_TAB_SLOTS = [
  { id: "resumen", label: "Resumen", href: "/resumen", icon: BarChart3, module: "resumen" as const },
  { id: "modulos", label: "Módulos", action: "unit-sheet" as const, icon: Package },
  { id: "alertas", label: "Alertas", href: "/alertas", icon: Bell, module: "alertas" as const },
  { id: "minutas", label: "Minutas", href: "/minutas", icon: FileText, module: "minutas" as const },
  { id: "mas", label: "Más", action: "more-sheet" as const, icon: Menu },
] as const;
```

Documentar en comentario que el slot `minutas` es intercambiable por `cobranzas` según feedback de campo.

- [ ] **Step 3: `MobileBottomNav`**

- Fijo `bottom-0`, `lg:hidden`, `h-16`, `pb-[env(safe-area-inset-bottom)]`
- Ítems filtrados por `canAccessModule(role, module)`; slots con `action` siempre visibles si hay al menos un módulo de unidad
- Estado activo por `usePathname()`

- [ ] **Step 4: `MoreNavSheet`**

Sheet (vaul o Radix Sheet existente) con todos los grupos de `NAV_GROUPS` filtrados — mismo contenido que sidebar, sin duplicar la lista de rutas en otro archivo (exportar `NAV_GROUPS` desde un módulo compartido si hace falta refactor mínimo).

- [ ] **Step 5: Integrar en `app-shell.tsx`**

- `<main>`: agregar `pb-20 lg:pb-0` para no tapar contenido con la barra
- Ocultar botón hamburger en móvil si la bottom nav cubre navegación (opcional: mantener hamburger solo para usuarios sin acceso a tabs)
- Sheet de unidades al tap en "Módulos"

- [ ] **Step 6: Safe area en `styles.css`**

```css
.pb-safe {
  padding-bottom: env(safe-area-inset-bottom);
}
```

- [ ] **Step 7: Verificación manual**

`bun run dev` — viewport 390px: barra inferior visible, sidebar no necesario. 1280px: sin barra, sidebar normal.

- [ ] **Step 8: Commit**

```bash
git add src/hooks/use-breakpoint.ts src/lib/mobile-nav.ts src/components/mobile src/components/app-shell.tsx src/styles.css
git commit -m "feat: shell móvil con barra de navegación inferior"
```

---

### Task 4: Schema `push_subscriptions` + RLS

**Files:**
- Modify: `src/db/schema.ts`
- Create: `src/db/migrations/0008_*.sql` (drizzle-kit generate)
- Create: `src/db/migrations-manual/0008_push_subscriptions_rls.sql`
- Modify: `CLAUDE.md` (orden migraciones)

**Interfaces:**
- Produces: tabla `push_subscriptions`; policies por `user_id`.

- [ ] **Step 1: Tabla en schema**

```ts
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("push_subscriptions_user_idx").on(t.userId)],
);
```

- [ ] **Step 2: Generar y aplicar migración**

```bash
bunx drizzle-kit generate
docker exec -i dashboard-comercial-postgres psql -U app_admin -d dashboard_comercial < src/db/migrations/0008_<nombre>.sql
```

- [ ] **Step 3: RLS**

```sql
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_own_push_subscriptions ON push_subscriptions FOR SELECT
  USING (user_id = current_app_user_id());
CREATE POLICY insert_own_push_subscriptions ON push_subscriptions FOR INSERT
  WITH CHECK (user_id = current_app_user_id());
CREATE POLICY delete_own_push_subscriptions ON push_subscriptions FOR DELETE
  USING (user_id = current_app_user_id());
```

- [ ] **Step 4: Documentar en CLAUDE.md**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: tabla push_subscriptions con RLS"
```

---

### Task 5: Web Push — subscribe/unsubscribe + banner de permisos

**Files:**
- Modify: `package.json` (`web-push`)
- Create: `src/lib/push/vapid.ts`
- Create: `src/lib/actions/push.ts`
- Create: `src/components/mobile/PushPermissionBanner.tsx`
- Modify: `src/components/app-shell.tsx`
- Modify: `.env.example`

**Interfaces:**
- Produces: `subscribePushAction`, `unsubscribePushAction`, `getVapidPublicKeyAction`.

- [ ] **Step 1: Dependencia y VAPID**

```bash
bun add web-push
```

`src/lib/push/vapid.ts` — lee `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (solo server).

Documentar generación de keys en `.env.example`.

- [ ] **Step 2: Server Actions en `src/lib/actions/push.ts`**

- `getVapidPublicKeyAction()` → `{ publicKey }` (público, sin auth estricta)
- `subscribePushAction(subscription: PushSubscriptionJSON)` — parsea keys, upsert por `endpoint`
- `unsubscribePushAction(endpoint: string)` — delete propio

Todo bajo `withAuth`.

- [ ] **Step 3: Cliente — registrar SW push handler**

En el componente de suscripción, tras permiso `granted`:
1. `navigator.serviceWorker.ready`
2. `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`
3. Llamar `subscribePushAction`

Manejar `Notification.permission === 'denied'` con mensaje en UI.

- [ ] **Step 4: `PushPermissionBanner`**

Banner en header o debajo de InstallPrompt; solo si permiso `default` y usuario autenticado. Botón "Activar alertas".

- [ ] **Step 5: Logout limpia suscripción**

En flujo de `signOut` (o `logoutAction` callback client), llamar `unsubscribePushAction` si hay subscription activa.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat: suscripción Web Push con VAPID"
```

---

### Task 6: Envío de push desde alertas (cron)

**Files:**
- Create: `src/lib/push/send.ts`
- Create: `src/lib/push/evaluate-alerts.ts`
- Create: `scripts/send-push-alerts.ts`
- Optional: `src/db/schema.ts` + migración `push_delivery_log` (dedup)
- Modify: `deploy/README.md` o `docs/RUNBOOK.md`

**Interfaces:**
- Consumes: lógica de severidad de `src/lib/actions/alertas.ts` (extraer a módulo puro si hace falta).
- Produces: script CLI invocable por cron; máx. 1 push/usuario/tipo/día.

- [ ] **Step 1: Extraer evaluación de alertas a módulo puro**

Si `getAlertasSourcesAction` no es reutilizable desde CLI, crear `src/lib/analytics/alertas-push.ts` con función `buildPushMessages(sources, role)` que devuelva `{ title, body, url, dedupKey }[]` — testeable con Vitest.

- [ ] **Step 2: `src/lib/push/send.ts`**

Usar `web-push` + `dbAdmin` para leer suscripciones (BYPASSRLS) **solo en este script**, nunca en requests de usuario.

- [ ] **Step 3: Script `scripts/send-push-alerts.ts`**

```bash
bun scripts/send-push-alerts.ts
```

Itera usuarios con suscripciones activas, evalúa alertas alta severidad, envía, registra en `push_delivery_log`.

- [ ] **Step 4: Cron en VPS**

Ejemplo crontab (cada día 8:00 Caracas):

```
0 12 * * * cd /app && bun scripts/send-push-alerts.ts >> /var/log/push-alerts.log 2>&1
```

Documentar en RUNBOOK.

- [ ] **Step 5: Handler `notificationclick` en SW**

Custom SW o `customWorkerSrc` de next-pwa para abrir `/alertas` al tocar la notificación.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat: envío programado de push por alertas de negocio"
```

---

### Task 7: Primitive `ResponsiveDataList` (tabla ↔ tarjetas)

**Files:**
- Create: `src/components/mobile/ResponsiveDataList.tsx`
- Create: `src/components/mobile/DataCard.tsx`

**Interfaces:**
- Produces: `<ResponsiveDataList columns={...} rows={...} renderCard={...} />` — tabla en `md:`, cards en móvil.

- [ ] **Step 1: API del componente**

```tsx
type Column<T> = { key: string; header: string; className?: string; render: (row: T) => ReactNode };
type ResponsiveDataListProps<T> = {
  columns: Column<T>[];
  rows: T[];
  keyFn: (row: T) => string;
  renderMobileCard: (row: T) => ReactNode;
  emptyLabel?: string;
};
```

Desktop (`md:`): `<Table>` actual. Mobile: stack de `renderMobileCard`.

- [ ] **Step 2: Tests visuales manuales con Story o página dev** (opcional)

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: componente ResponsiveDataList para vistas móvil"
```

---

### Task 8: Resumen — layout móvil

**Files:**
- Modify: `src/app/(app)/resumen/page.tsx`
- Modify: `src/components/resumen/BusinessUnitCard.tsx` (si aplica)
- Modify: `src/components/resumen/FilterHeader.tsx` (colapso en móvil)

**Interfaces:**
- Consumes: mockup artifact § Resumen — KPIs 4→2, gráficos apilados.

- [ ] **Step 1: Rejilla KPIs**

Cambiar grillas principales a `grid-cols-2 md:grid-cols-3 xl:grid-cols-5` donde aún diga `sm:grid-cols-3` sin breakpoint móvil 2-col.

- [ ] **Step 2: Secciones de gráficos**

`grid-cols-1 lg:grid-cols-2` — forzar stack en móvil con `gap-4`, altura mínima charts `min-h-[240px]`.

- [ ] **Step 3: FilterHeader**

En `< md`, colapsar filtros secundarios tras botón "Filtros" (Sheet o Collapsible).

- [ ] **Step 4: Verificar viewports 390px y 1280px**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: layout móvil del módulo Resumen"
```

---

### Task 9: Cobranzas — tabla a tarjetas en móvil

**Files:**
- Create: `src/components/cobranzas/CobranzaMobileCard.tsx`
- Modify: `src/app/(app)/cobranzas/page.tsx`

**Interfaces:**
- Consumes: `ResponsiveDataList` (Task 7); mockup — franja de severidad por días vencidos.

- [ ] **Step 1: `CobranzaMobileCard`**

Tarjeta con:
- Franja izquierda `w-1` color por severidad (danger/warning/muted)
- Cliente, factura, saldo, días — tipografía `text-sm`
- Target táctil: toda la card `min-h-[72px]`

- [ ] **Step 2: Tabla principal de aging (6 columnas)**

Envolver con `ResponsiveDataList` o duplicar patrón inline: `hidden md:block` tabla + `md:hidden` lista de cards.

- [ ] **Step 3: KPIs superiores**

`grid-cols-2 sm:grid-cols-3 lg:grid-cols-5` (evitar 5 cols en móvil).

- [ ] **Step 4: Verificar tablet 768px** — tabla visible.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: vista móvil de Cobranzas con tarjetas por factura"
```

---

### Task 10: Alertas — pulido móvil

**Files:**
- Modify: `src/app/(app)/alertas/page.tsx`

**Interfaces:**
- Mockup: lista con severidad en color y borde — ya cercano; pulir espaciado.

- [ ] **Step 1: Cards de alerta**

Asegurar `border-l-4` por severidad (`alta` → danger, `media` → warning, `baja` → muted).

- [ ] **Step 2: KPIs resumen**

`grid-cols-2 sm:grid-cols-4`.

- [ ] **Step 3: Targets táctiles en acciones** (`min-h-11`).

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: pulido móvil del módulo Alertas"
```

---

### Task 11: Minutas — formulario táctil + layout tablet

**Files:**
- Modify: `src/app/(app)/minutas/page.tsx`
- Optional: `src/components/minutas/MinutaForm.tsx` (extraer formulario)

**Interfaces:**
- Mockup: targets 44px; tablet lista+formulario lado a lado.

- [ ] **Step 1: Inputs táctiles**

`Input`, `Select`, `Textarea`, `Button`: `min-h-11 text-base` en `max-md:`.

- [ ] **Step 2: Layout tablet `md:grid md:grid-cols-2 md:gap-6`**

Columna izquierda: lista/KPIs. Derecha: formulario o diálogo persistente.

- [ ] **Step 3: Diálogo crear/editar**

En móvil: `Dialog` full-screen (`className="max-md:h-[100dvh] max-md:max-w-none"`). En tablet: panel lateral.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: formulario táctil y layout tablet en Minutas"
```

---

### Task 12: FilterHeader compartido — modo móvil

**Files:**
- Modify: `src/components/resumen/FilterHeader.tsx`

**Interfaces:**
- Consumido por Resumen, Cobranzas, Alertas, Mercadeo y otros — un solo cambio beneficia muchos módulos.

- [ ] **Step 1: Detectar `useBreakpoint()`**

En móvil: mostrar resumen compacto (año + meses seleccionados) + botón "Filtros".

- [ ] **Step 2: Sheet de filtros**

Mover selectores de sucursal/unidad/mes al sheet; botón "Aplicar" llama `onApplyFilters` existente.

- [ ] **Step 3: Regresión desktop** — layout inline sin cambios en `lg:`.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: FilterHeader colapsable en móvil"
```

---

### Task 13: Tests E2E móvil + documentación final

**Files:**
- Create: `e2e/mobile-shell.spec.ts`
- Create: `e2e/pwa-manifest.spec.ts` (opcional)
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-08-02-pwa-mobile-design.md` (estado)
- Modify: `docs/RUNBOOK.md` (push cron)

**Interfaces:**
- Produces: cobertura Playwright viewports móvil; docs operativas.

- [ ] **Step 1: Playwright viewports**

```ts
// e2e/mobile-shell.spec.ts
test.use({ viewport: { width: 390, height: 844 } });
test("bottom nav visible para gerencia", async ({ page }) => { ... });
test("resumen muestra grid 2 columnas de KPIs", async ({ page }) => { ... });
```

- [ ] **Step 2: Documentar en CLAUDE.md**

Sección "PWA y móvil":
- Paquete next-pwa, HTTPS, variables VAPID
- `MOBILE_TAB_SLOTS` en `src/lib/mobile-nav.ts`
- Cron `scripts/send-push-alerts.ts`

- [ ] **Step 3: Marcar spec implementada**

`**Estado:** Implementado — ver docs/superpowers/plans/2026-08-02-pwa-mobile.md`

- [ ] **Step 4: Suite completa**

```bash
bun run test
bun run test:e2e -- e2e/mobile-shell.spec.ts
bunx tsc --noEmit
bun run build
```

- [ ] **Step 5: Lighthouse PWA** en build de producción (manual, ≥ 90).

- [ ] **Step 6: Commit**

```bash
git commit -m "docs: PWA móvil, push y QA con Playwright"
```

---

## Notas de decisiones (para el revisor)

- **PWA vs nativo:** se elige PWA porque el 100% de la lógica de negocio ya vive en Server Actions + RLS; duplicar en Capacitor no aporta en v1.
- **Bottom nav de 5 slots:** obliga a priorizar; la lista vive en `mobile-nav.ts` para cambiar sin refactor masivo. Validar con usuarios si Cobranzas desplaza a Minutas.
- **Tablet:** el sidebar ya tiene variables CSS para colapsado; el trabajo es mayormente `grid-cols-*`, no un segundo shell.
- **Offline:** v1 solo cachea assets estáticos (next-pwa). Cachear datos de negocio offline implicaría IndexedDB + conflictos de sync — fuera de alcance.
- **Push y PII:** el payload del push es genérico; nunca incluir nombres de cliente ni montos en la notificación del sistema.
- **iOS:** Web Push en PWA instalada funciona desde iOS 16.4 con limitaciones; documentar en RUNBOOK que Safari debe "Add to Home Screen" primero.
- **Mercadeo en móvil:** solo `gerencia`; aparece en sheet "Más", no en bottom nav (prioridad campo/consulta operativa).

## Dependencias entre tareas

```
Task 1 → Task 2 (SW)
Task 3 (shell) independiente de push pero conviene antes de Tasks 8-11
Task 4 → Task 5 → Task 6 (push pipeline)
Task 7 → Task 9 (ResponsiveDataList antes de Cobranzas)
Task 12 puede paralelizarse con 8-11 tras Task 3
Task 13 al final
```

## Estimación orientativa

| Fase | Tasks | Esfuerzo |
|------|-------|----------|
| PWA core | 1–2 | 1–2 días |
| Shell móvil | 3 | 1 día |
| Web Push | 4–6 | 2–3 días |
| UI módulos piloto | 7–12 | 3–5 días |
| QA + docs | 13 | 1 día |

**Total:** ~8–12 días de desarrollo incremental, desplegable por fases (PWA instalable puede salir antes que push).
