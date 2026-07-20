# MASTER README — Dashboard Comercial CCV 2026

## Arquitectura, Estado del Sistema y Análisis Exhaustivo

**Fecha de auditoría:** Julio 2026  
**Versión del documento:** 1.0 — Generado automáticamente por análisis de código completo

---

## 1. ARQUITECTURA Y ESTRUCTURA DEL PROYECTO

### 1.1 Visión General del Proyecto

**Dashboard Comercial 2026** es un panel de análisis de ventas/comercial construido para CCV (Compañía de Comercio y Vehículos o similar — empresa industrial venezolana con operaciones en al menos 8 sucursales). El sistema permite monitorear cotizaciones, facturación, cobranzas, cumplimiento de metas y análisis de desempeño de asesores comerciales.

La aplicación usa **TanStack Start** (framework full-stack basado en React 19 con SSR), con **Supabase** como backend de base de datos, autenticación y políticas de seguridad a nivel fila (RLS). El frontend se despliega en un VPS propio usando el adaptador de servidor Node de Nitro.

### 1.2 Estructura Completa de Directorios

```
Dashboard Comercial 2026/
├── src/                          # CÓDIGO FUENTE PRINCIPAL
│   ├── routes/                   # RUTAS (file-based routing de TanStack Router)
│   │   ├── __root.tsx            # Layout raíz: wrapping de QueryClient + Auth + SharedFilters
│   │   ├── _app.tsx              # Layout protegido: sesión requerida + control de inactividad
│   │   ├── index.tsx             # Redirección raíz / → /resumen
│   │   ├── auth.tsx              # Página de login pública
│   │   ├── _app/                 # RUTAS PROTEGIDAS (dentro del layout _app)
│   │   │   ├── dashboard.tsx     # Punto de entrada: redirecciona según rol del usuario
│   │   │   ├── resumen.tsx       # Resumen comercial multi-unidad con KPIs y desglose
│   │   │   ├── gerencia-nacional.tsx  # Dashboard de dirección nacional
│   │   │   ├── coordinador.tsx   # Panel financiero del coordinador de sucursal
│   │   │   ├── sucursal.tsx      # Dashboard de rendimiento de sucursal
│   │   │   ├── asesor.tsx        # Vista personal de asesor individual
│   │   │   ├── asesores.tsx      # Ranking, análisis y Pareto de asesores
│   │   │   ├── embudo.tsx        # Embudo comercial: Cotizado → Facturado → Cobrado
│   │   │   ├── cobranzas.tsx     # Cuentas por cobrar y cartera vencida
│   │   │   ├── minutas.tsx       # Seguimiento de notas y tareas comerciales
│   │   │   ├── pareto.tsx        # Análisis 80/20 por cliente/producto
│   │   │   ├── alertas.tsx       # Alertas de cumplimiento, vencimiento y desviaciones
│   │   │   ├── carga.tsx         # Carga masiva de datos desde Excel (SÓLO gerencia)
│   │   │   ├── usuarios.tsx      # Gestión de usuarios y roles (SÓLO gerencia)
│   │   │   ├── servicios.tsx     # Dashboard de unidad: Servicios
│   │   │   ├── repuestos.tsx     # Dashboard de unidad: Repuestos
│   │   │   ├── lubfiltros.tsx    # Dashboard de unidad: Lubricantes y Filtros
│   │   │   ├── equipos.tsx       # Dashboard de unidad: Equipos
│   │   │   └── alquiler.tsx      # Dashboard de unidad: Alquiler
│   │   └── README.md             # Nota: los módulos viven en _app/, no en el root de routes/
│   │
│   ├── components/               # COMPONENTES REACT
│   │   ├── app-shell.tsx         # Shell principal: sidebar navegación + header + contenido
│   │   ├── kpi-card.tsx          # Tarjeta reusable de KPI (label, valor, hint, icono, acento)
│   │   ├── page-header.tsx       # Encabezado de página con eyebrow, título y descripción
│   │   ├── status-pill.tsx       # Badge/píldora de estado (success/warning/danger)
│   │   ├── svg-3d-logo.tsx       # Logo 3D de CCV renderizado con Three.js vía @react-three/fiber
│   │   ├── coordinador/          # Componentes específicos del panel de coordinador
│   │   │   ├── CompanyTrendChart.tsx        # Gráfico de tendencia mensual de la compañía
│   │   │   ├── EquiposAlquilerStacked.tsx   # Barras apiladas: Equipos + Alquiler
│   │   │   ├── GlobalMonthlyCombo.tsx       # Combo: barras presupuesto + líneas facturación
│   │   │   ├── LubFiltrosComboLines.tsx     # Líneas combinadas LubFiltros
│   │   │   ├── ReceivablesTable.tsx         # Tabla de cuentas por cobrar
│   │   │   ├── RepuestosAreaChart.tsx       # Área: evolución de repuestos
│   │   │   ├── ServiciosBarWithMarkers.tsx  # Barras con marcadores de servicios
│   │   │   └── UnitAmountBars.tsx           # Barras de monto por unidad de negocio
│   │   ├── gerencia-nacional/    # Componentes específicos de gerencia nacional
│   │   │   ├── BranchRanking.tsx            # Ranking de sucursales (cumplimiento)
│   │   │   ├── BranchSummaryTable.tsx       # Tabla resumen por sucursal
│   │   │   ├── ComplianceGauge.tsx          # Medidor circular de cumplimiento
│   │   │   ├── GoalFeedback.tsx             # Retroalimentación visual de metas
│   │   │   ├── goalfeedback.css             # Estilos del componente GoalFeedback
│   │   │   ├── SegmentedToggle.tsx          # Toggle segmentado (mensual/anual)
│   │   │   ├── UnitDonut.tsx                # Gráfico dona por unidad de negocio
│   │   │   ├── UnitHeatmapMatrix.tsx        # Matriz de calor: sucursales × unidades
│   │   │   └── UnitMetaVsVenta.tsx          # Meta vs Venta por unidad
│   │   ├── resumen/              # Componentes del módulo Resumen
│   │   │   ├── BusinessUnitCard.tsx         # Tarjeta expandible por unidad de negocio
│   │   │   ├── CotizacionesSection.tsx      # Sección de cotizaciones (KPIs + tabla)
│   │   │   ├── DataTable.tsx                # Tabla de datos genérica con búsqueda
│   │   │   ├── FacturadoSection.tsx         # Sección de facturación con KPIs y desglose
│   │   │   ├── FilterHeader.tsx             # Filtros de fecha, año, sucursal
│   │   │   ├── KpiCards.tsx                 # Grid de tarjetas de KPI principales
│   │   │   └── VentasPerdidasSection.tsx    # Sección de ventas perdidas
│   │   │
│   │   └── ui/                   # 62 COMPONENTES shadcn/ui (generados, no editar manualmente)
│   │       ├── accordion.tsx, alert-dialog.tsx, alert.tsx, aspect-ratio.tsx
│   │       ├── attachment.tsx, avatar.tsx, badge.tsx, breadcrumb.tsx
│   │       ├── bubble.tsx, button-group.tsx, button.tsx, calendar.tsx
│   │       ├── card.tsx, carousel.tsx, chart.tsx, checkbox.tsx
│   │       ├── collapsible.tsx, combobox.tsx, command.tsx, context-menu.tsx
│   │       ├── dialog.tsx, direction.tsx, drawer.tsx, dropdown-menu.tsx
│   │       ├── empty.tsx, field.tsx, form.tsx, hover-card.tsx
│   │       ├── input-group.tsx, input-otp.tsx, input.tsx, item.tsx
│   │       ├── kbd.tsx, label.tsx, marker.tsx, menubar.tsx
│   │       ├── message-scroller.tsx, message.tsx, native-select.tsx
│   │       ├── navigation-menu.tsx, pagination.tsx, popover.tsx, progress.tsx
│   │       ├── radio-group.tsx, resizable.tsx, scroll-area.tsx, select.tsx
│   │       ├── separator.tsx, sheet.tsx, sidebar.tsx, skeleton.tsx
│   │       ├── slider.tsx, sonner.tsx, spinner.tsx, switch.tsx
│   │       ├── table.tsx, tabs.tsx, textarea.tsx, toggle-group.tsx, toggle.tsx
│   │       └── tooltip.tsx
│   │
│   ├── hooks/                   # HOOKS PERSONALIZADOS
│   │   ├── use-auth.tsx         # Contexto de autenticación: sesión, perfil, rol, signOut
│   │   ├── use-shared-filters.tsx  # Filtros compartidos entre vistas (año, mes, sucursal)
│   │   ├── use-mobile.ts        # Detección de dispositivo móvil (sin React)
│   │   └── use-mobile.tsx       # Detección de dispositivo móvil (hook React)
│   │
│   ├── lib/                     # LÓGICA DE NEGOCIO Y UTILIDADES
│   │   ├── analytics/           # Módulos de analítica
│   │   │   ├── funnel.ts        # Cálculo del embudo comercial (cotizado→facturado→cobrado)
│   │   │   ├── funnel.test.ts   # Tests unitarios del embudo
│   │   │   ├── asesores.ts      # Consolidación y ranking de asesores
│   │   │   ├── asesores.test.ts # Tests unitarios de asesores
│   │   │   └── pareto.ts        # Análisis de Pareto (80/20) con clasificación A/B/C
│   │   ├── kpi-calculations.ts  # Funciones puras de cálculo: cumplimiento, variación, ranking
│   │   ├── kpi-calculations.test.ts  # 60+ tests unitarios de cálculos KPI
│   │   ├── asesores-catalogo.ts  # Catálogo de 32 asesores canónicos + resolución de alias
│   │   ├── asesores-catalogo.test.ts  # Tests del catálogo de asesores
│   │   ├── excel-parser.ts       # Parser de Excel (1500+ líneas): lee CCV Rendimiento.xlsx
│   │   ├── data-scope.ts         # Aplicación de scope por rol en queries Supabase
│   │   ├── data-scope.test.ts    # Tests de data-scope
│   │   ├── permissions.ts        # Matriz completa de permisos por rol y módulo
│   │   ├── date-range.ts         # Utilidades de rango de fechas y filtros mensuales
│   │   ├── date-range.test.ts    # Tests de date-range
│   │   ├── format.ts             # Formateo: money(), pct(), int(), MESES, abbreviateSucursal()
│   │   ├── fetch-all-rows.ts     # Paginación automática para obtener todas las filas
│   │   ├── resumen-types.ts      # Tipos TypeScript para el módulo Resumen
│   │   ├── unidad-labels.ts      # Etiquetas y orden de visualización de unidades de negocio
│   │   ├── error-capture.ts      # Captura estructurada de errores
│   │   ├── error-page.ts         # Página de error estandarizada
│   │   └── utils.ts              # Utilidades generales (cn() para clases Tailwind)
│   │
│   ├── integrations/            # INTEGRACIONES EXTERNAS
│   │   └── supabase/            # TODO lo relacionado con Supabase
│   │       ├── client.ts        # Cliente Supabase para navegador (sessionStorage, publishable key)
│   │       ├── client.server.ts # Cliente Supabase server (service role key — bypass RLS)
│   │       ├── types.ts         # Tipos TypeScript del esquema de BD (1049 líneas autogeneradas)
│   │       ├── auth-middleware.ts # Middleware de autenticación para rutas server
│   │       ├── auth-attacher.ts # Adjunta cookie de sesión a peticiones al backend
│   │       └── load-excel.ts    # Script de carga masiva de Excel a Supabase (CI/CD)
│   │
│   ├── tests/                   # TESTS
│   │   └── excel.test.ts        # Test standalone de lectura de Excel (bun run test:excel)
│   │
│   ├── router.tsx               # Creación del router con QueryClient y routeTree
│   ├── routeTree.gen.ts         # Archivo autogenerado por TanStack Router — NO EDITAR
│   ├── server.ts                # Entrada del servidor: crea app Nitro + handler fetch
│   ├── start.ts                 # Inicio del servidor en producción
│   └── styles.css               # ÚNICO archivo de estilos globales (Tailwind + temas)
│
├── docs/                        # DOCUMENTACIÓN DEL PROYECTO
│   ├── SCHEMA.md                # Esquema real de Supabase (fuente de verdad, no migraciones)
│   ├── role-view-spec-v1.md     # Especificación de vistas por rol
│   ├── role-view-qa-checklist.md # Checklist de QA por rol
│   ├── supabase-schema.sql       # Esquema SQL obsoleto (no es fuente de verdad)
│   ├── supabase-rls-policies.sql # Políticas RLS (versión inicial)
│   ├── supabase-rls-policies-simple.sql # Políticas RLS simplificadas
│   ├── DASHBOARD_COMPLETE.md     # Documentación del dashboard completado
│   ├── DASHBOARD_SETUP.md        # Instrucciones de setup
│   ├── DESIGN.md                 # Decisiones de diseño y UX
│   ├── EJECUTAR_TESTS.md        # Instrucciones para ejecutar tests
│   ├── EXCEL_PARSER_GUIDE.md    # Guía del parser de Excel
│   ├── HOOKS_IMPLEMENTATION_SUMMARY.md # Resumen de implementación de hooks
│   ├── IMPLEMENTATION_GUIDE.md  # Guía general de implementación
│   ├── INTEGRATION_CHECKLIST.md # Checklist de integración
│   ├── PLAN-EXPANSION.md        # Plan de expansión con fases
│   ├── PRD - Solicitud de Extraccion de Datos.txt  # Requerimientos de extracción
│   ├── PRODUCT.md               # Documento de producto
│   ├── PROJECT_STATUS.md        # Estado actual del proyecto
│   ├── SUPABASE_SETUP.md        # Configuración de Supabase
│   ├── bauhaus-redesign-design.md   # Rediseño visual
│   ├── stitch-adaptation-design.md  # Adaptación de diseño
│   └── ui-ux-4-opciones-preview.html # Preview de opciones UI/UX
│
├── supabase/                    # CONFIGURACIÓN DE SUPABASE
│   ├── config.toml              # Configuración del proyecto Supabase
│   └── migrations/              # Migraciones de base de datos
│       ├── 20260702201106_*.sql  # Schema inicial: tablas core, enums, funciones, RLS
│       ├── 20260703120000_equipos_servicios.sql # Tablas de servicios y equipos
│       ├── 20260703150000_cumplimiento_desglose_y_asesores.sql # Cumplimiento por asesor
│       ├── 20260709093000_cobranzas_snapshots.sql # Snapshots de cobranzas (NO APLICADO)
│       ├── 20260712120000_add_profiles_is_admin.sql # Columna is_admin + trigger
│       ├── 20260712120100_harden_security_definer_function_grants.sql # Hardening grants
│       ├── 20260712120200_harden_rls_policies.sql # Reconstrucción completa de RLS
│       └── 20260713160000_multiunidad_profile.sql # Perfil multi-unidad de negocio
│
├── public/                      # ASSETS ESTÁTICOS
│   ├── ambulancia.svg           # Icono decorativo
│   ├── camion.svg               # Icono decorativo
│   ├── cohete.svg               # Icono decorativo
│   ├── favicon.ico              # Favicon del sitio
│   └── logo-ccv.png             # Logo CCV para la UI
│
├── scripts/                     # SCRIPTS UTILITARIOS
│   ├── inspect-compliance-cols.ts  # Inspección de columnas de cumplimiento
│   ├── inspect-fechas.ts           # Inspección de fechas
│   ├── run-tests.mjs               # Runner de tests
│   ├── setup-dashboard.mjs         # Setup inicial del dashboard
│   └── validate-advisors-data.ts   # Validación de datos de asesores
│
├── .github/workflows/           # CI/CD
│   └── weekly-excel-load.yml    # Carga semanal automática de Excel (viernes 5 AM Caracas)
│
├── .agents/skills/              # Skills para agentes de IA (16 skills)
├── .vscode/mcp.json             # Configuración MCP para VS Code
│
├── package.json                 # Dependencias y scripts
├── tsconfig.json                # Configuración TypeScript
├── vite.config.ts               # Configuración de Vite (build, plugins, optimización)
├── vitest.config.ts             # Configuración de Vitest
├── eslint.config.js             # Configuración ESLint
├── components.json              # Configuración shadcn/ui
├── bunfig.toml                  # Configuración de Bun
├── .prettierrc                  # Configuración Prettier
├── AGENTS.md                    # Instrucciones para agentes de código
├── CLAUDE.md                    # Guía para Claude Code
├── logo_3D.glb                  # Modelo 3D del logo CCV (GLB binary)
├── Logo_CCV.png                 # Logo raster alternativo
└── CCV Rendimiento.xlsx         # ARCHIVO DE DATOS FUENTE (Excel con todas las hojas)
```

