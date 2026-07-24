# RUNBOOK DE OPERACIONES Y RESPUESTA A INCIDENTES

## Dashboard Comercial 2026

Este documento contiene los procedimientos operativos estándar (SOP) y guías paso a paso para resolver alertas emitidas por el sistema de observabilidad.

---

## 1. Contactos de Emergencia & Canales
* **Canal de Alertas:** Slack `#alertas-dashboard-prod`
* **On-Call Engineer:** `devops@midominio.com`
* **Health Check Endpoint:** `https://midominio.com/api/health`
* **Prometheus Metrics:** `https://midominio.com/api/metrics`

---

## 2. Matriz de Alertas e Incidentes

### 🚨 ALERTA 1: Tasa Elevada de Errores 500 (>5 errores/min)
* **Gravedad:** CRÍTICA
* **Causa Posible:** Fallo en base de datos PostgreSQL, excepción no capturada en Server Action, error de renderizado en servidor.
* **Procedimiento de Diagnóstico:**
  1. Revisar los logs estructurados JSON en `/var/log/dashboard-app.log` o mediante Pino CLI:
     ```bash
     tail -n 100 /var/log/dashboard-app.log | npx pino-pretty
     ```
  2. Verificar el endpoint `/api/health` para descartar caída del pool de base de datos.
* **Plan de Acción:**
  * Si la BD no responde: Reiniciar contenedor PostgreSQL o verificar espacio en disco (`df -h`).
  * Si es error de código/despliegue reciente: Ejecutar Rollback a la versión anterior inmediatamente (ver `docs/DEPLOYMENT.md`).
  * Reiniciar servicio de la aplicación:
    ```bash
    docker-compose restart app
    # o si usa systemd/pm2:
    pm2 restart dashboard-comercial
    ```

---

### ⚠️ ALERTA 2: Latencia Elevada p95 > 5s
* **Gravedad:** ADVERTENCIA / ALTA
* **Causa Posible:** Consultas SQL pesadas sin índice, carga masiva de datos en memoria, bloqueo de event loop.
* **Procedimiento de Diagnóstico:**
  1. Identificar la ruta lenta revisando los logs de `[SLOW REQUEST >5s]`.
  2. Correr `EXPLAIN ANALYZE` en las consultas Drizzle/Postgres correspondientes a esa ruta.
* **Plan de Acción:**
  * Agregar índices faltantes en la base de datos PostgreSQL.
  * Habilitar/Ajustar cache en la capa de datos.
  * Si el servidor VPS está sobrecargado, escalar recursos de CPU/RAM.

---

### 🚨 ALERTA 3: Uso de CPU > 80%
* **Gravedad:** CRÍTICA
* **Causa Posible:** Bucle infinito, consumo excesivo en parseo/cálculos analíticos masivos.
* **Procedimiento de Diagnóstico:**
  1. Inspeccionar procesos top en el servidor: `top` o `htop`.
  2. Verificar si hay tareas en segundo plano ejecutan simulaciones o parseos masivos de Excel.
* **Plan de Acción:**
  * Reiniciar el proceso saturado: `pm2 restart dashboard-comercial`.
  * Ajustar el límite de concurrencia en tareas pesadas.

---

### 🚨 ALERTA 4: Saturación del Pool de Conexiones DB (>85%)
* **Gravedad:** CRÍTICA
* **Causa Posible:** Conexiones PostgreSQL huérfanas, fugas de conexión, incremento de usuarios concurrentes.
* **Procedimiento de Diagnóstico:**
  1. Ejecutar consulta en PostgreSQL para contar conexiones activas:
     ```sql
     SELECT count(*), state FROM pg_stat_activity GROUP BY state;
     ```
* **Plan de Acción:**
  * Finalizar conexiones inactivas en idle:
     ```sql
     SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND state_change < now() - interval '5 minutes';
     ```
  * Aumentar `max_connections` en `postgresql.conf` o configurar PgBouncer.
