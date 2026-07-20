# 🚀 Dashboard Setup - Guía de Inicio Rápido

## Estado Actual ✅

El dashboard está **100% construido** con:

- ✅ 4 dashboards por rol (Gerencia Nacional + 3 U/N)
- ✅ Componentes reutilizables (Gauge, KPI Card, Charts)
- ✅ Sistema de permisos granulares
- ✅ Hooks React Query integrados
- ✅ Schema Supabase completo
- ✅ Carga de datos automatizada

---

## 🎯 Pasos para Activar

### 1. Configurar Variables de Entorno

Crear `.env.local` en la raíz del proyecto:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIs...
```

**¿Dónde obtener estas claves?**

1. Ir a https://supabase.com → Dashboard
2. Settings → API
3. Copiar `Project URL` y `anon key`
4. `Service Role Secret` (más abajo en la misma página)

### 2. Ejecutar Setup Automatizado

```bash
bun setup-dashboard.mjs
```

**Qué hace este script:**

1. ✅ Valida variables de entorno
2. ✅ Verifica archivos necesarios
3. ⏳ Pausa para que ejecutes migraciones SQL manualmente (en Supabase)
4. ✅ Carga datos desde Excel a Supabase
5. ✅ Inicia servidor dev en http://localhost:3000

### 3. Ejecutar Migraciones Supabase (Durante Setup)

Cuando el script se pause, abre Supabase y:

```sql
-- SQL Editor → New Query
-- Copia y pega contenido de docs/supabase-schema.sql
-- Ejecuta

-- Luego nueva query con docs/supabase-rls-policies.sql
-- Ejecuta