### 1.3 Flujo de Inicio de la Aplicación

1. **Cliente (`client.tsx`)**: El punto de entrada del cliente hidrata la app React, crea el router con `StartClient` de TanStack Start.
2. **Router (`router.tsx`)**: Crea una instancia de `QueryClient` y el router con el `routeTree` autogenerado. Scroll restoration habilitado.
3. **Root (`__root.tsx`)**:
   - `RootShell`: Renderiza `<html>`, `<head>` con metadatos SEO (OG, Twitter, charset, viewport) y CSS, `<body>` con children y scripts.
   - `RootComponent`: Envuelve la app en `QueryClientProvider` → `AuthProvider` → `SharedFiltersProvider` → `TooltipProvider` → `<Outlet />` + `<Toaster />`.
4. **Auth (`_app.tsx` — layout protegido)**:
   - Verifica que exista sesión activa. Si no hay sesión después de cargar, redirecciona a `/auth`.
   - Implementa control de inactividad: después de 30 minutos sin actividad, muestra un diálogo de advertencia con cuenta regresiva de 30 segundos. Si no se responde, cierra sesión.
   - Renderiza `<AppShell>` (sidebar + header + contenido con `<Outlet />`).
5. **Redirección por rol (`dashboard.tsx`)**:
   - `gerencia` → `/gerencia-nacional`
   - `gerente_comercial` → `/gerencia-nacional`
   - `coordinador` → `/coordinador`
   - `asesor` → `/asesor`

### 1.4 Interacciones Entre Directorios

```
┌─────────────────────────────────────────────────────────────┐
│                    FLUJO DE DATOS                           │
│                                                             │
│  1. CCV Rendimiento.xlsx (fuente externa)                   │
│     │                                                       │
│     ├──► Carga manual (carga.tsx): gerencia sube el archivo  │
│     │    └──► excel-parser.ts parsea hojas individuales     │
│     │         └──► load-excel.ts inserta en Supabase        │
│     │                                                       │
│     └──► Carga automática (GitHub Actions cada viernes)     │
│          └──► load-excel.ts ejecuta el pipeline CI/CD       │
│                                                             │
│  2. Supabase PostgreSQL (18 tablas + 3 enums + 4 funciones) │
│     │                                                       │
│     ├──► client.ts: queries del frontend (con RLS)          │
│     └──► client.server.ts: operaciones admin (bypass RLS)   │
│                                                             │
│  3. Routes (src/routes/_app/*.tsx)                          │
│     │                                                       │
│     ├──► hooks/use-auth.tsx: obtiene sesión, perfil, rol    │
│     ├──► lib/data-scope.ts: aplica scope por rol            │
│     ├──► lib/permissions.ts: verifica acceso a módulos      │
│     └──► hooks/use-shared-filters.tsx: filtros compartidos  │
│                                                             │
│  4. Components (src/components/)                            │
│     │                                                       │
│     ├──► app-shell.tsx: Sidebar con navegación por rol      │
│     ├──► coordinador/*: Charts específicos del coordinador  │
│     ├──► gerencia-nacional/*: Charts de gerencia nacional   │
│     └──► resumen/*: Componentes del módulo Resumen          │
│                                                             │
│  5. Analytics (src/lib/analytics/)                          │
│     └──► Cálculos puros: funnel, pareto, asesores           │
│          └──► Consumidos por las rutas para renderizar charts│
└─────────────────────────────────────────────────────────────┘
```

---

## 2. BASE DE DATOS Y MODELADO

### 2.1 Motor de Base de Datos

**Supabase PostgreSQL** (versión gestionada). Se accede via:

- **PostgREST** (REST API autogenerada) para queries del frontend
- **Supabase JS SDK** (`@supabase/supabase-js` v2.110.0) para el cliente
- **Row Level Security (RLS)** habilitado en las 18 tablas para seguridad a nivel de fila

