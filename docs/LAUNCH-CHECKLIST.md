# CHECKLIST DE LANZAMIENTO A PRODUCCIÓN (LAUNCH CHECKLIST)

## Dashboard Comercial 2026

---

## 1. Fase Pre-Lanzamiento (Pre-Deploy)
- [x] **Pruebas Unitarias y E2E:** 100% pasadas en CI/CD (`bun test` + Playwright).
- [x] **Pruebas de Carga:** Simulación de 100 usuarios concurrentes validada sin fallos.
- [x] **Observabilidad Configurada:** Logger Pino, salud `/api/health`, métricas `/api/metrics` activos.
- [x] **Alertas de Emergencia:** Reglas de Slack/Email definidas en `src/lib/alerts.ts`.
- [x] **Auditoría de Seguridad & GDPR:** Documentación legal, GDPR y checklist completados.
- [x] **Optimizaciones Web Vitals:** Score Lighthouse ≥85, LCP <2.5s, CLS <0.1.

---

## 2. Fase Durante el Lanzamiento (Go-Live)
- [ ] Ejecutar backup preventivo de base de datos PostgreSQL.
- [ ] Ejecutar `git pull origin main` en servidor VPS.
- [ ] Ejecutar `bun run build` y verificar compilar exitosa sin advertencias.
- [ ] Reiniciar proceso con PM2 / Docker en modo reload sin caída de servicio.
- [ ] Correr script de verificación rápida: `bun run scripts/smoke-test.ts`.

---

## 3. Fase Post-Lanzamiento (Post-Deploy 24/7)
- [ ] Monitorear la tasa de errores en `/api/health` durante las primeras 24 horas.
- [ ] Mantener equipo On-Call atento a notificaciones en el canal de alertas.
- [ ] Recopilar feedback inicial de los gerentes y coordinadores.
