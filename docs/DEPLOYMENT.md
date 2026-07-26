# PLAN DE DESPLIEGUE Y PROCEDIMIENTO DE ROLLBACK (DEPLOYMENT & ROLLBACK PLAN)

## Dashboard Comercial 2026

---

## 1. Requisitos Pre-Despliegue

1. Confirmar que la suite de pruebas pase al 100%: `bun test` y `npx playwright test`.
2. Verificar que la base de datos PostgreSQL tenga backups recientes.
3. Asegurar variables de entorno en el servidor VPS en `.env.production`.

---

## 2. Pasos de Despliegue en Producción

```bash
# 1. Conectarse al servidor VPS
ssh deploy@vps.midominio.com

# 2. Hacer pull del código validado
cd /var/www/dashboard-comercial-2026
git pull origin main

# 3. Construir la aplicación Next.js
bun install --frozen-lockfile
bun run build

# 4. Ejecutar migraciones Drizzle ORM si aplican
npx drizzle-kit migrate

# 5. Reiniciar servicio de aplicación en cero-downtime
pm2 reload dashboard-comercial
```

---

## 3. Plan de Rollback (En caso de fallo en producción)

Si tras el despliegue se detectan alertas críticas o errores 500 sostenidos:

### Paso 1: Revertir versión del código

```bash
# Revertir al commit anterior estable
git log -n 5 --oneline
git reset --hard <COMMIT_SHA_ANTERIOR>
bun run build
pm2 reload dashboard-comercial
```

### Paso 2: Restaurar base de datos (Si hubo migración destructiva)

```bash
# Restaurar backup de PostgreSQL
pg_restore -U postgres -d dashboard_db /var/backups/db_backup_pre_deploy.dump
```

### Paso 3: Notificación de Rollback

Informar en el canal de Slack `#alertas-dashboard-prod` sobre la ejecución del rollback y la causa raíz.