### 2.2 Enums de Base de Datos

| Enum               | Valores                                                                       | Uso                  |
| ------------------ | ----------------------------------------------------------------------------- | -------------------- |
| `app_role`         | `'gerencia'`, `'gerente_comercial'`, `'coordinador'`, `'asesor'`              | Tabla `user_roles`   |
| `cotizacion_etapa` | `'desarrollo'`, `'propuesta_negociacion'`, `'venta_perdida'`, `'desconocido'` | Tabla `cotizaciones` |
| `minuta_estado`    | `'pendiente'`, `'en_proceso'`, `'cumplido'`                                   | Tabla `minutas`      |

**Nota importante sobre drift:** La migración inicial definió `cotizacion_etapa` como `'prospecto'|'presentada'|'negociacion'|'ganada'|'perdida'`, pero el enum real en producción es el mostrado arriba. `propuesta_negociacion` es funcionalmente la etapa "ganada" (cotización convertida en orden).

### 2.3 Tablas — Esquema Completo

#### 2.3.1 Catálogos (2 tablas)

| Tabla                  | Columnas                                                                                                                    | Llaves Foráneas | Propósito                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------- |
| **`sucursales`**       | `id` (PK, UUID), `nombre` (TEXT, NOT NULL), `ciudad` (TEXT), `activa` (BOOL, default true), `created_at` (TIMESTAMPTZ)      | —               | Catálogo de sucursales/agencias                                                       |
| **`unidades_negocio`** | `id` (PK, UUID), `nombre` (TEXT, NOT NULL), `descripcion` (TEXT), `activa` (BOOL, default true), `created_at` (TIMESTAMPTZ) | —               | Catálogo de unidades de negocio: Servicios, Repuestos, Lub/Filtros, Equipos, Alquiler |

#### 2.3.2 Perfiles y Roles (3 tablas)

| Tabla                          | Columnas                                                                                                                                                                            | Llaves Foráneas                                                              | Propósito                                                                                                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`profiles`**                 | `id` (PK, UUID), `email` (TEXT, NOT NULL), `nombre_completo` (TEXT), `sucursal_id` (UUID), `unidad_negocio_id` (UUID), `is_admin` (BOOL, default false), `created_at`, `updated_at` | `sucursal_id` → `sucursales.id`, `unidad_negocio_id` → `unidades_negocio.id` | Perfil de usuario extendido, creado automáticamente por trigger `handle_new_user()` al registrarse en Supabase Auth                                                           |
| **`user_roles`**               | `id` (PK, UUID), `user_id` (UUID, NOT NULL), `role` (ENUM app_role, NOT NULL)                                                                                                       | —                                                                            | Asignación de roles a usuarios. Un usuario puede tener múltiples roles                                                                                                        |
| **`profile_unidades_negocio`** | `profile_id` (UUID, NOT NULL), `unidad_negocio_id` (UUID, NOT NULL), `created_at`                                                                                                   | `profile_id` → `profiles.id`, `unidad_negocio_id` → `unidades_negocio.id`    | Tabla puente: permite que un gerente comercial tenga acceso a MÚLTIPLES unidades de negocio. Si está vacía para un usuario, se usa `profiles.unidad_negocio_id` como fallback |

#### 2.3.3 Tablas Transaccionales/Comerciales (6 tablas)

| Tabla                 | Columnas                                                                                                                                                                                                                                                                                                                                                                 | Llaves Foráneas                                                              | Propósito                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **`cotizaciones`**    | `id` (PK), `fecha` (DATE, NOT NULL), `cliente` (TEXT, NOT NULL), `asesor_codigo` (TEXT), `asesor_id` (UUID), `nro_cotizacion` (TEXT), `monto` (NUMERIC, default 0), `monto_facturado` (NUMERIC, default 0), `monto_perdido` (NUMERIC, default 0), `etapa` (ENUM cotizacion_etapa), `descripcion` (TEXT), `sucursal_id`, **`unidad_negocio_id` (NOT NULL)**, `created_at` | `sucursal_id` → `sucursales.id`, `unidad_negocio_id` → `unidades_negocio.id` | **NOTA:** NO tiene columna `asesor` (drift). El nombre del asesor se obtiene cruzando `asesor_codigo` con `cumplimiento_asesores` |
| **`facturas`**        | `id` (PK), `fecha` (DATE, NOT NULL), `numero` (TEXT), `cliente` (TEXT, NOT NULL), `asesor` (TEXT), `asesor_id` (UUID), `monto` (NUMERIC, default 0), `sucursal_id`, `unidad_negocio_id`, `created_at`                                                                                                                                                                    | `sucursal_id` → `sucursales.id`, `unidad_negocio_id` → `unidades_negocio.id` | Facturas emitidas                                                                                                                 |
| **`ventas_perdidas`** | `id` (PK), `fecha` (DATE, NOT NULL), `cliente` (TEXT, NOT NULL), `asesor` (TEXT), `asesor_id` (UUID), `monto` (NUMERIC, default 0), `razon` (TEXT, NOT NULL), `sucursal_id`, `unidad_negocio_id`, `created_at`                                                                                                                                                           | `sucursal_id` → `sucursales.id`, `unidad_negocio_id` → `unidades_negocio.id` | Cotizaciones perdidas con razón                                                                                                   |
| **`servicios`**       | `id` (PK), `fecha` (DATE), `cliente` (TEXT), `monto` (NUMERIC), `tipo_servicio`, `categoria_venta`, `compania` (TEXT), `asesor` (TEXT), `sucursal_id`, `unidad_negocio_id`, `created_at`                                                                                                                                                                                 | `sucursal_id` → `sucursales.id`, `unidad_negocio_id` → `unidades_negocio.id` | Ventas de servicios con clasificación por tipo y categoría (CCV, XIBI, Estratégicas)                                              |
| **`cobranzas`**       | `id` (PK), `cliente` (TEXT, NOT NULL), `factura_numero` (TEXT), `fecha_emision` (DATE, NOT NULL), `fecha_vencimiento` (DATE, NOT NULL), `monto` (NUMERIC, default 0), `saldo` (NUMERIC, default 0), `sucursal_id`, `unidad_negocio_id`, `created_at`                                                                                                                     | `sucursal_id` → `sucursales.id`, `unidad_negocio_id` → `unidades_negocio.id` | Estado actual de cuentas por cobrar (sin histórico — ver drift)                                                                   |
| **`minutas`**         | `id` (PK), `fecha` (DATE, NOT NULL), `cliente` (TEXT, NOT NULL), `descripcion` (TEXT, NOT NULL), `estado` (ENUM minuta_estado), `responsable` (TEXT, NOT NULL), `responsable_id` (UUID), `fecha_limite` (DATE), `sucursal_id`, `unidad_negocio_id`, `created_by` (UUID), `updated_by` (UUID), `created_at`, `updated_at`                                                 | `sucursal_id` → `sucursales.id`, `unidad_negocio_id` → `unidades_negocio.id` | Notas de seguimiento comercial. CRUD completo con control de autoría                                                              |

#### 2.3.4 Presupuestos (1 tabla)

| Tabla              | Columnas                                                                                                                                                                                                     | Llaves Foráneas                                                              | Propósito                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **`presupuestos`** | `id` (PK), `anio` (INT, NOT NULL), `mes` (INT, NOT NULL), `monto` (NUMERIC, default 0), `ventas_ccv` (NUMERIC), `ventas_xibi` (NUMERIC), `ventas_estrategicas` (NUMERIC), `sucursal_id`, `unidad_negocio_id` | `sucursal_id` → `sucursales.id`, `unidad_negocio_id` → `unidades_negocio.id` | Metas mensuales de venta por sucursal y unidad de negocio. Con desglose CCV/XIBI/Estratégicas para Servicios |

#### 2.3.5 Cumplimiento de Asesores (1 tabla)

| Tabla                       | Columnas                                                                                                                                                                                                                                                                         | Llaves Foráneas                                                                                        | Propósito                                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| **`cumplimiento_asesores`** | `id` (PK), `anio` (INT), `mes` (INT), `codigo_asesor` (TEXT, NOT NULL), `asesor` (TEXT, NOT NULL), `asesor_id` (UUID), `presupuesto` (NUMERIC), `venta` (NUMERIC), `pct_cumplimiento` (NUMERIC), `pct_participacion` (NUMERIC), `sucursal_id`, `unidad_negocio_id`, `created_at` | `asesor_id` → `users.id`, `sucursal_id` → `sucursales.id`, `unidad_negocio_id` → `unidades_negocio.id` | Datos mensuales de cumplimiento por asesor (32 asesores). ES la fuente de verdad para nombres y metas de asesores |

#### 2.3.6 Módulo Equipos (5 tablas)

| Tabla                              | Columnas Clave                                                                                          | Propósito                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **`equipos_inventario`**           | `anio`, `mes`, `marca` (TEXT), `disponible` (INT), `transito` (INT), `sucursal_id`, `unidad_negocio_id` | Inventario mensual de equipos por marca: disponibles y en tránsito |
| **`equipos_facturacion`**          | `anio`, `mes`, `facturado` (NUMERIC), `presupuesto` (NUMERIC), `sucursal_id`, `unidad_negocio_id`       | Facturación mensual de equipos con presupuesto asignado            |
| **`equipos_presupuesto`**          | `anio`, `monto` (NUMERIC), `sucursal_id`, `unidad_negocio_id`                                           | Presupuesto anual de equipos                                       |
| **`equipos_facturacion_sucursal`** | `anio`, `mes`, `sucursal` (TEXT), `facturado` (NUMERIC), `unidad_negocio_id`                            | Facturación por sucursal (con nombre textual, no FK)               |
| **`equipos_por_marca`**            | `anio`, `mes`, `marca` (TEXT), `monto` (NUMERIC), `sucursal_id`, `unidad_negocio_id`                    | Ventas de equipos desglosadas por marca                            |

#### 2.3.7 Cobranzas de Equipos (1 tabla)

| Tabla                   | Columnas Clave                                                                  | Propósito                                                                    |
| ----------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **`cobranzas_equipos`** | `cliente` (TEXT, NOT NULL), `monto` (NUMERIC), `saldo` (NUMERIC), `sucursal_id` | Cuentas por cobrar específicas de equipos — separadas de cobranzas generales |

