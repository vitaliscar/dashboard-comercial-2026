# PWA + Mobile — Diseño

**Fecha:** 2026-08-02  
**Estado:** Pendiente — ver `docs/superpowers/plans/2026-08-02-pwa-mobile.md`

## 1. Contexto y objetivo

El dashboard ya cubre consulta (gerencia) e interacción de campo (minutas, cliente 360, cotizaciones) con **un solo backend**: Server Actions, RLS nativo, `withAuth`. No hace falta una app nativa ni duplicar lógica.

El objetivo es convertir la misma app Next.js en una **PWA instalable** (ícono en home screen, `display: standalone`) con **notificaciones push** para alertas de negocio, y adaptar la UI a **teléfono y tablet** sin reescribir módulos.

### Por qué PWA y no app store

| Criterio      | PWA sobre Next.js actual                                 |
| ------------- | -------------------------------------------------------- |
| Instalación   | Add to Home Screen, sin tiendas                          |
| Backend       | Mismas Server Actions y RLS                              |
| Mantenimiento | Un solo código, un deploy                                |
| Push          | Web Push API + VAPID (suficiente para alertas)           |
| Campo         | Minutas, alertas, cobranzas en móvil con la misma sesión |

### Fuera de alcance v1

- Sincronización offline completa (lectura/escritura sin red).
- App nativa (Capacitor/React Native).
- Push en iOS antes de verificar soporte PWA instalada (iOS 16.4+ con limitaciones).
- Rediseño de los 20+ módulos del sidebar — solo los **4 pilares del mockup** + primitives compartidos.
- Reemplazar el sidebar desktop — sigue siendo la navegación principal en `lg:`.

### Referencia visual

