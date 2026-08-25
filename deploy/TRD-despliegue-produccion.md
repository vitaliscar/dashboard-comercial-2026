# TRD — Despliegue en producción (VPS)

## Dashboard Comercial 2026

**Documento técnico de requisitos para el equipo de sistemas.**
Los pasos de ejecución detallados (comandos exactos, en orden) están en
[`deploy/README.md`](./README.md) — este documento no los repite. Aquí van
los requisitos, la arquitectura, los criterios de aceptación y los
bloqueantes conocidos que hay que resolver **antes** de ejecutar ese README.

---

## 1. Resumen ejecutivo

Panel de análisis comercial/ventas para CCV (Next.js 16 + PostgreSQL 18 en
Docker, self-hosted, sin dependencias de terceros gestionadas). Reemplaza el
Excel "CCV Rendimiento.xlsx" como fuente de verdad operativa para gerencia,
coordinadores y asesores.

**Modalidad de este despliegue**: carga de datos **solo manual**, vía botón
en la app — el workflow automático semanal de GitHub Actions **no se
habilita** en este VPS (ver §8). Consecuencia directa: Postgres no necesita
salir a internet, solo el reverse proxy (puertos 80/443).

---

## 2. Repositorio — desarrollo vs. producción

Hay **dos repositorios GitHub separados a propósito**. El VPS clona
únicamente del segundo:

| | Repositorio | Uso |
|---|---|---|
| Desarrollo | `github.com/vitaliscar/dashboard-comercial-2026` (público) | Donde se escribe y prueba código. **El VPS nunca clona de aquí.** |
| **Producción** | `github.com/jesusapn/dashboard-comercial-2026` (privado) | **El VPS clona de aquí.** Espejo completo (historial + branches) del repo de desarrollo al momento de este despliegue. |

**Flujo de actualización**: cuando desarrollo tiene una versión lista para
liberar, alguien con acceso al repo de desarrollo corre un `git push
--mirror` (o el equivalente que el equipo defina) desde dev hacia el repo de
producción. El VPS **no** hace `git pull` directo del repo de desarrollo en
ningún momento — siempre pasa por ese paso intermedio de sincronización
manual, para que sistemas nunca despliegue código que desarrollo todavía no
marcó como listo.

- **Acceso**: el repo de producción es privado. Sistemas necesita un
  Personal Access Token (o clave SSH) de una cuenta con permiso de lectura
  sobre `jesusapn/dashboard-comercial-2026` para poder clonarlo y
  hacer `git pull` en las actualizaciones (`deploy/deploy.sh`, paso 12).
- **No mezclar remotos**: si en algún momento `git remote -v` dentro de
  `/opt/dashboard-comercial-2026` muestra algo distinto a
  `jesusapn/dashboard-comercial-2026`, detenerse — algo se clonó
  mal.

---

## 3. Bloqueantes conocidos — resolver antes de desplegar

Estos 3 hallazgos se corrigieron en esta misma revisión de los archivos de
`deploy/`; si sistemas ya tenía una copia anterior de este repo, debe volver
a clonar/pull para tomarlos:

| # | Problema | Corrección aplicada |
|---|---|---|
| 1 | `docker-compose.prod.yml` exige `APP_ADMIN_PASSWORD`/`APP_USER_PASSWORD`, pero `.env.production.example` no las tenía — `docker compose up` fallaba de inmediato. | Agregadas al template. |
| 2 | `deploy/00-roles.prod.sql.example` describía un mecanismo de creación de roles (editar un `.sql`) que ya no existe — reemplazado por `docker/postgres-init/00-roles.sh`, que lee las contraseñas de variables de entorno. | Archivo obsoleto eliminado; `README.md` actualizado al mecanismo real. |
| 3 | `nginx.conf.example` cortaba subidas por debajo del límite real de la app (`/api/carga`) — un Excel grande pasaba la validación de la app pero nunca llegaba, rechazado por Nginx antes. | Límite subido a 350MB en la app / 400MB en Nginx, con `location` propio para `/api/carga` con timeout de 620s — ver §5 para el detalle actualizado y por qué crece con el tiempo. |

**Bloqueante pendiente, no corregible desde aquí — requiere al equipo de
desarrollo:**