#### 2.3.8 Snapshots de Cobranzas (1 tabla — NO APLICADA EN PRODUCCIÓN)

| Tabla                     | Columnas Clave                                                                                         | Propósito                                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`cobranzas_snapshots`** | `snapshot_date` (DATE), `cobranza_id`, `cliente`, `monto`, `saldo`, `sucursal_id`, `unidad_negocio_id` | Tabla append-only para histórico de cartera. La migración existe (`20260709093000_*.sql`) pero NO está aplicada en producción. Es un paso pendiente para Fase 2 |

### 2.4 Funciones de Base de Datos (SECURITY DEFINER)

| Función                                     | Argumentos       | Retorna     | Propósito                                                                                                                                                 |
| ------------------------------------------- | ---------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `has_role(_role, _user_id)`                 | `app_role`, UUID | BOOLEAN     | Verifica si un usuario tiene un rol específico                                                                                                            |
| `get_user_role(_user_id)`                   | UUID             | `app_role`  | Obtiene el rol de mayor prioridad del usuario                                                                                                             |
| `get_user_sucursal(_user_id)`               | UUID             | TEXT (UUID) | Obtiene la sucursal asignada al usuario                                                                                                                   |
| `get_user_unidad(_user_id)`                 | UUID             | TEXT (UUID) | Obtiene la unidad de negocio asignada                                                                                                                     |
| `can_read_row(_asesor, _sucursal, _unidad)` | TEXT, TEXT, TEXT | BOOLEAN     | Determina si el usuario autenticado puede leer una fila según su scope. Actualizada en la migración multi-unidad para soportar `profile_unidades_negocio` |
| `handle_new_user()`                         | —                | TRIGGER     | Trigger que crea automáticamente un registro en `profiles` cuando se registra un nuevo usuario en `auth.users`                                            |

**Hardening de seguridad (2026-07-12):** Los grants de ejecución de estas funciones se revocaron para `public` y `anon`, y se re-otorgaron solo a `authenticated`, previniendo abuso de RPC anónimo via PostgREST.

### 2.5 Flujo de Datos: Del Excel a la Base de Datos

1. **Fuente de datos**: Archivo `CCV Rendimiento.xlsx` con múltiples hojas (cotizaciones, facturas, cobranzas, presupuestos, cumplimiento_asesores, ventas_perdidas, servicios, equipos, inventario, etc.)
2. **Parser** (`src/lib/excel-parser.ts`, 1500+ líneas):
   - Clase `ExcelParser` que abre el archivo con la librería `xlsx` (SheetJS)
   - Lee cada hoja del Excel mediante `getHojas()` que identifica las hojas por nombre usando patrones (regex, includes, normalización)
   - Para cada hoja, extrae filas, mapea columnas por posición (el Excel no tiene encabezados estándar — usa índices de columna fijos)
   - Aplica reglas de negocio: neteo de repuestos (resta lubricantes de cotizaciones y facturas principales), mapeo de etapas canónicas, normalización de nombres de sucursales/asesores
   - Genera arrays tipados de objetos listos para insertar en Supabase
3. **Carga a BD** (`src/integrations/supabase/load-excel.ts`):
   - Script standalone que usa `supabaseAdmin` (service role key, bypass RLS)
   - Para cada tipo de dato, hace DELETE de registros existentes del período + INSERT de los nuevos (reemplazo completo de la data del período)
   - Usa `Promise.all` y chunks para manejar grandes volúmenes
4. **Ejecución**:
   - Manual: gerencia sube el Excel desde la UI (`/carga`)
   - Automático: GitHub Actions ejecuta `weekly-excel-load.yml` cada viernes a las 5 AM hora de Caracas

---

## 3. AUTENTICACIÓN, SEGURIDAD Y LOGIN

### 3.1 Flujo Completo de Login

1. **Página de Login** (`/auth` → `auth.tsx`):
   - Layout dividido: panel izquierdo con branding (logo 3D, descripción), panel derecho con formulario
   - Usa `lazy()` + `Suspense` para cargar el logo 3D de forma diferida (evita bloqueo del bundle inicial)
   - Protección anti fuerza bruta implementada en el cliente:
     - Contador de intentos fallidos almacenado en `sessionStorage`
     - Después de 5 intentos fallidos, bloquea el formulario por 15 minutos
     - Muestra mensaje `"Acceso temporalmente bloqueado por 15 minutos"`
   - Validación previa: si ya hay sesión activa, `beforeLoad` redirige a `/resumen` (evita re-login)
   - Al enviar credenciales, llama a `supabase.auth.signInWithPassword({ email, password })`
   - En caso de error, muestra mensajes específicos según el código de error:
     - `"invalid login credentials"` → "Correo o contraseña incorrectos."
     - `"email not confirmed"` → "Debes confirmar tu correo antes de ingresar."
   - En caso de éxito, limpia los contadores de `sessionStorage` y navega a `/resumen`

2. **Autenticación Supabase**:
   - Motor: Supabase Auth (GoTrue) con email + contraseña
   - No se permite registro público: `"La creación de cuentas está restringida. Contacta al administrador del sistema."`
   - Las cuentas deben ser creadas por el administrador en el dashboard de Supabase

3. **Cliente Supabase (navegador)** (`client.ts`):
   - Usa `sessionStorage` (NO `localStorage`) para almacenar la sesión — cada pestaña del navegador mantiene su propia sesión de forma independiente
   - `storageKey` aleatorio por pestaña: evita que iniciar sesión como otro usuario en una pestaña afecte a las demás (usa `BroadcastChannel` isolation)
   - `autoRefreshToken: true` — la sesión se refresca automáticamente
   - `createSupabaseFetch()`: maneja correctamente las nuevas API keys de Supabase (que son strings opacos, no JWTs)

4. **Proveedor de Autenticación** (`use-auth.tsx`):
   - `AuthProvider`: envuelve toda la aplicación, provee `session`, `user`, `profile`, `role`, `loading`, `signOut()`, `refresh()`
   - Al cargar la sesión, consulta 3 tablas en paralelo:
     1. `profiles`: perfil del usuario (nombre, sucursal, unidad, is_admin)
     2. `user_roles`: roles asignados al usuario
     3. `profile_unidades_negocio`: unidades de negocio adicionales (para gerentes comerciales multi-unidad)
   - Resuelve el rol del usuario:
     - Si `is_admin === true`, el rol es `"gerencia"` (independientemente de `user_roles`)
     - Si no, toma el rol de mayor prioridad de `user_roles` (prioridad: gerencia > gerente_comercial > coordinador > asesor)
   - Timeout de 5 segundos: si Supabase no responde, `loading` se resuelve para no bloquear la UI
   - `signOut()`: limpia filtros compartidos (`clearSharedFilters()`) antes de cerrar sesión

### 3.2 Control de Sesión e Inactividad (`_app.tsx`)

- **Redirección por falta de sesión**: Si `loading` termina y no hay `session`, redirige a `/auth`
- **Detección de inactividad**: Monitorea eventos de usuario (mousemove, keydown, scroll, click, touchstart)
- **Timeout de inactividad**: 30 minutos (1,800,000 ms)
- **Diálogo de advertencia**: Cuenta regresiva de 30 segundos con `ShieldAlert`. Dos opciones:
  - "Mantener activa" — resetea el contador de inactividad
  - "Cerrar sesión" — ejecuta `signOut()` y redirige a `/auth`
- Si la cuenta regresiva llega a 0, cierra sesión automáticamente
- El contador persiste correctamente porque usa `useRef` y `useState` internos; el timer se limpia al desmontar

### 3.3 Mecanismos de Seguridad Implementados

| Mecanismo                                   | Implementación                                                                                                                                                            | Archivo                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **Row Level Security (RLS)**                | Habilitado en las 18 tablas. Políticas reconstruidas en la migración `20260712120200_harden_rls_policies.sql` con verificación estricta de roles y bypass para `is_admin` | `supabase/migrations/20260712120200_*.sql` |
| **Protección de columna is_admin**          | Trigger `protect_is_admin_column()` previene que usuarios sin rol `gerencia` se auto-otorguen admin                                                                       | `supabase/migrations/20260712120000_*.sql` |
| **Hardening de funciones SECURITY DEFINER** | Grants revocados para `public`/`anon`, solo `authenticated` puede ejecutar RPCs sensibles                                                                                 | `supabase/migrations/20260712120100_*.sql` |
| **Anti fuerza bruta en login**              | 5 intentos → bloqueo 15 minutos en el cliente (sessionStorage)                                                                                                            | `auth.tsx`                                 |
| **Cierre de sesión automático**             | Inactividad de 30 minutos → cierre automático                                                                                                                             | `_app.tsx`                                 |
| **Aislamiento de sesiones por pestaña**     | `sessionStorage` + `storageKey` aleatorio por pestaña                                                                                                                     | `client.ts`                                |
| **Autenticación de API en server**          | `client.server.ts` usa `SUPABASE_SERVICE_ROLE_KEY` solo en contexto server (NUNCA expuesto al cliente)                                                                    | `client.server.ts`                         |
| **Separación cliente/server**               | `client.ts` (publishable key + RLS) vs `client.server.ts` (service role + bypass RLS)                                                                                     | Ambos archivos                             |
| **Validación de variables de entorno**      | Ambos clientes validan que `SUPABASE_URL` y las keys existan al inicializar, lanzando error descriptivo si faltan                                                         | Ambos clientes                             |
| **Middleware de autenticación**             | `auth-middleware.ts` valida sesión en peticiones al servidor                                                                                                              | `auth-middleware.ts`                       |
| **Cookie de sesión**                        | `auth-attacher.ts` adjunta la cookie de sesión a las peticiones SSR                                                                                                       | `auth-attacher.ts`                         |

### 3.4 Middleware de Autenticación Server-Side

- **`auth-middleware.ts`**: Crea un cliente Supabase server-side por cada request. Extrae la cookie de sesión, valida el usuario, y adjunta `user` y `supabase` al contexto de la request de Nitro.
- **`auth-attacher.ts`**: En el cliente, antes de cada petición fetch, adjunta el access token de la sesión actual como header `Authorization: Bearer <token>` y como cookie `sb-access-token`.

---