Mockup navegable (paleta Terminal Ámbar, teléfono + tablet lado a lado):  
[Artifact Claude — PWA mobile layouts](https://claude.ai/code/artifact/919384b1-f804-4b24-9c47-9bf6f7d5bc35)

Módulos prototipados: **Resumen**, **Cobranzas**, **Alertas**, **Minutas**.

## 2. Breakpoints y reglas de adaptación

Reutilizar `src/hooks/use-mobile.ts` (`MOBILE_BREAKPOINT = 768`) y extender con tablet:

| Rango            | Token     | Navegación                                                             | Layout                                  |
| ---------------- | --------- | ---------------------------------------------------------------------- | --------------------------------------- |
| `< 768px`        | `mobile`  | Barra inferior fija (5 slots) + sheet "Más"                            | Adaptación completa                     |
| `768px – 1023px` | `tablet`  | Sidebar colapsable (`--sidebar-collapsed-width: 56px` en `styles.css`) | Grillas más densas; tablas donde quepan |
| `≥ 1024px`       | `desktop` | Sidebar expandido (comportamiento actual)                              | Sin cambios                             |

### Cuatro reglas de adaptación (teléfono)

1. **KPIs:** rejillas de 4–5 columnas → **2 columnas** (`grid-cols-2`).
2. **Gráficos:** apilar verticalmente; altura mínima ~240px; `ResponsiveContainer` al 100% del contenedor padre.
3. **Tablas anchas:** vista **tarjeta-fila** con franja de severidad/estado; en `md:` volver a `<Table>`.
4. **Captura en campo:** targets táctiles **≥ 44px** (`min-h-11`, `py-3`, inputs `text-base` para evitar zoom en iOS).

La tablet casi no necesita componentes nuevos: ajustar `sm:`/`md:`/`lg:` en grillas existentes.

## 3. Navegación móvil — decisión pendiente de producto

El sidebar actual tiene **20+ destinos**. En teléfono solo caben **5** en la barra inferior.

### Propuesta v1 (configurable en código)

| Slot    | Destino                                                     | Ruta / acción       |
| ------- | ----------------------------------------------------------- | ------------------- |
| Resumen | KPIs globales                                               | `/resumen`          |
| Módulos | Sheet con unidades de negocio visibles por rol              | `UNIT_NAV` filtrado |
| Alertas | Centro de alertas                                           | `/alertas`          |
| Minutas | Captura en campo                                            | `/minutas`          |
| Más     | Sheet con el resto del nav (mismo filtro `canAccessModule`) | drawer              |

**Decisión a validar con usuarios:** si Cobranzas se consulta más que Minutas en campo, intercambiar el slot 4. La implementación debe centralizar los 5 ítems en `src/lib/mobile-nav.ts` para cambiar sin tocar cada página.

En tablet/desktop la barra inferior **no se muestra** (`lg:hidden`).

## 4. PWA — manifest e instalabilidad

### Paquete

`@ducanh2912/next-pwa` (fork mantenido para App Router; `next-pwa` original está abandonado).

### Manifest (vía `metadata` + archivos estáticos)

- `name`: "CCV Dashboard Comercial"
- `short_name`: "CCV"
- `display`: `standalone`
- `background_color` / `theme_color`: tokens de `styles.css` (sidebar `#111`, primary ámbar)
- `start_url`: `/resumen` (o `/dashboard` — redirige por rol)
- `icons`: 192×192, 512×512, maskable (generar desde `public/Logo_CCV.png`)

### Service Worker

- Precache de shell estático (JS/CSS/fonts ya self-hosted vía `@fontsource`).
- **No** precachear respuestas de Server Actions (datos sensibles y stale).
- Estrategia de red para navegación: `NetworkFirst` en rutas `(app)`.

### Requisitos de entorno

- **HTTPS obligatorio** en producción (ya previsto con nginx/Caddy en `deploy/`).
- Actualizar CSP en `next.config.ts`: `worker-src 'self'`.

## 5. Web Push

### Modelo de datos

Tabla `push_subscriptions`:

| Columna      | Tipo              | Notas                              |
| ------------ | ----------------- | ---------------------------------- |
| `id`         | uuid PK           |                                    |
| `user_id`    | uuid FK → `users` | Una fila por dispositivo/navegador |
| `endpoint`   | text UNIQUE       | URL del push service               |
| `p256dh`     | text              | Clave del cliente                  |
| `auth`       | text              | Secreto del cliente                |
| `user_agent` | text nullable     | Debug                              |
| `created_at` | timestamptz       |                                    |

RLS: el usuario solo ve/inserta/borra **sus** suscripciones (`user_id = current_app_user_id()`).

### Flujo

1. Usuario autenticado → banner "Activar notificaciones" (solo si `Notification.permission === 'default'`).
2. `subscribePushAction` registra suscripción vía Push API + persiste en DB.
3. Job programado (cron en VPS o GitHub Actions) ejecuta `evaluateAndSendPushAlerts()`:
   - Reutiliza la lógica de severidad de `/alertas` (cobranzas vencidas, cumplimiento bajo, minutas vencidas, etc.).
   - Envía solo alertas **severidad alta** (máx. 1 push por usuario por tipo por día — dedup en `push_delivery_log`).
4. Click en notificación → `notificationclick` abre `/alertas` (o deep link por tipo).

### Variables de entorno

```env
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:alertas@ccv.com.ve
```

Generación: `npx web-push generate-vapid-keys`

### Seguridad

- Suscripciones atadas a `user_id` de sesión activa.
- Al logout: `unsubscribePushAction` + borrar filas del usuario en ese endpoint.
- El endpoint de envío masivo **no** es público — solo cron interno con secret o ejecución CLI en el VPS.

## 6. Módulos prioritarios (fase UI)

### Resumen (`/resumen`)

- KPIs: `grid-cols-2` en móvil, `md:grid-cols-3`, `xl:grid-cols-5` (ya parcialmente así).
- Gráficos de unidades: apilar (`grid-cols-1`).

### Cobranzas (`/cobranzas`) — caso difícil

- Tabla principal 6 columnas → componente `CobranzaMobileCard` con franja de severidad por días vencidos.
- `md:` mantiene `<Table>` actual.

### Alertas (`/alertas`) — ya casi listo

- Lista con borde/ícono por severidad; pulir espaciado y targets táctiles.

### Minutas (`/minutas`) — captura en campo

- Formulario: inputs `min-h-11`, botones full-width en móvil.
- Tablet: layout master-detail (lista | formulario) con `md:grid-cols-2`.

## 7. Componentes compartidos nuevos

| Componente             | Ubicación                                        | Uso                               |
| ---------------------- | ------------------------------------------------ | --------------------------------- |
| `useBreakpoint()`      | `src/hooks/use-breakpoint.ts`                    | `mobile` \| `tablet` \| `desktop` |
| `MobileBottomNav`      | `src/components/mobile/MobileBottomNav.tsx`      | 5 slots, `lg:hidden`              |
| `MoreNavSheet`         | `src/components/mobile/MoreNavSheet.tsx`         | Resto del menú                    |
| `ResponsiveDataList`   | `src/components/mobile/ResponsiveDataList.tsx`   | Tabla desktop / cards móvil       |
| `InstallPrompt`        | `src/components/mobile/InstallPrompt.tsx`        | `beforeinstallprompt`             |
| `PushPermissionBanner` | `src/components/mobile/PushPermissionBanner.tsx` | Opt-in push                       |

## 8. Verificación y QA

- Lighthouse PWA audit ≥ 90 en producción (HTTPS).
- Playwright con viewports `390×844` (iPhone) y `768×1024` (iPad).
- Probar instalación en Android Chrome y Safari iOS (add to home screen).
- Roles: `gerencia`, `gerente_comercial`, `asesor` — barra inferior respeta `canAccessModule`.
- Regresión desktop: sidebar y layouts `lg:` sin cambios visibles.

## 9. Orden de entrega sugerido

1. Infra PWA (instalable, sin push).
2. Shell móvil (bottom nav + breakpoints).
3. Web Push (tabla + subscribe + cron).
4. Módulos piloto (Resumen → Alertas → Cobranzas → Minutas).
5. Primitives + documentación.
