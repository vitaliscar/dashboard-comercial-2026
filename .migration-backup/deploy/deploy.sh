#!/usr/bin/env bash
# Script de actualización — correr EN EL VPS, dentro de la carpeta del
# proyecto ya clonado (no en la máquina de desarrollo).
#
# Uso: ./deploy/deploy.sh
#
# Qué hace: pull del código, instala dependencias, corre migraciones
# pendientes, compila y reinicia el servicio. NO toca datos ni hace `load-excel`
# (eso es un paso manual/aparte, vía el módulo "Cargar Excel" de la app o el
# cron semanal — ver weekly-excel-load.yml).

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

echo "→ Directorio: $PROJECT_DIR"

if [ ! -f ".env.local" ]; then
  echo "❌ Falta .env.local — copiar deploy/.env.production.example y completar antes de desplegar."
  exit 1
fi

echo "→ git pull"
git pull --ff-only

echo "→ Instalando dependencias"
bun install --frozen-lockfile

echo "→ Verificando Postgres (docker compose)"
docker compose -f deploy/docker-compose.prod.yml up -d
docker compose -f deploy/docker-compose.prod.yml exec -T postgres pg_isready -U "${POSTGRES_USER:-app_root}" -d "${POSTGRES_DB:-dashboard_comercial}"

echo "→ Build de producción"
bun run build

echo "→ Reiniciando servicio"
if command -v systemctl >/dev/null 2>&1 && systemctl is-enabled dashboard-comercial >/dev/null 2>&1; then
  sudo systemctl restart dashboard-comercial
  sleep 2
  systemctl status dashboard-comercial --no-pager -l | head -20
else
  echo "⚠️  Servicio systemd 'dashboard-comercial' no encontrado — reiniciar manualmente"
  echo "   (pm2 restart dashboard-comercial, o el proceso equivalente)."
fi

echo "→ Health check"
sleep 3
curl -fsS http://127.0.0.1:3000/api/health || {
  echo "❌ Health check falló — revisar logs (journalctl -u dashboard-comercial -n 100)"
  exit 1
}

echo "✅ Deploy completado"