## 4. SISTEMA DE ROLES Y PERMISOS

### 4.1 Roles Definidos

| Rol                   | Código              | Prioridad  | Alcance de Datos                                            | Propósito                                                                                                 |
| --------------------- | ------------------- | ---------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Gerencia Nacional** | `gerencia`          | 1 (máxima) | TODOS los datos, sin restricción                            | Dirección nacional: ve todas las sucursales, todas las unidades, todos los asesores                       |
| **Gerente Comercial** | `gerente_comercial` | 2          | `unidad_negocio_id` o `unidades_negocio_ids` (multi-unidad) | Responsable de una o varias líneas de negocio. Ve todas las sucursales pero filtrado por su(s) unidad(es) |
| **Coordinador**       | `coordinador`       | 3          | `sucursal_id`                                               | Responsable de una sucursal. Ve todas las unidades pero solo de su sucursal                               |
| **Asesor**            | `asesor`            | 4 (mínima) | `asesor_id` (solo sus propios registros)                    | Vendedor individual: solo ve sus cotizaciones, facturas, minutas                                          |

### 4.2 Resolución del Rol

La lógica de resolución en `use-auth.tsx` (`loadProfile`):

1. Consulta `profiles`, `user_roles` y `profile_unidades_negocio` en paralelo
2. Si `profiles.is_admin === true` → rol = `"gerencia"` (bypass total)
3. Si no, obtiene todos los roles de `user_roles` para el usuario
4. Busca el rol de mayor prioridad presente según el orden: `gerencia` > `gerente_comercial` > `coordinador` > `asesor`
5. Si no se encuentra ningún rol, `role` queda en `null` (sin acceso)

### 4.3 Matriz de Acceso a Módulos (Menú Lateral)

| Módulo                 | Ruta                 | Gerencia | Gerente Com. | Coordinador | Asesor |
| ---------------------- | -------------------- | -------- | ------------ | ----------- | ------ |
| Resumen Comercial      | `/resumen`           | Sí       | Sí           | Sí          | Sí     |
| Dashboard              | `/dashboard`         | Sí       | Sí           | Sí          | Sí     |
| Gerencia Nacional      | `/gerencia-nacional` | Sí       | Sí           | No          | No     |
| Embudo Comercial       | `/embudo`            | Sí       | Sí           | No          | No     |
| Análisis de Asesores   | `/asesores`          | Sí       | Sí           | Sí          | No     |
| Pareto (80/20)         | `/pareto`            | Sí       | Sí           | No          | No     |
| Cobranzas              | `/cobranzas`         | Sí       | Sí           | Sí          | Sí     |
| Minutas (lectura)      | `/minutas`           | Sí       | Sí           | Sí          | Sí     |
| Minutas (crear/editar) | `/minutas`           | Sí       | Sí           | Sí          | No     |
| Minutas (eliminar)     | `/minutas`           | Sí       | No           | No          | No     |
| Alertas                | `/alertas`           | Sí       | Sí           | Sí          | Sí     |
| Coordinador            | `/coordinador`       | No       | No           | Sí          | No     |
| Sucursal               | `/sucursal`          | No       | No           | Sí          | No     |
| Asesor Personal        | `/asesor`            | No       | No           | No          | Sí     |
| Servicios              | `/servicios`         | Sí       | Sí           | Sí          | No     |
| Repuestos              | `/repuestos`         | Sí       | Sí           | Sí          | No     |
| Lub/Filtros            | `/lubfiltros`        | Sí       | Sí           | Sí          | No     |
| Equipos                | `/equipos`           | Sí       | Sí           | Sí          | No     |
| Alquiler               | `/alquiler`          | Sí       | Sí           | Sí          | No     |
| Carga Excel            | `/carga`             | Sí       | No           | No          | No     |
| Gestión Usuarios       | `/usuarios`          | Sí       | No           | No          | No     |

### 4.4 Scoping de Datos por Rol (Data Scope)

La función `scoped()` en `data-scope.ts` aplica restricciones a nivel de query builder de Supabase:

| Rol                 | Columna Filtrada                             | Valor del Filtro                                                     | Efecto                                    |
| ------------------- | -------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------- |
| `gerencia`          | Ninguna                                      | —                                                                    | Sin restricción: ve TODOS los datos       |
| `gerente_comercial` | `unidad_negocio_id` (o columna configurable) | `IN (profile.unidades_negocio_ids)` o `EQ profile.unidad_negocio_id` | Solo datos de su(s) unidad(es) de negocio |
| `coordinador`       | `sucursal_id`                                | `EQ profile.sucursal_id`                                             | Solo datos de su sucursal                 |
| `asesor`            | `asesor_id` o `responsable_id`               | `EQ user.id`                                                         | Solo sus propios registros                |

**Doble capa de seguridad**: RLS en PostgreSQL + `scoped()` en el frontend. RLS es la defensa real; `scoped()` es una optimización UX que evita enviar datos que RLS de todos modos rechazaría.

### 4.5 Permisos de Acciones (Más Allá de Lectura)

| Acción                        | Gerencia | Gerente Com. | Coordinador | Asesor           |
| ----------------------------- | -------- | ------------ | ----------- | ---------------- |
| Ver todos los datos           | Sí       | No           | No          | No               |
| Filtrar por sucursal          | Sí       | No           | Sí          | No               |
| Filtrar por unidad de negocio | Sí       | Sí           | No          | No               |
| Exportar datos                | Sí       | Sí           | No          | No               |
| Editar pipeline (carga)       | Sí       | Sí           | Sí          | Sí (solo propio) |
| Ver cobranzas                 | Sí       | Sí           | Sí          | Sí               |
| Editar cobranzas              | Sí       | Sí           | Sí          | Sí (solo propio) |
| Ver minutas                   | Sí       | Sí           | Sí          | Sí               |
| Crear minutas                 | Sí       | Sí           | Sí          | Sí               |
| Gestionar usuarios            | Sí       | No           | No          | No               |
| Ver Pareto                    | Sí       | Sí           | No          | No               |

### 4.6 Implementación en el Frontend

**Menú lateral (`app-shell.tsx`)**: Filtra los items del sidebar usando `canAccessModule(role, module)`. Cada item tiene un `moduleKey` que se compara contra `MODULE_ACCESS`.

**Redirección por rol (`dashboard.tsx`)**:

```typescript
if (role === "gerencia" || role === "gerente_comercial") → /gerencia-nacional
if (role === "coordinador") → /coordinador
if (role === "asesor") → /asesor
```

**Protección de rutas**: Cada ruta verifica el rol y redirige si no tiene acceso. Aunque el sidebar ya filtra, un usuario podría intentar acceder por URL directa.

---

## 5. MÓDULOS DEL SISTEMA Y FLUJO DE DATOS

### 5.1 Módulo: Resumen Comercial (`/resumen`)

**Propósito**: Vista panorámica multi-unidad con KPIs principales y desglose por unidad de negocio.

**Componentes principales**:

- `FilterHeader`: Selector de mes(es), año y sucursal
- `KpiCards`: 6 tarjetas con KPIs principales
- `CotizacionesSection`: KPIs de cotizaciones + tabla de top clientes
- `FacturadoSection`: KPIs de facturación + desglose por unidad de negocio con barras de cumplimiento
- `VentasPerdidasSection`: KPIs de ventas perdidas + top razones

**Flujo de datos**:

1. Obtiene filtros compartidos (`useSharedFilters`)
2. Consulta `cotizaciones`, `facturas`, `ventas_perdidas` y `presupuestos` aplicando `scoped()`
3. Para facturación, la fuente de verdad es `presupuestos` (ventas_ccv + ventas_xibi + ventas_estrategicas), NO la tabla `facturas`
4. Agrupa por unidad de negocio (Servicios, Repuestos, Lub/Filtros, Equipos, Alquiler)
5. Calcula KPIs derivados: cumplimiento, márgenes, porcentajes de conversión y pérdida
6. Atajos de teclado: flechas para navegar meses, Escape para limpiar sucursal

**KPIs mostrados**:

- **Cotizado**: Suma de `cotizaciones.monto` (neto de repuestos)
- **Meta del Mes**: Suma de `presupuestos.monto`
- **Facturado**: Suma de `presupuestos.ventas_ccv + ventas_xibi + ventas_estrategicas`
- **Fact. vs Cotizado**: `(facturado / cotizado) * 100`
- **Cumplimiento Meta**: `(facturado / meta) * 100`
- **Margen Total**: Diferencia entre facturado y costo estimado
- **Margen %**: `(margen / facturado) * 100`
- **Ventas Perdidas**: Suma de `ventas_perdidas.monto`
- **Ventas Perdidas %**: `(perdido / cotizado) * 100`

### 5.2 Módulo: Gerencia Nacional (`/gerencia-nacional`)

**Propósito**: Dashboard de alto nivel para dirección nacional y gerentes comerciales. Visión consolidada de todas las sucursales.

**Componentes principales**:

- `ComplianceGauge`: Medidor circular de cumplimiento general
- KPIs destacados: mejor sucursal, sucursales bajo 70%, unidad más fuerte, unidad más débil
- `UnitDonut`: Distribución de ventas por unidad de negocio (gráfico de dona)
- `UnitMetaVsVenta`: Barras agrupadas: meta vs venta por unidad
- `BranchRanking`: Ranking horizontal de sucursales por cumplimiento
- `BranchSummaryTable`: Tabla resumen con facturado, presupuesto, cumplimiento, margen por sucursal
- `UnitHeatmapMatrix`: Matriz de calor: sucursales × unidades de negocio con tonalidades por nivel de cumplimiento
- `SegmentedToggle`: Toggle para cambiar entre vista mensual y anual

**Flujo de datos**:

1. Consulta `presupuestos`, `facturas`, `cotizaciones` con scope apropiado
2. Gerencia: sin restricción (todas las sucursales y unidades)
3. Gerente comercial: filtrado por `unidades_negocio_ids`
4. Agrupa por sucursal y unidad de negocio para construir el heatmap
5. Calcula cumplimiento por sucursal + ranking

### 5.3 Módulo: Coordinador (`/coordinador`)

**Propósito**: Panel financiero detallado para el coordinador de sucursal. Charts especializados por unidad de negocio.

**Componentes principales** (8 charts):