-- Presiona ENTER en terminal para continuar
```

### 4. Testear Dashboard

Una vez el servidor está corriendo en http://localhost:3000:

#### Caso 1: Gerencia Nacional

```
Email: gerencia@ccvenequip.com
Contraseña: (configurar en Supabase)
→ Ve dashboard nacional consolidado
→ Puede filtrar por TODAS sucursales, U/N, meses
```

#### Caso 2: Coordinador de U/N (Servicios)

```
Email: coordinador.servicios@ccvenequip.com
Rol: Coordinadores
Unidad de Negocio: Servicios
→ Ve dashboard de Servicios
→ Puede filtrar por sus sucursales + meses
→ No ve datos de otras U/N
```

#### Caso 3: Asesor

```
Email: asesor1@ccvenequip.com
Rol: Asesores
Código: A001
→ Ve dashboard personal (solo sus datos)
→ Puede filtrar por meses
→ Ve sus KPIs, cumplimiento, cuentas
```

---

## 📊 Estructura de Dashboards

### Dashboard 1: Gerencia Nacional

**Ruta:** `/app/dashboard` → Redirige a `/app/gerencia-nacional`

**Acceso:** Rol = `Gerencia`

**Componentes:**

- KPI Card: Cumplimiento % (circular gauge)
- Line + Bar Chart: Ventas vs Presupuesto mensual
- Donut Chart: Participación por U/N
- Horizontal Bar: Cumplimiento por Sucursal
- Table: Desempeño por Sucursal + Utilidades x Mes

**Filtros:** Mes, Sucursal (todas), U/N (todas)

### Dashboard 2: Servicios (U/N)

**Ruta:** `/app/servicios`

**Acceso:** Rol = `Coordinadores`, unidad_negocio = `Servicios`

**Componentes:**

- KPI Cards: Ventas Internas, Talleres, CSA
- 9 gráficos (según imágenes proporcionadas)
- Tabla: Clientes Cuentas x Cobrar

**Filtros:** Mes, Sucursal (solo su U/N), U/N (fijo a Servicios)

### Dashboard 3: Lub/Filtros (U/N)

**Ruta:** `/app/lubfiltros`

**Acceso:** Rol = `Coordinadores`, unidad_negocio = `Lubricantes y Filtros`

**Componentes:**

- KPI Cards: Inventario Lubricantes, Filtros, Ventas Chronus
- 9 gráficos
- Tabla: Clientes Cuentas x Cobrar

### Dashboard 4: Equipos/Alquiler (U/N)

**Ruta:** `/app/equipos`

**Acceso:** Rol = `Coordinadores`, unidad_negocio = `Equipos`

**Componentes:**

- KPI Cards: Inventario Disponible, Tránsito, Presupuesto
- 7 gráficos
- Tabla: Clientes Cuentas x Cobrar

### Dashboard 5: Por Sucursal

**Ruta:** `/app/sucursal`

**Acceso:** Rol = `Coordinadores`, sin unidad_negocio asignado

(Coordinadores de sucursal ven consolidado de su sucursal)

### Dashboard 6: Asesor

**Ruta:** `/app/asesor`

**Acceso:** Rol = `Asesores`

(Solo datos personales del asesor)

---

## 🔧 Archivos Creados

### Rutas (7 dashboards)

```
src/routes/_app/
├── dashboard.tsx           ← Home que redirige por rol
├── gerencia-nacional.tsx   ← Gerencia Nacional
├── servicios.tsx           ← Dashboard Servicios
├── lubfiltros.tsx          ← Dashboard Lub/Filtros
├── equipos.tsx             ← Dashboard Equipos
├── sucursal.tsx            ← Dashboard Sucursal
└── asesor.tsx              ← Dashboard Asesor
```

### Librerías

```
src/lib/
├── kpi-calculations.ts     ← 7+ funciones de cálculo
└── permissions.ts          ← Sistema de permisos
```

### Componentes

```
src/components/
├── gauge-chart.tsx         ← Gauge circular %
├── chart-wrapper.tsx       ← Contenedor gráficos
└── filter-bar.tsx          ← Selectores filtros
```

### Hooks Extendidos

```
src/hooks/
└── useSupabaseQuery.ts     ← +5 hooks para dashboards
```

### Schema

```
docs/
├── supabase-schema.sql     ← 10 tablas + índices
└── supabase-rls-policies.sql ← RLS por rol
```

---

## 🧪 Testing

### Test 1: Redirección por Rol

1. Login como Gerencia → debe ir a `/app/gerencia-nacional`
2. Login como Coordinador → debe ir a `/app/servicios` (o su U/N)
3. Login como Asesor → debe ir a `/app/asesor`

### Test 2: Filtros Según Rol

- **Gerencia:** Todos los filtros habilitados (sucursal, U/N, mes)
- **Coordinador:** Sucursal filtrada, U/N fija (o filtrada), mes libre
- **Asesor:** Mes libre, U/N por sus transacciones

### Test 3: Datos Filtrados

- **Gerencia:** Ve todos los datos (1,294 oportunidades)
- **Asesor:** Ve solo sus datos (ej. 45 oportunidades)
- **Coordinador:** Ve su sucursal (ej. 89 oportunidades)

### Test 4: Gráficos y KPIs

- [ ] Gauge % se calcula correctamente
- [ ] Charts muestran datos según filtros
- [ ] Tablas paginan correctamente
- [ ] Loading spinners funcionan

---

## 🐛 Troubleshooting

### ❌ "Permission denied: .env.local"

```bash
# Verificar que .env.local existe y tiene permisos
ls -la .env.local
```

### ❌ "Supabase connection failed"

```bash
# Verificar variables de entorno
echo $VITE_SUPABASE_URL
# Debe retornar la URL de tu proyecto
```

### ❌ "Tabla no encontrada: usuarios"

```
Las migraciones SQL no se ejecutaron
Ir a Supabase Dashboard → SQL Editor
Ejecutar docs/supabase-schema.sql
```

### ❌ "RLS policy violation"

```
Las políticas RLS no se crearon
Ir a Supabase Dashboard → SQL Editor
Ejecutar docs/supabase-rls-policies.sql
```

### ❌ "No data loading"

```bash
# Verificar que Excel se cargó
bun src/integrations/supabase/load-excel.ts
# Debe mostrar:
# ✅ Carga completada exitosamente
# 📊 Filas cargadas: {usuarios: 51, oportunidades: 1294, ...}
```

---

## 📚 Documentación Relacionada

- [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) - Setup detallado de Supabase
- [EXCEL_PARSER_GUIDE.md](./EXCEL_PARSER_GUIDE.md) - Parser Excel
- [CLAUDE.md](./CLAUDE.md) - Guía del proyecto
- [docs/supabase-schema.sql](./docs/supabase-schema.sql) - Schema SQL

---

## ✅ Checklist de Setup

- [ ] `.env.local` configurado
- [ ] `bun setup-dashboard.mjs` ejecutado
- [ ] Migraciones SQL ejecutadas en Supabase
- [ ] Datos cargados desde Excel
- [ ] Servidor dev iniciado en `http://localhost:3000`
- [ ] Login funciona
- [ ] Redirección por rol funciona
- [ ] Dashboards muestran datos
- [ ] Filtros funcionan
- [ ] RLS limita datos por rol

---

## 🚀 Próximos Pasos

Una vez dashboard está funcionando:

1. ⏳ Testing completo (todos los roles)
2. ⏳ Ajustar colores/temas si es necesario
3. ⏳ Deploy a producción
4. ⏳ Configurar GitHub Actions para recarga semanal (viernes 5 AM)

---

**¿Preguntas?** Revisar CLAUDE.md o ejecutar `bun run lint` para verificar el código.