> ⚠️ Las migraciones `src/db/migrations-manual/0008` a `0013` (6 archivos)
> existen solo en el entorno de desarrollo local — **no están commiteadas al
> repositorio Git**. Si sistemas clona el repo tal cual está disponible hoy,
> esos 6 archivos no van a existir y la base de datos de producción quedará
> con el esquema incompleto (falta RLS de comisiones, accesos por rol,
> alertas de minutas, sucursales de perfil, entre otros).
>
> **Antes de clonar en el VPS**: pedir al equipo de desarrollo que confirme
> que esos 6 archivos ya están commiteados y pusheados a la rama que se va a
> desplegar. Verificación rápida:
> ```bash
> git log --oneline -- src/db/migrations-manual/0013_profiles_fuerza_venta_select.sql
> ```
> Si no devuelve nada, **no seguir** — avisar a desarrollo primero.

---

## 4. Arquitectura técnica

```
Internet ──443/80──▶ Nginx/Caddy (TLS) ──127.0.0.1:3000──▶ Next.js (bun run start)
                                                                    │
                                                          127.0.0.1:55432
                                                                    ▼
                                                    Postgres 18 (contenedor Docker)
```

- **App**: Next.js 16 (App Router), React 19, TypeScript. Sin API REST propia
  — todo pasa por Server Actions de Next.js. Corre con `bun run start` en el
  puerto 3000 (interno, no expuesto directamente).
- **Base de datos**: PostgreSQL 18 en un único contenedor Docker
  (`deploy/docker-compose.prod.yml`), con RLS nativo de Postgres — el scope
  de datos por rol/sucursal se aplica en la base, no en el código de la app.
  Dos roles de conexión: `app_user` (tráfico real, sin bypass de RLS) y
  `app_admin` (BYPASSRLS — solo migraciones y carga de Excel).
- **Autenticación**: sesiones propias por cookie httpOnly + `argon2`. Sin
  Supabase, sin NextAuth, sin proveedor externo.