- `ComplianceGauge`: Cumplimiento general con gauge circular
- `UnitDonut`: Distribución por unidad de negocio
- `CompanyTrendChart`: Línea de tendencia mensual
- `UnitAmountBars`: Barras de monto por unidad
- `GlobalMonthlyCombo`: Barras (presupuesto) + líneas (facturación) mensual
- `RepuestosAreaChart`: Gráfico de área para repuestos
- `ServiciosBarWithMarkers`: Barras con marcadores de servicios
- `LubFiltrosComboLines`: Líneas combinadas de Lub/Filtros
- `EquiposAlquilerStacked`: Barras apiladas equipos + alquiler
- `ReceivablesTable`: Tabla de cuentas por cobrar

**Flujo de datos**:

1. Scope: `sucursal_id = profile.sucursal_id`
2. Usa `useDeferredValue` para optimizar rendimiento de gráficos (renderizado diferido)
3. Consulta datos de facturación, presupuestos, cobranzas y cumplimiento de asesores
4. Cada chart consume sus datos de queries independientes con React Query para cacheo

### 5.4 Módulo: Embudo Comercial (`/embudo`)

**Propósito**: Visualizar el pipeline Cotizado → Facturado → Cobrado con tasas de conversión.

**Lógica de cálculo** (`src/lib/analytics/funnel.ts`):

El embudo tiene dos modos de cálculo:

**KPI Total (`computeFunnelTotals`)**:

- **Cotizado**: Suma de `cotizaciones.monto` (YA neto de repuestos por el parser)
- **Facturado**: Suma de `presupuestos.ventas_ccv + ventas_xibi + ventas_estrategicas` (fuente de verdad consistente con resumen.tsx)
- **Cobrado**: `facturado − saldo_total_cobranzas` (máximo 0)
- **Tasa de Conversión**: `(facturado / cotizado) × 100`
- **Tasa de Cobro**: `(cobrado / facturado) × 100`

**Desglose por Cliente/Asesor (`computeFunnel`)**:

- Match entre fuentes por `cliente` (normalizado: lowercase, sin acentos, trim) o `asesor`
- Para asesores: resuelve `asesor_codigo` de cotizaciones contra `asesor` de facturas usando `asesorCodigoToNombre`
- El cobrado por cliente se estima como `facturado − saldo` de cobranzas para ese cliente
- Clasifica por dimensión y ordena por facturado descendente

**Componentes**:

- KPI cards para cada etapa (Cotizado, Facturado, Cobrado)
- Gráfico de tendencia mensual con períodos resaltados
- Gráfico de tasa de conversión
- Tabla detallada mensual

### 5.5 Módulo: Análisis de Asesores (`/asesores`)

**Propósito**: Ranking, cumplimiento y análisis de los 32 asesores comerciales.

**Lógica** (`src/lib/analytics/asesores.ts`):

1. Catálogo de 32 asesores canónicos (`asesores-catalogo.ts`): cada asesor tiene código único, nombre, sucursal asignada
2. "Ventas Casa": bucket para transacciones que no coinciden con ningún asesor del catálogo
3. Sistema de aliases: nombres alternativos de asesores en los datos se resuelven al asesor canónico
4. Para cada asesor se calcula:
   - **Venta**: suma de `facturas.monto`
   - **Meta**: suma de `cumplimiento_asesores.presupuesto`
   - **Cotizado**: suma de `cotizaciones.monto`
   - **Perdido**: suma de `ventas_perdidas.monto`
   - **Cumplimiento**: `(venta / meta) × 100` (0 si no hay meta)
   - **Conversión**: `(venta / cotizado) × 100`
   - **Participación**: `(venta / total_venta_general) × 100`

**KPIs agregados (`calcularKPIs`)**:

- **Facturado asesores**: Suma de ventas de los 32 asesores (excluye Ventas Casa)
- **Facturado Ventas Casa**: Suma de ventas no atribuibles a asesores
- **Cumplimiento promedio**: `(suma_ventas_con_meta / suma_metas) × 100`
- **Asesores sobre meta**: Count de asesores con `venta >= meta`

**Componentes**:

- KPI cards (facturado asesores, Ventas Casa, cumplimiento prom., asesores sobre meta)
- Tabla de ranking con todas las métricas por asesor
- Pestaña de Pareto: distribución 80/20 del esfuerzo de ventas
- Modal drill-down: tendencia mensual del asesor, últimas cotizaciones, razones de pérdida

### 5.6 Módulo: Pareto (`/pareto`)

**Propósito**: Análisis 80/20 para identificar los clientes/productos que generan el 80% del valor.

**Lógica** (`src/lib/analytics/pareto.ts`):

1. Agrupa datos por clave (cliente, producto, etc.)
2. Ordena descendente por monto
3. Calcula porcentaje acumulado
4. Clasifica en categorías:
   - **A** (vitales): acumulado ≤ 80%
   - **B** (importantes): acumulado ≤ 95%
   - **C** (triviales): acumulado > 95%
5. Calcula:
   - `top20Count`: 20% superior de los items
   - `top20Share`: porcentaje que representa el top 20%
   - `vitales`: cantidad de items que llegan al 80% acumulado

**Componentes**:

- Gráfico de barras + línea acumulada
- Tabla clasificada A/B/C
- KPIs: total general, concentración top 20%, cantidad de vitales

### 5.7 Módulo: Cobranzas (`/cobranzas`)

**Propósito**: Seguimiento de cuentas por cobrar y cartera vencida.

**Componentes**:

- KPI: monto total en cartera, saldo pendiente, % cobrado
- Gráfico de barras: monto facturado vs saldo pendiente por sucursal
- Tabla de cuentas con búsqueda por cliente, filtro por rango de días de vencimiento
- Clasificación visual: saldo vencido resaltado en color danger

**Flujo de datos**:

1. Consulta `cobranzas` con scope por rol
2. Calcula días de vencimiento: `diasEntre(fecha_vencimiento, today)`
3. Filtra y ordena por monto/saldo descendente

### 5.8 Módulo: Minutas (`/minutas`)

**Propósito**: Gestión de notas de seguimiento comercial. CRUD completo con control de autoría.

**Componentes**:

- Tabla de minutas con filtros por estado, responsable, cliente
- Formulario modal para crear/editar (React Hook Form + Zod)
- Filtro por rango de fechas

**Permisos de escritura**:

- **Crear**: Todos los roles
- **Editar**: gerencia, gerente_comercial, coordinador
- **Eliminar**: SOLO gerencia
- **Asesor**: solo lectura de sus propias minutas

**Campos del formulario**:

- `cliente` (TEXT, required)
- `descripcion` (TEXT, required)
- `responsable` (TEXT, required)
- `fecha_limite` (DATE, optional)
- `estado` (ENUM: pendiente, en_proceso, cumplido)

### 5.9 Módulo: Alertas (`/alertas`)

**Propósito**: Sistema de notificaciones y alertas basadas en reglas de negocio.

**Tipos de alertas generadas**:

- **Cumplimiento**: sucursales o asesores bajo el umbral (configurable)
- **Vencimiento**: minutas con fecha límite próxima o vencida
- **Cobranzas**: cuentas con alto nivel de morosidad
- **Desviaciones**: cambios significativos vs período anterior

**Implementación**:

- Las alertas se calculan en el frontend a partir de los datos ya cargados (no hay tabla de alertas)
- Se muestran como tarjetas con iconos de severidad y acciones sugeridas
- Filtrables por tipo y severidad

### 5.10 Módulo: Carga de Excel (`/carga`)

**Propósito**: Interfaz para que gerencia suba manualmente el archivo `CCV Rendimiento.xlsx`.

**Flujo**:

1. File input para seleccionar el archivo .xlsx
2. Preview de las hojas detectadas y conteo de filas
3. Botón "Cargar datos" que ejecuta el pipeline:
   - `ExcelParser` parsea el archivo
   - `load-excel.ts` inserta en Supabase via `supabaseAdmin`
4. Barra de progreso por cada tipo de dato
5. Resumen final: filas insertadas por tabla, errores si los hay

**Acceso**: Exclusivo para `gerencia`.

### 5.11 Módulo: Usuarios (`/usuarios`)

**Propósito**: Gestión de usuarios, perfiles y roles. Solo accesible por gerencia.

**Funcionalidades**:

- Lista de usuarios con sus perfiles y roles
- Asignación/revocación de roles
- Edición de sucursal y unidad de negocio asignadas
- Opción de toggle `is_admin`

**Acceso**: Exclusivo para `gerencia`.

### 5.12 Módulo: Sucursal (`/sucursal`)

**Propósito**: Dashboard de rendimiento a nivel sucursal. Solo para coordinador.

**Componentes**:

- KPI cards: cumplimiento, variación, días adelantado/atrasado, totales
- Gráfico compuesto: barras de venta mensual × línea de presupuesto
- Panel resumen: totales YTD, comparación vs año anterior
- Filtros: sucursal, unidad de negocio

### 5.13 Módulo: Asesor Personal (`/asesor`)

**Propósito**: Vista individual del asesor. Solo accesible por el rol asesor.

**Componentes**:

- KPI cards personales: venta YTD, cumplimiento, ranking, cotizado, perdido
- Gráfico de tendencia mensual personal
- Tabla de últimas cotizaciones
- Tabla de razones de pérdida

---

## 6. DASHBOARDS, KPIs Y GRÁFICOS

### 6.1 Librería de Gráficos

**Recharts** v3.8.0 — librería principal para todos los gráficos del dashboard. Basada en React y D3.

### 6.2 KPIs Calculados en el Sistema

#### KPIs Globales (Resumen)

| KPI                         | Fórmula                                                         | Fuente de Datos   | Formato      |
| --------------------------- | --------------------------------------------------------------- | ----------------- | ------------ |
| **Cotizado Total**          | Σ `cotizaciones.monto`                                          | `cotizaciones`    | Currency ($) |
| **Meta del Mes**            | Σ `presupuestos.monto`                                          | `presupuestos`    | Currency ($) |
| **Facturado Total**         | Σ `presupuestos.ventas_ccv + ventas_xibi + ventas_estrategicas` | `presupuestos`    | Currency ($) |
| **Facturado vs Cotizado %** | `(facturado / cotizado) × 100`                                  | Derivado          | Percentage   |
| **Cumplimiento Meta %**     | `(facturado / meta) × 100`                                      | Derivado          | Percentage   |
| **Margen Total**            | `facturado − costo_estimado`                                    | Derivado          | Currency ($) |
| **Margen %**                | `(margen / facturado) × 100`                                    | Derivado          | Percentage   |
| **Ventas Perdidas**         | Σ `ventas_perdidas.monto`                                       | `ventas_perdidas` | Currency ($) |
| **Ventas Perdidas %**       | `(perdido / cotizado) × 100`                                    | Derivado          | Percentage   |

