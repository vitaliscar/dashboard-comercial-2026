# Dashboard Comercial 2026

## 1. Descripción del Proyecto

Dashboard Comercial 2026 es una plataforma web de analítica comercial para CCV orientada a la gestión de ventas, cobranzas, cumplimiento presupuestario y seguimiento operativo por rol.

### Contexto de negocio (integrado)

- Objetivo de la aplicación: centralizar y visualizar de forma unificada el desempeño comercial de la organización (cotizaciones, facturación, ventas perdidas, cobranzas y minutas), con paneles especializados por unidad de negocio y por perfil operativo.
- Motivo de creación: reemplazar la dispersión de información en archivos Excel y consolidar un único sistema con trazabilidad, controles de acceso y carga periódica automatizada.
- Necesidad que resuelve: reduce inconsistencias y reprocesos manuales, mejora el tiempo de análisis y decisión, evita pérdida de información operativa y asegura que cada perfil vea únicamente los datos que le corresponden.

La aplicación implementa autenticación con Supabase, enrutamiento protegido, autorización por roles (gerencia, gerente comercial, coordinador, asesor), filtros compartidos entre módulos, y un pipeline de carga de datos desde Excel hacia PostgreSQL.

## 2. Stack Tecnológico

| Categoría                | Tecnologías                                                            |
| ------------------------ | ---------------------------------------------------------------------- |
| Lenguaje principal       | TypeScript                                                             |
| Frontend                 | React 19, TanStack Start, TanStack Router                              |
| Estado y fetching        | TanStack Query                                                         |
| UI y diseño              | Tailwind CSS v4, shadcn/ui, Radix UI, Lucide Icons                     |
| Visualización de datos   | Recharts                                                               |
| Formularios y validación | React Hook Form, Zod                                                   |
| Backend / BaaS           | Supabase (PostgreSQL, Auth, RLS), @supabase/supabase-js, @supabase/ssr |
| Carga y parsing de Excel | xlsx (SheetJS), parser propio en src/lib/excel-parser.ts               |
| Render/SSR               | Vite 8 + Nitro + TanStack Start                                        |
| 3D / visuales            | three, @react-three/fiber, @react-three/drei                           |
| Calidad de código        | ESLint, Prettier, TypeScript strict                                    |
| Runtime / paquetes       | Bun (principal), npm compatible                                        |
| CI/CD de datos           | GitHub Actions (weekly-excel-load.yml)                                 |

## 3. Estado Actual de Desarrollo

Estado general estimado: 90%–95% funcional en términos de módulos core de negocio.

### Cobertura implementada

- Autenticación y protección de rutas: implementado.
- Autorización por rol y alcance de datos por sucursal/unidad/asesor: implementado.
- Paneles por dominio comercial (resumen, gerencia, coordinador, asesor, servicios, equipos, alquiler, lub/filtros): implementado.
- Módulos operativos (cobranzas, minutas, pareto, carga de datos, usuarios): implementado.
- Carga masiva desde Excel con refresco de tablas y flujo programado semanal: implementado.
- Integración con Supabase (cliente con RLS + cliente server admin): implementado.

### Brechas o pendientes observados

- Histórico de cartera (tendencia de morosidad) no implementado — ver `docs/SCHEMA.md` para el estado de `cobranzas_snapshots` (migración escrita, aún no aplicada).
- Maestro de clientes unificado entre `cotizaciones`/`facturas`/`ventas_perdidas` no implementado (cada Pareto se calcula por fuente, sin cruce de identidad de cliente).
- `xlsx` (SheetJS), usado en `excel-parser.ts`, tiene una vulnerabilidad conocida de alta severidad (Prototype Pollution / ReDoS) sin fix disponible en la versión actual — evaluar migración de librería o mitigación en una iteración futura.

## 4. Funcionalidades Principales

1. Gestión de autenticación y sesión

- Login con Supabase Auth.
- Contexto de usuario y perfil cargado desde tablas profiles y user_roles.
- Cierre de sesión con limpieza de filtros compartidos.

2. Control de acceso por rol

- Roles soportados: gerencia, gerente_comercial, coordinador, asesor.
- Resolución de rol con prioridad definida.
- Restricción de navegación y permisos por módulo.

3. Dashboards y analítica comercial

- Resumen ejecutivo con KPIs y métricas por unidad de negocio.
- Dashboard de Gerencia Nacional.
- Paneles especializados de Servicios, Equipos, Alquiler y Lubricantes/Filtros.
- Vista del Coordinador y vista personal del Asesor.

4. Cobranzas

- KPIs de cuentas por cobrar.
- Clasificación por antigüedad de saldo.
- Tabla detallada con búsqueda por cliente/factura.

5. Minutas

- Registro de compromisos comerciales.
- Creación/edición (según rol) y eliminación (gerencia).
- Seguimiento por estado y responsables.

6. Pareto 80/20

- Análisis de concentración comercial para perfiles habilitados.

7. Gestión de usuarios

- Administración de roles y asignaciones de sucursal/unidad (gerencia).

8. Carga de datos

- Carga manual de Excel desde UI para tablas comerciales principales.
- Cargador técnico robusto en src/integrations/supabase/load-excel.ts con estrategia delete + insert por tablas de negocio (y upsert en catálogos/usuarios).
- Automatización semanal vía GitHub Actions.

9. Arquitectura de seguridad de datos

- RLS en Supabase como enforcement principal.
- Scoping adicional en cliente para UX y reducción de ruido de datos.
- Separación entre cliente público y cliente server con service role key.

## 5. Casos de Uso

### Flujo A: Ingreso y redirección inteligente