- **Reverse proxy**: Nginx u otro equivalente, con TLS (Let's Encrypt), al
  frente. Termina TLS y agrega los headers HSTS que Next.js omite a
  propósito (ver comentario en `next.config.ts`).
- **Proceso**: supervisado con systemd (`deploy/dashboard-comercial.service.example`),
  reinicio automático en caso de caída (`Restart=on-failure`).
- **Carga de Excel**: `src/app/api/carga/route.ts` parsea el `.xlsx`
  (`XLSX.read`/`sheet_to_json`, trabajo síncrono pesado) en un **proceso
  hijo aparte** (`node:child_process`, no `worker_threads`) para no
  congelar el proceso Next.js del resto de usuarios mientras dura el
  parseo. El script se precompila con `bun run build:worker` a
  `worker-dist/excel-parse.worker.js` — ese paso ya corre automáticamente
  como parte de `bun run build` (ver `package.json`), no requiere nada
  manual de sistemas. Se usa `child_process` en vez de `worker_threads` a
  propósito: Turbopack (el bundler de Next.js 16) reescribe en runtime
  cualquier uso de `worker_threads.Worker` dentro del bundle de servidor —
  sin importar el alias de import ni los argumentos — de una forma
  incompatible con la firma real de esa API, y no hay manera de evitarlo
  desde código de aplicación.

---

## 5. Requisitos de infraestructura

| Recurso | Mínimo | Recomendado | Nota |
|---|---|---|---|
| CPU | 2 vCPU | 4 vCPU | El build de producción (`bun run build`) es CPU-intensivo; en 4 vCPU tarda ~20-30s. |
| RAM | 8 GB | 12 GB | Postgres tiene un límite de 2 GB fijado en `docker-compose.prod.yml`. El resto: Next.js + SO, más el pico de memoria durante una carga de Excel — `XLSX.read`/`sheet_to_json` puede usar 2-3x el tamaño del archivo fuente en memoria (ver nota abajo). |
| Disco | 20 GB | 40 GB+ | Incluye imagen Docker de Postgres, `node_modules`, `.next/`, y crecimiento del volumen de datos. No incluye backups — ver §10. |
| SO | Ubuntu/Debian LTS (o equivalente) | — | Con acceso root/sudo para instalar Docker, Bun, Nginx. |
| Red saliente | Requerida | — | `bun install` descarga `xlsx` directo desde `cdn.sheetjs.com` (no está en el registro npm público) — el VPS necesita salida a internet hacia ese host en el momento del install. |

**Tamaño del Excel fuente**: el archivo real de producción pesa ~209MB
(31 hojas) al momento de escribir esto y **solo va a seguir creciendo**. El
límite de subida se fijó en **350MB** (`src/app/api/carga/route.ts`,
`maxBytes`), con `client_max_body_size 400m` en Nginx (por encima del
límite de la app, nunca por debajo) y `maxDuration=600` en la ruta. Si el
Excel real se acerca a 350MB, subir los tres valores juntos — app, Nginx,
y la recomendación de RAM de esta tabla — nunca solo uno.

Estos números **no están medidos en el VPS real** — son estimaciones a
partir del stack. La prueba de carga (§9) sí se corrió, pero contra el
entorno de desarrollo local, no contra hardware equivalente al VPS. Repetir
la prueba contra el VPS ya desplegado es la única forma de confirmar que
estos recursos alcanzan con el tráfico real esperado.

---

## 6. Requisitos de red y seguridad

- **Puertos públicos**: solo 80 (redirect) y 443 (HTTPS). Postgres
  (`127.0.0.1:55432` por defecto) **nunca** debe exponerse a la red pública
  — el `docker-compose.prod.yml` ya lo bindea a loopback, no cambiar eso.
- **DNS**: un registro A apuntando al VPS antes de correr `certbot`.
- **Secretos**: `POSTGRES_PASSWORD`, `APP_ADMIN_PASSWORD`, `APP_USER_PASSWORD`
  — tres valores distintos entre sí, generados con `openssl rand -base64 32`
  o equivalente. Nunca reutilizar contraseñas de otros sistemas.
- **`.env.local`**: vive solo en el VPS, nunca en el repo (ya está en
  `.gitignore`). Permisos de archivo restringidos al usuario que corre el
  servicio (`chmod 600`).
- **Usuario del servicio**: no correr `bun run start` como root — el
  `dashboard-comercial.service.example` ya lo deja explícito (`User=deploy`
  o el usuario que sistemas defina).
- **CSP / headers de seguridad**: ya configurados en `next.config.ts`
  (CSP, X-Frame-Options, X-Content-Type-Options, Permissions-Policy) — no
  requieren acción de sistemas, salvo HSTS, que se configura en Nginx
  (`nginx.conf.example` ya lo trae).

---

## 7. Variables de entorno requeridas

Ver plantilla completa en [`deploy/.env.production.example`](./.env.production.example).
Resumen de lo obligatorio:

```env
NODE_ENV=production
POSTGRES_USER=app_root
POSTGRES_PASSWORD=<generar>
POSTGRES_DB=dashboard_comercial
POSTGRES_PORT=55432
APP_ADMIN_PASSWORD=<generar>
APP_USER_PASSWORD=<generar>
DATABASE_URL=postgresql://app_user:<=APP_USER_PASSWORD>@localhost:55432/dashboard_comercial
DATABASE_ADMIN_URL=postgresql://app_admin:<=APP_ADMIN_PASSWORD>@localhost:55432/dashboard_comercial
```

`NODE_ENV=production` no es cosmético: además de activar las optimizaciones
normales de Next.js, oculta en toda la app los módulos `comisiones`,
`simulador`, `pareto` y `mercadeo` para **todos** los roles
(`src/lib/permissions.ts`) — es un requisito de negocio, no solo técnico. Si
`NODE_ENV` no queda en `production`, esos módulos quedan visibles quien no
deberían verlos.

---

## 8. Alcance de este despliegue — decisiones ya tomadas

- **Carga de Excel**: solo manual, vía botón "Cargar Excel" en `/carga`
  (rol `gerencia`). El workflow `.github/workflows/weekly-excel-load.yml`
  **debe quedar deshabilitado** (GitHub → Actions → el workflow → "..." →
  "Disable workflow") para que no falle solo por no tener configurados los
  secrets `DATABASE_URL`/`DATABASE_ADMIN_URL` contra este VPS.
- **Módulos excluidos de producción**: `comisiones`, `simulador`, `pareto`,
  `mercadeo` — ocultos automáticamente por `NODE_ENV=production` (§7), no
  requiere configuración adicional de sistemas.
- **Proceso**: systemd (no pm2) — `deploy/dashboard-comercial.service.example`.

---

## 9. Resultado de la prueba de carga (baseline de referencia)

Se corrió una prueba con los 51 usuarios reales del sistema (2 gerencia, 4
gerente_comercial, 13 coordinador, 32 asesor), todos logueándose de forma
concurrente y cada uno disparando 3-4 consultas distintas (páginas del
dashboard según su rol), contra un build de producción real
(`bun run build && bun run start`) corriendo en la máquina de desarrollo —
**no en el VPS real**, así que estos números son un piso de referencia, no
una garantía de lo que dará el VPS:

| Métrica | Resultado |
|---|---|
| Logins exitosos | 50/51 (el único fallo fue una contraseña de prueba incorrecta, no un error de sistema) |
| Consultas fallidas | 0/169 |
| Conexiones Postgres agotadas / caídas | No — pool máximo 25 (`app_admin` max 10 + `app_user` max 15`), nunca saturado |
| Wall time total (51 logins + 169 consultas, todo en paralelo) | 3.5s |
| Login P50 / P95 | 2.0s / 3.0s |
| Consulta P50 / P95 | 981ms / 1.45s |

**Criterio de aceptación sugerido**: repetir la misma prueba contra el VPS ya
desplegado (guardar el script usado, disponible en el historial de esta
sesión) y confirmar que P95 de consultas se mantiene bajo ~3s con los 51
usuarios reales. Si el VPS da números sustancialmente peores que estos,
revisar recursos (§5) antes de dar por cerrado el despliegue.

---

## 10. Fuera de alcance de este documento (a definir con el usuario)

- **Backups de Postgres**: `docker-compose.prod.yml` deja un comentario
  indicando dónde montar un volumen adicional para `pg_dump` vía cron, pero
  no trae uno configurado. **No hay backup automático por defecto** — definir
  frecuencia y retención antes de considerar el despliegue completo.
- **Monitoreo externo**: `/api/health` y `/api/metrics` existen y responden,
  pero no hay ningún monitor (Uptime Kuma, Grafana, etc.) conectado a ellos
  por defecto — es responsabilidad de sistemas conectarlos a lo que ya
  usen internamente.
- **Rotación de logs**: `journalctl` (systemd) ya rota por defecto en la
  mayoría de las distros; confirmar la política del servidor si difiere.

---

## 11. Plan de rollback

Si el despliegue falla o el health check no pasa después de `deploy.sh`:

1. **Si falló el build/deploy de código** (Postgres no se tocó):
   `git log --oneline -3` para ver el commit anterior que sí funcionaba,
   `git checkout <commit-anterior>`, y correr `deploy/deploy.sh` de nuevo.
2. **Si falló una migración** contra datos ya en producción: **no** hacer
   rollback de código sin antes evaluar si la migración fallida dejó el
   esquema a mitad de camino — revisar el error exacto de `psql` y avisar a
   desarrollo antes de continuar. No hay rollback automático de migraciones
   en este proyecto (no hay comando `migrate down`).
3. **Si el servicio no arranca**: `journalctl -u dashboard-comercial -n 100
   --no-pager` para ver el error real antes de reintentar a ciegas.

---

## 12. Checklist de aceptación final (firma de sistemas)

- [ ] §3 — Bloqueantes conocidos resueltos (las 6 migraciones confirmadas
      commiteadas antes de clonar)
- [ ] Infraestructura provisionada según §5
- [ ] Firewall configurado según §6 (solo 80/443 públicos)
- [ ] Todos los pasos de `deploy/README.md` completados y su checklist
      interno marcado
- [ ] `curl https://<dominio>/api/health` responde 200 desde fuera del VPS
- [ ] Login funcional con un usuario real de cada rol (gerencia,
      gerente_comercial, coordinador, asesor)
- [ ] Módulos `comisiones`/`simulador`/`pareto`/`mercadeo` **no visibles**
      para ningún rol (confirma que `NODE_ENV=production` quedó activo)
- [ ] Carga de Excel probada una vez desde `/carga` con datos reales
- [ ] Workflow `weekly-excel-load.yml` deshabilitado en GitHub Actions
- [ ] Prueba de carga de §9 repetida contra el VPS, resultados documentados

---

## 13. Contactos / responsables

| Rol | Nombre | Contacto |
|---|---|---|
| Responsable de sistemas / VPS | _completar_ | _completar_ |
| Responsable de desarrollo (dudas de migraciones/código) | _completar_ | _completar_ |
| Dueño del dominio / DNS | _completar_ | _completar_ |