#### KPIs del Embudo

| KPI                    | Fórmula                               | Nota                     |
| ---------------------- | ------------------------------------- | ------------------------ |
| **Tasa de Conversión** | `(facturado / cotizado) × 100`        | 0% si cotizado = 0       |
| **Tasa de Pérdida**    | `(perdido / cotizado) × 100`          |                          |
| **Tasa de Cobro**      | `(cobrado / facturado) × 100`         | 100% si facturado = 0    |
| **Cobrado**            | `max(0, facturado − saldo_cobranzas)` | Estimación sin histórico |

#### KPIs de Asesores

| KPI                         | Fórmula                               |
| --------------------------- | ------------------------------------- |
| **Cumplimiento Individual** | `(venta / presupuesto) × 100`         |
| **Conversión Individual**   | `(venta / cotizado) × 100`            |
| **Participación**           | `(venta / total_venta_general) × 100` |
| **Cumplimiento Promedio**   | `(Σ ventas_con_meta / Σ metas) × 100` |
| **Asesores Sobre Meta**     | Count donde `venta ≥ presupuesto`     |

#### KPIs de Sucursal

| KPI                               | Fórmula                                             |
| --------------------------------- | --------------------------------------------------- |
| **Cumplimiento Sucursal**         | `(facturado_sucursal / presupuesto_sucursal) × 100` |
| **Variación vs Período Anterior** | `((actual − anterior) / anterior) × 100`            |
| **Participación Sucursal**        | `(facturado_sucursal / facturado_total) × 100`      |

#### KPIs de Unidad de Negocio

| KPI                     | Fórmula                                                  |
| ----------------------- | -------------------------------------------------------- |
| **Cumplimiento por UN** | `(facturado_un / presupuesto_un) × 100`                  |
| **Participación UN**    | `(facturado_un / facturado_total) × 100`                 |
| **Margen Estimado UN**  | Diferencia entre monto facturado y costo estimado por UN |

### 6.3 Clasificación de KPIs por Estado

La función `statusFromPct(p)` asigna colores semánticos:

| Rango       | Estado    | Color | Significado                       |
| ----------- | --------- | ----- | --------------------------------- |
| `≥ 100%`    | `success` | Verde | Cumplimiento alcanzado o superado |
| `70% – 99%` | `warning` | Ámbar | En progreso, atención requerida   |
| `< 70%`     | `danger`  | Rojo  | Alerta: muy por debajo de la meta |

Para heatmaps y rankings de cumplimiento, se usa `statusFromPct90(p)` con umbral de 90% en lugar de 100%.

### 6.4 Tipos de Gráficos Implementados

| Tipo de Gráfico                       | Componente(s)                                   | Librería                                | Datos que Consume                         | Qué Representa                                                |
| ------------------------------------- | ----------------------------------------------- | --------------------------------------- | ----------------------------------------- | ------------------------------------------------------------- |
| **Gauge Circular**                    | `ComplianceGauge`                               | Recharts (Pie)                          | Porcentaje de cumplimiento                | Cumplimiento general en formato radial con aguja              |
| **Dona (Donut)**                      | `UnitDonut`                                     | Recharts (Pie, innerRadius)             | Montos por unidad de negocio              | Distribución porcentual del negocio por línea                 |
| **Barras Agrupadas**                  | `UnitAmountBars`, `UnitMetaVsVenta`             | Recharts (Bar)                          | Montos agrupados por categoría            | Comparación lado a lado (meta vs venta, sucursal vs sucursal) |
| **Barras Apiladas**                   | `EquiposAlquilerStacked`                        | Recharts (Bar, stackId)                 | Montos de equipos + alquiler              | Composición de dos categorías relacionadas                    |
| **Barras + Línea**                    | `GlobalMonthlyCombo`, `ServiciosBarWithMarkers` | Recharts (ComposedChart con Bar + Line) | Barras = presupuesto, Línea = facturación | Comparación meta vs real con tendencia                        |
| **Línea Simple**                      | `CompanyTrendChart`                             | Recharts (Line)                         | Una serie temporal                        | Evolución mensual de una métrica                              |
| **Líneas Múltiples**                  | `LubFiltrosComboLines`                          | Recharts (Line × N)                     | Múltiples series temporales               | Comparación de tendencias entre categorías                    |
| **Área**                              | `RepuestosAreaChart`                            | Recharts (Area)                         | Serie temporal con relleno                | Volumen acumulado y tendencia                                 |
| **Heatmap / Matriz**                  | `UnitHeatmapMatrix`                             | Custom (CSS Grid + colores)             | Cumplimiento por sucursal × unidad        | Mapa de calor bidimensional con escala de color               |
| **Ranking Horizontal**                | `BranchRanking`                                 | Custom (barras horizontales CSS)        | Cumplimiento por sucursal                 | Ranking visual de mejor a peor desempeño                      |
| **Pareto (Barras + Línea Acumulada)** | Pareto chart en `pareto.tsx`                    | Recharts (Composed)                     | Items ordenados + línea acumulada         | Análisis 80/20 con clasificación A/B/C                        |
| **Radar / Scorecard**                 | Advisor scorecard en `coordinador.tsx`          | Recharts (Radar)                        | Métricas multi-eje por asesor             | Perfil de desempeño multidimensional                          |

### 6.5 Funciones de Cálculo de KPIs (`kpi-calculations.ts`)

Todas las funciones son puras (sin efectos secundarios), tipadas y con JSDoc. Cubren:

| Función                                         | Entrada                    | Salida                                                   | Uso                          |
| ----------------------------------------------- | -------------------------- | -------------------------------------------------------- | ---------------------------- |
| `calcularCumplimiento(presupuesto, venta)`      | 2 numbers                  | `{ porcentaje, estado, variacion }`                      | Cálculo base de cumplimiento |
| `calcularPareto(datos, campo)`                  | Array de objetos, string   | `ParetoItem[]` con % individual, acumulado, flag esTop80 | Análisis 80/20               |
| `agruparPorSucursal(datos, campo, campoValor?)` | Array de objetos           | `GroupedResult[]` con total, promedio                    | Agrupación para gráficos     |
| `calcularVariacion(anterior, actual)`           | 2 numbers                  | `{ diferencia, porcentaje, tendencia }`                  | Variación inter-período      |
| `rankingAsesores(datos)`                        | Array de objetos con venta | `AsesoresRanking[]` ordenado                             | Ranking de desempeño         |
| `carteraVencida(cuentas, dias)`                 | Array + umbral             | `CuentaVencida[]` filtradas                              | Análisis de morosidad        |
| `calcularEstadisticas(valores)`                 | Number[]                   | `{ min, max, promedio, total, cantidad }`                | Estadísticas descriptivas    |
| `filtrarPorFecha(datos, inicio, fin)`           | Array + fechas             | Array filtrado                                           | Filtro temporal              |
| `calcularCrecimiento(anterior, posterior)`      | 2 Number[]                 | `{ porcentaje, estado }`                                 | Crecimiento inter-período    |

---

## 7. STACK TECNOLÓGICO Y DEPENDENCIAS

### 7.1 Tecnologías Core

| Tecnología          | Versión             | Rol en el Sistema                                                   |
| ------------------- | ------------------- | ------------------------------------------------------------------- |
| **React**           | 19.2.0              | Biblioteca UI. Se usa con Server Components, Suspense, lazy loading |
| **TypeScript**      | 5.8.3               | Tipado estático en todo el proyecto                                 |
| **TanStack Start**  | 1.168.26            | Full-stack framework: SSR, file-based routing, server functions     |
| **TanStack Router** | 1.170.16            | Router tipado con type-safety en rutas y parámetros                 |
| **TanStack Query**  | 5.101.1             | Gestión de estado del servidor, cacheo, refetching                  |
| **Vite**            | 8.0.16              | Build tool y dev server con HMR                                     |
| **Nitro**           | 3.0.260610-beta     | Servidor de producción (adaptador Node)                             |
| **Bun**             | (gestor)            | Runtime y package manager para desarrollo y scripts                 |
| **Supabase**        | 2.110.0 (js client) | Backend: PostgreSQL, Auth, RLS, PostgREST                           |
| **Tailwind CSS**    | 4.2.1               | Utility-first CSS con plugin de Vite                                |
| **shadcn/ui**       | (componentes)       | 62 componentes UI pre-construidos sobre Radix UI                    |

### 7.2 Librerías de UI y Componentes

| Librería                   | Versión              | Propósito                                                                                |
| -------------------------- | -------------------- | ---------------------------------------------------------------------------------------- |
| **@radix-ui/react-\***     | Varias (27 paquetes) | Primitivas accesibles: accordion, dialog, dropdown, popover, select, tabs, tooltip, etc. |
| **@base-ui/react**         | 1.6.0                | Componentes base accesibles adicionales                                                  |
| **lucide-react**           | 0.575.0              | Sistema de iconos (900+ iconos SVG)                                                      |
| **sonner**                 | 2.0.7                | Notificaciones toast                                                                     |
| **next-themes**            | 0.4.6                | Tema claro/oscuro                                                                        |
| **cmdk**                   | 1.1.1                | Command palette / combobox con búsqueda                                                  |
| **input-otp**              | 1.4.2                | Campo de entrada para códigos OTP                                                        |
| **embla-carousel-react**   | 8.6.0                | Carousel accesible                                                                       |
| **vaul**                   | 1.1.2                | Drawer/sheet animado                                                                     |
| **react-resizable-panels** | 4.6.5                | Paneles redimensionables                                                                 |

### 7.3 Visualización de Datos

