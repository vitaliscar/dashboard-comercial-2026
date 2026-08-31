# Manual de Despliegue & Plan de Rollback

**Proyecto**: `dashboard-comercial-2026`

Este documento detalla el procedimiento de despliegue en servidor VPS autohospedado y las instrucciones paso a paso para ejecutar un **Rollback de Emergencia**.

---

## 1. Arquitectura de Despliegue

- **Entorno**: VPS Linux (Docker / PM2 + Nginx Reverse Proxy + PostgreSQL + Drizzle ORM).
- **Puerto de Aplicación**: `3000` (interno) / `443` (HTTPS externo).

---

## 2. Procedimiento de Despliegue Estándar (Zero-Downtime)

```bash
# 1. Obtener última versión de producción
git checkout main
git pull origin main

# 2. Instalar dependencias exactas
npm ci --production=false

# 3. Ejecutar migraciones de base de datos
npx drizzle-kit push

# 4. Construir bundle de producción
npm run build

# 5. Reiniciar servicio en caliente (PM2)
pm2 reload dashboard-comercial-2026 --update-env

# 6. Validar estado post-despliegue con smoke test
npm run test:smoke
```

---

## 3. Plan de Rollback de Emergencia (Task 4d)

Si la aplicación presenta errores 5xx sostenidos o falla el smoke test tras el despliegue:

### Paso 1: Revertir Código a Release Anterior

```bash
# Identificar commit estable anterior
git log -n 5 --oneline

# Hacer checkout del commit previo estable
git checkout <COMMIT_SHA_ESTABLE>

# Reconstruir bundle
npm run build
pm2 reload dashboard-comercial-2026
```

### Paso 2: Revertir Migración de Base de Datos (Si aplica)

```bash
# Restaurar copia de respaldo de PostgreSQL previa al deploy
pg_restore -h localhost -U postgres -d dashboard_db /backups/db_pre_deploy_latest.dump
```

### Paso 3: Notificación de Incidencia

Enviar reporte inmediato al equipo técnico indicando la hora del rollback y los logs capturados.
