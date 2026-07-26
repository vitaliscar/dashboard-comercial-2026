# Checklist Oficial de Lanzamiento a Producción (Go-Live)

**Proyecto**: `dashboard-comercial-2026`

Lista de verificación obligatoria previa y posterior al lanzamiento.

---

## 1. Fase Pre-Lanzamiento (Pre-Deploy)

- [x] **Pruebas Unitarias**: 132/132 pasadas (`npm run test`).
- [x] **Pruebas E2E**: Suite Playwright creada en `/e2e` para Auth, Roles, Filtros, KPIs y Navegación.
- [x] **Prueba de Carga**: Script de simulación para 100 usuarios concurrentes (`npm run test:load`).
- [x] **CI/CD Pipeline**: GitHub Actions configurado en `.github/workflows/ci.yml`.
- [x] **Logging Centralizado**: Módulo Pino con formato estructurado JSON (`src/lib/logger.ts`).
- [x] **Monitoreo & Métricas**: Módulo de métricas (`src/lib/metrics.ts`) en formato Prometheus.
- [x] **Alertas Automáticas**: Servicio de alertas configurado para Slack / Email (`src/lib/alerts.ts`).
- [x] **Runbook de Operaciones**: Documentado en `docs/RUNBOOK.md`.
- [x] **GDPR & Cumplimiento**: Documentado en `GDPR-COMPLIANCE.md` con helper `src/lib/compliance/gdpr.ts`.
- [x] **Documentos Legales**: Privacidad, Términos & Condiciones y Cookies en `docs/legal/`.
- [x] **Banner de Consentimiento**: Componente React `CookieConsentBanner` en `src/components/cookie-consent.tsx`.
- [x] **Auditoría de Seguridad**: Documentada en `SECURITY-AUDIT.md`.
- [x] **Headers de Seguridad**: Inyectados en `next.config.ts`.
- [x] **Accesibilidad WCAG 2.1 AA**: Documentada en `docs/ACCESSIBILITY.md`.

---

## 2. Fase de Lanzamiento (Deploy Execution)

1. [ ] Ejecutar backup completo de base de datos PostgreSQL.
2. [ ] Ejecutar `npm run test:smoke` en staging.
3. [ ] Aplicar variables de entorno en producción (`SLACK_WEBHOOK_URL`, `DATABASE_URL`, `ALERT_EMAIL_RECIPIENT`).
4. [ ] Ejecutar build de producción `npm run build`.
5. [ ] Iniciar servidor con `pm2 start npm --name "dashboard-comercial-2026" -- start`.

---

## 3. Fase Post-Lanzamiento (Post-Deploy Monitoring)

1. [ ] Monitorear tasa de error 5xx durante las primeras 24 horas.
2. [ ] Validar recepción de heartbeat y alertas de prueba en Slack.
3. [ ] Mantener equipo técnico en guardia (on-call) durante las primeras 48 horas.
