# Despliegue en producción — Dashboard Comercial 2026

Manual para la persona de sistemas que va a poner esta aplicación en el VPS.
No requiere conocer el código — solo seguir los pasos en orden.

## Qué es esta aplicación

Next.js 16 (App Router) + PostgreSQL 18 en Docker. No usa Supabase ni ningún
servicio externo de base de datos — todo corre en el mismo servidor.

- **App**: Next.js, se sirve con `bun run start` en el puerto 3000 (interno).
- **Base de datos**: Postgres 18 dentro de un contenedor Docker.
- **Reverse proxy**: Nginx (o Caddy) al frente, con TLS — expone el puerto 443
  al público y reenvía al puerto 3000 interno.

## 1. Requisitos previos en el servidor

- Ubuntu/Debian (o similar) con acceso root/sudo.
- [Docker](https://docs.docker.com/engine/install/) + Docker Compose plugin.
- [Bun](https://bun.sh) instalado (`curl -fsSL https://bun.sh/install | bash`).
- Git.
- Nginx (o Caddy) instalado, con un dominio ya apuntando al servidor (DNS A record).
- Puerto 443 (y 80 para el challenge de Let's Encrypt) abiertos en el firewall.

## 2. Clonar el proyecto

**Clonar desde el repo de PRODUCCIÓN, no el de desarrollo.** Son dos repos
distintos a propósito — el VPS nunca debe apuntar al repo de desarrollo:

- Desarrollo (NO usar en el VPS): `github.com/vitaliscar/dashboard-comercial-2026`
- **Producción (usar este)**: `github.com/jesusapn/dashboard-comercial-2026` (privado)

```bash
sudo mkdir -p /opt/dashboard-comercial-2026
sudo chown $USER:$USER /opt/dashboard-comercial-2026
cd /opt/dashboard-comercial-2026
git clone https://github.com/jesusapn/dashboard-comercial-2026.git .
```

El repo de producción es privado — clonarlo por HTTPS requiere un Personal
Access Token de una cuenta con acceso (`git clone
https://<usuario>:<token>@github.com/jesusapn/dashboard-comercial-2026.git .`),
o configurar una clave SSH con acceso de lectura si se prefiere ese método.

## 3. Configurar variables de entorno

```bash
cp deploy/.env.production.example .env.local
```

Editar `.env.local` y completar:

- `POSTGRES_PASSWORD`: generar una contraseña fuerte (`openssl rand -base64 32`).
- `APP_ADMIN_PASSWORD` / `APP_USER_PASSWORD`: dos contraseñas fuertes,
  distintas entre sí y distintas de `POSTGRES_PASSWORD` (paso 4 las usa).
- `DATABASE_URL` / `DATABASE_ADMIN_URL`: deben usar las **mismas**
  contraseñas que pusiste en `APP_USER_PASSWORD` / `APP_ADMIN_PASSWORD`.

**Nunca** commitear `.env.local` al repo (ya está en `.gitignore`).

## 4. Roles de Postgres (`app_admin` / `app_user`)

El script `docker/postgres-init/00-roles.sh` crea los dos roles de aplicación
al arrancar el contenedor **por primera vez** (el volumen de Postgres se crea
una sola vez), leyendo las contraseñas de las variables de entorno
`APP_ADMIN_PASSWORD` / `APP_USER_PASSWORD` que definiste en el paso 3. No hay
ningún archivo que editar a mano — basta con que esas dos variables estén en
`.env.local` **antes** de levantar el contenedor (paso 5).

> ⚠️ Si el contenedor de Postgres ya arrancó antes de fijar esas variables,
> el volumen ya existe y el script **no** se re-ejecuta solo. En ese caso
> cambiar las contraseñas manualmente con `ALTER ROLE app_admin WITH
> PASSWORD '...'` dentro del contenedor, o borrar el volumen (`docker compose
> down -v`) si todavía no hay datos reales que perder.

## 5. Levantar Postgres

```bash
docker compose -f deploy/docker-compose.prod.yml up -d
docker compose -f deploy/docker-compose.prod.yml ps
```

Verificar que el healthcheck diga `healthy` antes de seguir.

## 6. Aplicar las migraciones (primera vez — base de datos nueva)

Correr en este orden exacto (verificado contra el journal de Drizzle y las
fechas de commit — es más completo que el bloque de `CLAUDE.md`, que no
incluye las últimas 10 migraciones):

```bash
CONTAINER=dashboard-comercial-postgres
docker exec -i $CONTAINER psql -U app_admin -d dashboard_comercial < src/db/migrations/0000_huge_sharon_carter.sql
docker exec -i $CONTAINER psql -U app_admin -d dashboard_comercial < src/db/migrations/0001_far_the_stranger.sql
docker exec -i $CONTAINER psql -U app_admin -d dashboard_comercial < src/db/migrations-manual/0001_rls_policies.sql
docker exec -i $CONTAINER psql -U app_admin -d dashboard_comercial < src/db/migrations-manual/0002_minutas_delete_policy.sql
docker exec -i $CONTAINER psql -U app_admin -d dashboard_comercial < src/db/migrations-manual/0003_schema_drift_fix.sql
docker exec -i $CONTAINER psql -U app_admin -d dashboard_comercial < src/db/migrations/0002_absent_kabuki.sql
docker exec -i $CONTAINER psql -U app_admin -d dashboard_comercial < src/db/migrations-manual/0004_ventas_casa_rls.sql
docker exec -i $CONTAINER psql -U app_admin -d dashboard_comercial < src/db/migrations/0003_useful_wind_dancer.sql
docker exec -i $CONTAINER psql -U app_admin -d dashboard_comercial < src/db/migrations-manual/0005_cobranzas_snapshots_rls.sql
docker exec -i $CONTAINER psql -U app_admin -d dashboard_comercial < src/db/migrations-manual/0006_usuarios_crud_rls.sql
docker exec -i $CONTAINER psql -U app_admin -d dashboard_comercial < src/db/migrations/0004_lame_maestro.sql
docker exec -i $CONTAINER psql -U app_admin -d dashboard_comercial < src/db/migrations/0005_lean_sally_floyd.sql
docker exec -i $CONTAINER psql -U app_admin -d dashboard_comercial < src/db/migrations/0006_cool_mathemanic.sql
docker exec -i $CONTAINER psql -U app_admin -d dashboard_comercial < src/db/migrations/0007_oval_killer_shrike.sql
docker exec -i $CONTAINER psql -U app_admin -d dashboard_comercial < src/db/migrations-manual/0007_mercadeo_rls.sql
docker exec -i $CONTAINER psql -U app_admin -d dashboard_comercial < src/db/migrations-manual/0008_minutas_alertas.sql
docker exec -i $CONTAINER psql -U app_admin -d dashboard_comercial < src/db/migrations-manual/0009_profile_sucursales.sql
docker exec -i $CONTAINER psql -U app_admin -d dashboard_comercial < src/db/migrations-manual/0010_role_module_access.sql
docker exec -i $CONTAINER psql -U app_admin -d dashboard_comercial < src/db/migrations-manual/0011_fix_update_minutas_destinatario.sql
docker exec -i $CONTAINER psql -U app_admin -d dashboard_comercial < src/db/migrations-manual/0012_comisiones_reglas_rls.sql
docker exec -i $CONTAINER psql -U app_admin -d dashboard_comercial < src/db/migrations-manual/0013_profiles_fuerza_venta_select.sql
```

> ⚠️ **Bloqueante:** al momento de escribir esto, las 6 migraciones
> `migrations-manual/0008` a `0013` existen solo en el disco de desarrollo —
> **no están commiteadas al repo**. Si el VPS clona el repo tal cual está
> hoy, esos 6 archivos no van a existir. Confirmar con el equipo de
> desarrollo que ya fueron commiteados y pusheados antes de clonar en el VPS
> (`git log --oneline -- src/db/migrations-manual/0013_profiles_fuerza_venta_select.sql`
> debe devolver un commit real, no vacío).
>
> Si al momento de desplegar hay migraciones más nuevas que estas 21, revisar
> `src/db/migrations/` y `src/db/migrations-manual/` por fecha y aplicar las
> que falten al final, en orden cronológico. En caso de duda, preguntar antes
> de aplicar nada contra una base de datos con datos reales.

## 7. Instalar dependencias y compilar

```bash
bun install --frozen-lockfile
bun run build
```

## 8. Cargar los datos iniciales desde Excel

Copiar el archivo `CCV Rendimiento.xlsx` a la raíz del proyecto en el
servidor, luego:

```bash
bun run load-excel
```

Esto siembra usuarios, catálogos, cotizaciones, facturas, presupuestos,
cobranzas, servicios, equipos y todo lo demás. Revisar la salida del comando:
si aparece un bloque `⚠️ Valores de 'Unidad de Negocio' no reconocidos`, avisar
al equipo de desarrollo — significa que el Excel trae una categoría nueva que
el sistema no sabe clasificar todavía.

## 9. Configurar el servicio (systemd)

```bash
sudo cp deploy/dashboard-comercial.service.example /etc/systemd/system/dashboard-comercial.service
```

Editar `/etc/systemd/system/dashboard-comercial.service` y ajustar:

- `User=`: el usuario del sistema que va a correr el proceso (no root).
- `WorkingDirectory=` y `EnvironmentFile=`: la ruta real del proyecto.
- `ExecStart=`: la ruta real del binario de `bun` (`which bun`).

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now dashboard-comercial
sudo systemctl status dashboard-comercial
```

## 10. Configurar Nginx + TLS

```bash
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/dashboard-comercial
sudo ln -s /etc/nginx/sites-available/dashboard-comercial /etc/nginx/sites-enabled/
```

Editar el archivo copiado y reemplazar `dashboard.ccvenequip.com` por el
dominio real. Luego generar el certificado TLS (si se usa Let's Encrypt):

```bash
sudo certbot --nginx -d dashboard.ccvenequip.com
sudo nginx -t && sudo systemctl reload nginx
```

## 11. Verificar que todo funciona

```bash
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS https://dashboard.ccvenequip.com/api/health
```

Ambos deben responder `200` con `"status": "healthy"` (o al menos no dar
error de conexión). Abrir el dominio en el navegador y confirmar que carga la
pantalla de login.

## Actualizaciones posteriores (después del primer despliegue)

Para cualquier actualización futura de código, usar el script incluido:

```bash
cd /opt/dashboard-comercial-2026
./deploy/deploy.sh
```

Esto hace `git pull`, instala dependencias, verifica Postgres, compila y
reinicia el servicio, con un health check al final. Si el script encuentra un
error, se detiene ahí (no sigue con pasos rotos) — revisar el mensaje.

**Este script NO aplica migraciones nuevas automáticamente.** Si el equipo de
desarrollo avisa que hay una migración nueva, aplicarla a mano (mismo patrón
del paso 6) **antes** de correr `deploy.sh`.

## Carga semanal de datos (Excel)

Hay dos formas de actualizar los datos desde el Excel:

1. **Manual**: reemplazar `CCV Rendimiento.xlsx` en la raíz del proyecto y
   correr `bun run load-excel` (mismo comando del paso 8). Reemplaza
   completamente los datos transaccionales (DELETE + INSERT) — no acumula
   duplicados.
2. **Automática**: hay un workflow de GitHub Actions
   (`.github/workflows/weekly-excel-load.yml`) que corre cada viernes a las
   5 AM (hora Caracas). Requiere que el repo tenga configurados los secrets
   `DATABASE_URL` / `DATABASE_ADMIN_URL` apuntando a este servidor de
   producción, y que el servidor sea accesible desde GitHub Actions (revisar
   firewall/IP allowlist si la base de datos no está expuesta públicamente).

## Notas de seguridad

- `DATABASE_URL` usa el rol `app_user` (sin `BYPASSRLS`) — es el que debe usar
  la app en producción. `DATABASE_ADMIN_URL` (`app_admin`, con `BYPASSRLS`)
  solo se usa para migraciones y carga de Excel, nunca para servir tráfico.
- El puerto de Postgres (`55432` por defecto) está bindeado a `127.0.0.1` en
  `docker-compose.prod.yml` — no debe exponerse a la red pública.
- HSTS se configura en Nginx (`nginx.conf.example`), no en Next.js — si se
  usa Caddy en vez de Nginx, agregar el header equivalente ahí.
- El límite de subida de archivos (Excel) es 50MB tanto en
  `next.config.ts` (`bodySizeLimit`) como en `nginx.conf.example`
  (`client_max_body_size`) — si el Excel fuente crece más allá de eso, subir
  ambos valores en conjunto (no alcanza con cambiar solo uno).

## Checklist rápido de primer despliegue

- [ ] **Confirmado con desarrollo que `migrations-manual/0008` a `0013` ya
      están commiteados y pusheados al repo** (bloqueante — ver nota en paso 6)
- [ ] Docker + Bun + Nginx instalados
- [ ] Repo clonado en `/opt/dashboard-comercial-2026`
- [ ] `.env.local` completado con contraseñas reales, incluyendo
      `APP_ADMIN_PASSWORD` / `APP_USER_PASSWORD` (paso 3)
- [ ] Postgres levantado y `healthy`, roles creados via `00-roles.sh` (pasos 4-5)
- [ ] Migraciones aplicadas en orden — las 21, no solo las primeras 13 (paso 6)
- [ ] `bun run build` exitoso (paso 7)
- [ ] Datos cargados desde el Excel (paso 8)
- [ ] Servicio systemd activo (paso 9)
- [ ] Nginx + TLS configurado y funcionando (paso 10)
- [ ] Health check OK desde adentro y desde afuera (paso 11)