1. Usuario inicia sesión en /auth.
2. El sistema consulta perfil y roles.
3. La ruta /dashboard redirige al panel correspondiente según rol.

### Flujo B: Seguimiento ejecutivo (Gerencia)

1. Ingresa a Resumen y/o Gerencia Nacional.
2. Aplica filtros globales por período y dimensiones.
3. Revisa KPIs, comparativos, top clientes, pérdidas y cumplimiento.
4. Toma decisiones de priorización comercial.

### Flujo C: Gestión táctica por unidad (Gerente Comercial)

1. Accede a dashboards de su ámbito.
2. Consulta desempeño facturado/presupuesto/cobranzas.
3. Evalúa brechas y comportamiento mensual.

### Flujo D: Operación de sucursal (Coordinador)

1. Accede a panel coordinador y módulos asociados.
2. Visualiza resultados de su sucursal/unidad aplicando alcance automático.
3. Registra minutas y seguimiento operativo.

### Flujo E: Seguimiento individual (Asesor)

1. Accede a su panel personal.
2. Revisa indicadores y cartera bajo su alcance.
3. Da soporte al seguimiento diario comercial.

### Flujo F: Carga y renovación de datos

1. Gerencia carga archivo Excel desde módulo Carga (manual) o pipeline semanal automático.
2. Se parsean hojas y se normalizan campos.
3. Se refrescan tablas de negocio en Supabase.
4. Los dashboards reflejan datos actualizados en consultas posteriores.

## 6. Estructura del Proyecto

```text
.
├─ src/
│  ├─ routes/
│  │  ├─ __root.tsx
│  │  ├─ auth.tsx
│  │  ├─ _app.tsx
│  │  └─ _app/
│  │     ├─ dashboard.tsx
│  │     ├─ resumen.tsx
│  │     ├─ gerencia-nacional.tsx
│  │     ├─ coordinador.tsx
│  │     ├─ asesor.tsx
│  │     ├─ servicios.tsx
│  │     ├─ equipos.tsx
│  │     ├─ alquiler.tsx
│  │     ├─ lubfiltros.tsx
│  │     ├─ cobranzas.tsx
│  │     ├─ minutas.tsx
│  │     ├─ pareto.tsx
│  │     ├─ carga.tsx
│  │     └─ usuarios.tsx
│  ├─ components/
│  │  ├─ app-shell.tsx
│  │  ├─ ui/
│  │  ├─ resumen/
│  │  ├─ gerencia-nacional/
│  │  └─ coordinador/
│  ├─ hooks/
│  │  ├─ use-auth.tsx
│  │  ├─ use-shared-filters.tsx
│  │  └─ ...
│  ├─ integrations/supabase/
│  │  ├─ client.ts
│  │  ├─ client.server.ts
│  │  ├─ auth-middleware.ts
│  │  ├─ types.ts
│  │  └─ load-excel.ts
│  ├─ lib/
│  │  ├─ permissions.ts
│  │  ├─ data-scope.ts
│  │  ├─ fetch-all-rows.ts
│  │  ├─ excel-parser.ts
│  │  └─ ...
│  └─ tests/
│     └─ excel.test.ts
├─ supabase/
│  ├─ config.toml
│  └─ migrations/
├─ .github/workflows/
│  └─ weekly-excel-load.yml
├─ package.json
├─ vite.config.ts
└─ README.md
```

## 7. Guía de Instalación y Ejecución

### 7.1 Prerrequisitos

- Node.js 20+ (recomendado para tooling y CI).
- Bun instalado globalmente (flujo principal del proyecto).
- Cuenta/proyecto Supabase con esquema y migraciones aplicadas.

### 7.2 Clonar e instalar dependencias

```bash
git clone <url-del-repositorio>
cd "Dashboard Comercial 2026"
bun install
```

### 7.3 Configurar variables de entorno

Crear archivo .env.local con al menos:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Notas:

- VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY se usan en cliente/SSR para operaciones con RLS.
- SUPABASE_SERVICE_ROLE_KEY se usa para operaciones administrativas server-side y scripts de carga.

### 7.4 Ejecutar en desarrollo

```bash
bun run dev
```

### 7.5 Build y preview

```bash
bun run build
bun run preview
```

### 7.6 Lint y formato

```bash
bun run lint
bun run format
```

### 7.7 Carga de datos desde Excel

Ejecución técnica directa (script robusto):

```bash
bun run src/integrations/supabase/load-excel.ts
```

Carga manual desde UI:

- Ingresar con rol gerencia.
- Ir al módulo Carga de datos.
- Subir archivo .xlsx con hojas esperadas.

### 7.8 Automatización semanal (opcional en GitHub Actions)

El workflow .github/workflows/weekly-excel-load.yml ejecuta la carga cada viernes 5:00 AM (Caracas) y también admite ejecución manual.

Secrets requeridos en GitHub:

- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- EXCEL_FILE_URL (opcional)

### 7.9 Pruebas disponibles

```bash
bun run test          # Vitest — unit tests (src/lib/*.test.ts)
bun run test:watch    # Vitest en modo watch
bun run test:excel    # Script standalone contra CCV Rendimiento.xlsx real
```

Observación:

- `test` corre con Vitest sobre `src/lib/kpi-calculations.test.ts` (36 tests). `vitest.config.ts` excluye explícitamente `src/tests/excel.test.ts`, que no es una suite de Vitest — es un script standalone (`bun run test:excel`) que requiere el archivo `CCV Rendimiento.xlsx` real presente en el repo.
- E2E no implementado todavía.

---

Este README refleja el estado funcional y arquitectónico del repositorio actual, con foco en operación comercial, seguridad por rol y trazabilidad de datos para toma de decisiones.
