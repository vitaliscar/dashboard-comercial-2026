# CHECKLIST DE SEGURIDAD PARA PRODUCCIÓN

## Dashboard Comercial 2026

---

## 1. Verificación de Controles de Seguridad

| Control | Estado | Implementación / Evidencia |
| :--- | :---: | :--- |
| **HTTPS + SSL Certificado Válido** | ✅ PASADO | Configurado en VPS Nginx/Caddy Reverse Proxy con Let's Encrypt TLS 1.3. |
| **Cabeceras CORS** | ✅ PASADO | Configurado en `next.config.ts` limitando orígenes permitidos. |
| **Rate Limiting (Control de Tasa)** | ✅ PASADO | Modulo `src/lib/rate-limit.ts` activo en Server Actions y API endpoints. |
| **Validación de Entradas (Input Validation)** | ✅ PASADO | Esquemas rigurosos Zod (`zod`) en Server Actions y formularios UI. |
| **Prevención de Inyección SQL** | ✅ PASADO | Consultas parametrizadas al 100% mediante Drizzle ORM (`drizzle-orm`). |
| **Prevención de XSS** | ✅ PASADO | Escapado automático en React 19 + utilidad `src/lib/sanitize.ts`. |
| **Protección CSRF** | ✅ PASADO | Manejado nativamente por las cabeceras de Server Actions de Next.js y cookies SameSite=Lax. |
| **Hashing de Contraseñas** | ✅ PASADO | Algoritmo resistente a GPU/ASIC **Argon2id** (`@node-rs/argon2`). |
| **Aislamiento de Roles (RBAC)** | ✅ PASADO | Ayudante `scoped query` y utilidades de sesión en `src/lib/data-scope.ts`. |

---

## 2. Cabeceras de Seguridad HTTP Requeridas

Las siguientes cabeceras se encuentran habilitadas en la configuración de la aplicación (`next.config.ts`):

```http
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```