| Librería               | Versión | Propósito                                                      |
| ---------------------- | ------- | -------------------------------------------------------------- |
| **recharts**           | 3.8.0   | Charts: Bar, Line, Area, Pie, Composed, Radar, Tooltip, Legend |
| **@react-three/fiber** | 9.0.0   | Renderizado 3D con Three.js en React                           |
| **@react-three/drei**  | 10.0.0  | Helpers para react-three-fiber                                 |
| **three**              | 0.170.0 | Motor 3D WebGL (para el logo 3D)                               |

### 7.4 Formularios y Validación

| Librería                | Versión | Propósito                               |
| ----------------------- | ------- | --------------------------------------- |
| **react-hook-form**     | 7.71.2  | Formularios con rendimiento optimizado  |
| **@hookform/resolvers** | 5.2.2   | Integración con Zod para validación     |
| **zod**                 | 3.24.2  | Validación de esquemas TypeScript-first |

### 7.5 Utilidades

| Librería                     | Versión      | Propósito                                               |
| ---------------------------- | ------------ | ------------------------------------------------------- |
| **date-fns**                 | 4.1.0        | Manipulación de fechas (alternativa ligera a moment)    |
| **clsx**                     | 2.1.1        | Construcción condicional de clases CSS                  |
| **tailwind-merge**           | 3.5.0        | Merge inteligente de clases Tailwind (evita conflictos) |
| **class-variance-authority** | 0.7.1        | Variantes de componentes con TypeScript                 |
| **xlsx**                     | 0.20.3 (CDN) | Lectura/escritura de archivos Excel (SheetJS)           |
| **vite-tsconfig-paths**      | 6.0.2        | Resolución de paths de TypeScript en Vite               |

### 7.6 Desarrollo y Testing

| Herramienta              | Versión | Propósito                              |
| ------------------------ | ------- | -------------------------------------- |
| **vitest**               | 3.2.7   | Test runner (compatible con Vite)      |
| **eslint**               | 9.32.0  | Linting de TypeScript/React            |
| **typescript-eslint**    | 8.56.1  | Reglas de ESLint para TypeScript       |
| **prettier**             | 3.7.3   | Formateo de código                     |
| **@vitejs/plugin-react** | 5.2.0   | Soporte React para Vite (Fast Refresh) |
| **@tailwindcss/vite**    | 4.2.1   | Plugin de Tailwind CSS para Vite       |

### 7.7 Fuentes

| Fuente                     | Versión | Uso                                                |
| -------------------------- | ------- | -------------------------------------------------- |
| **Inter Variable**         | 5.2.8   | Tipografía principal (sans-serif)                  |
| **Space Grotesk Variable** | 5.2.10  | Tipografía display (títulos, headings)             |
| **JetBrains Mono**         | 5.2.8   | Tipografía monoespaciada (datos tabulares, código) |

### 7.8 Dependencias de Dominio

| Dependencia            | Descripción                                                                                                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CCV Rendimiento.xlsx` | Archivo Excel fuente con TODOS los datos comerciales. Contiene hojas separadas para cada tipo de dato: cotizaciones, facturas, cobranzas, presupuestos, cumplimiento_asesores, ventas_perdidas, servicios, equipos, inventario, etc. |
| Supabase Project       | Proyecto Supabase con PostgreSQL, Auth y Storage. Las credenciales están en `.env` y `.env.local`                                                                                                                                    |

### 7.9 CI/CD

| Herramienta        | Archivo                                   | Propósito                                                                                                                                                 |
| ------------------ | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GitHub Actions** | `.github/workflows/weekly-excel-load.yml` | Carga automática semanal del Excel cada viernes a las 5 AM hora de Caracas. Descarga el archivo, instala dependencias con Bun, ejecuta el script de carga |

### 7.10 Configuración de Vite

El archivo `vite.config.ts` contiene:

```typescript
{
  plugins: [tailwindcss(), tanstackStart({ server: { entry: "server" }, target: "node-server" }), viteReact(), serveLogoGlb()],
  optimizeDeps: {
    entries: ["index.html"],
    include: ["@tanstack/react-query", "@supabase/supabase-js", "lucide-react", "recharts", "clsx", "tailwind-merge", "sonner", "zustand", "use-sync-external-store", "use-sync-external-store/shim/with-selector.js"],
    exclude: ["three", "xlsx", "@react-three/fiber", "@react-three/drei"]
  },
  ssr: { noExternal: ["use-sync-external-store"] },
  server: { watch: { ignored: [...] } }
}
```

**Nota sobre el plugin `serveLogoGlb`**: Plugin Vite personalizado que sirve el archivo `logo_3D.glb` desde el sistema de archivos local a través del middleware de Connect del dev server. Esto evita tener que copiar el archivo a `public/` y permite servirlo con los headers MIME correctos (`model/gltf-binary`).

---

## 8. NOTAS ADICIONALES

### 8.1 Drift de Base de Datos (Estado Actual)

Existen divergencias documentadas entre las migraciones SQL y el esquema real en producción:

1. **`cotizaciones.asesor`**: La migración inicial declara `asesor TEXT`, pero la tabla real NO tiene esta columna. Solo existen `asesor_codigo` y `asesor_id`.
2. **Enum `cotizacion_etapa`**: Los valores reales difieren de la migración inicial (ver sección 2.2).
3. **`cobranzas_snapshots`**: La migración existe pero NO está aplicada en producción. Es la base para el histórico de cartera (Fase 2 del plan de expansión).
4. **`docs/supabase-schema.sql`**: Archivo obsoleto. La fuente de verdad es `docs/SCHEMA.md` y `src/integrations/supabase/types.ts`.

### 8.2 Plan de Expansión (PLAN-EXPANSION.md)

El proyecto tiene fases planificadas:

- **Fase 1 (completada)**: Dashboards base, autenticación, roles, carga de Excel
- **Fase 2 (pendiente)**: Histórico de cartera (requiere aplicar migración `cobranzas_snapshots`), forecasting, exportación avanzada

### 8.3 Estados de Carga y Manejo de Errores

- **Skeleton loading**: Implementado en `resumen.tsx` y otros módulos usando `Skeleton` de shadcn/ui durante queries
- **Estados vacíos**: Componente `Empty` con icono, título y descripción cuando no hay datos
- **Manejo de errores**: `ErrorComponent` en `__root.tsx` con botón de reintento; `error-capture.ts` para captura estructurada; toast de error via `sonner`
- **Timeout de carga**: `useAuth` tiene timeout de 5 segundos para evitar bloqueo si Supabase no responde

### 8.4 Accesibilidad y Atajos de Teclado

- **Atajos en Resumen**: Flechas izquierda/derecha para cambiar mes, Escape para limpiar filtro de sucursal
- **TooltipProvider**: delay de 200ms para mejorar experiencia en dispositivos táctiles
- **Navegación por teclado**: Los componentes Radix UI incluyen soporte de teclado por defecto

### 8.5 Convenciones de Código

- **No comentarios**: El código no contiene comentarios (por convención del proyecto)
- **Idioma**: Nombres de variables, funciones y UI en español (es-VE)
- **Formateo**: Prettier con `printWidth: 100`, comillas dobles, trailing commas
- **Tipos**: TypeScript estricto. Tipos de BD autogenerados desde el esquema de Supabase
- **Rutas**: File-based routing de TanStack Router. `routeTree.gen.ts` es autogenerado — NO EDITAR
- **Componentes UI**: `src/components/ui/` contiene componentes shadcn/ui generados — NO EDITAR manualmente

---

## 9. DIAGRAMA DE ARQUITECTURA GENERAL

```
┌──────────────────────────────────────────────────────────────────┐
│                        CLIENTE (Navegador)                       │
│                                                                  │
│  ┌──────────┐  ┌────────────┐  ┌──────────────┐                │
│  │ React 19 │  │ TanStack   │  │ TanStack     │                │
│  │ + Vite   │  │ Router     │  │ Query        │                │
│  └────┬─────┘  └─────┬──────┘  └──────┬───────┘                │
│       │              │               │                          │
│  ┌────┴──────────────┴───────────────┴───────┐                  │
│  │         Supabase Client (client.ts)        │                  │
│  │    publishable key + RLS + sessionStorage  │                  │
│  └────────────────────┬──────────────────────┘                  │
└───────────────────────┼──────────────────────────────────────────┘
                        │ HTTPS (PostgREST + Auth)
┌───────────────────────┼──────────────────────────────────────────┐
│                  SUPABASE CLOUD                                  │
│  ┌────────────────────┴──────────────────────┐                  │
│  │              PostgREST API                │                  │
│  │         (auto-generado desde schema)      │                  │
│  └────────────────────┬──────────────────────┘                  │
│  ┌────────────────────┴──────────────────────┐                  │
│  │           PostgreSQL + RLS                │                  │
│  │  18 tablas · 3 enums · 4 funciones        │                  │
│  │  RLS habilitado en todas las tablas        │                  │
│  └────────────────────┬──────────────────────┘                  │
│  ┌────────────────────┴──────────────────────┐                  │
│  │           GoTrue (Auth)                    │                  │
│  │   email/password · JWT · refresh tokens   │                  │
│  └───────────────────────────────────────────┘                  │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                SERVIDOR (Node + Nitro)                            │
│                                                                  │
│  ┌──────────────────────────────────────┐                       │
│  │  Supabase Admin (client.server.ts)    │                       │
│  │  service role key · bypass RLS        │                       │
│  │  USO: carga Excel, operaciones admin  │                       │
│  └──────────────────────────────────────┘                       │
│                                                                  │
│  ┌──────────────────────────────────────┐                       │
│  │  Server Functions (TanStack Start)    │                       │
│  │  auth-middleware · auth-attacher      │                       │
│  └──────────────────────────────────────┘                       │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│             DATOS EXTERNOS                                        │
│                                                                  │
│  ┌─────────────────────────────┐                                │
│  │  CCV Rendimiento.xlsx       │                                │
│  │  (archivo Excel fuente)     │                                │
│  └──────────┬──────────────────┘                                │
│             │                                                    │
│  ┌──────────┴──────────────────┐                                │
│  │  GitHub Actions (viernes)   │                                │
│  │  weekly-excel-load.yml      │                                │
│  │  + carga manual (UI /carga) │                                │
│  └─────────────────────────────┘                                │
└──────────────────────────────────────────────────────────────────┘
```

---

**Fin del documento MASTER_README.md**

_Documento generado por análisis exhaustivo del código fuente. Julio 2026._
