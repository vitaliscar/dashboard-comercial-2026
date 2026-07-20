# 🔧 Configuración Supabase - Dashboard Comercial 2026

## 1. Crear Proyecto en Supabase

1. Ir a https://supabase.com
2. Click en "New project"
3. Seleccionar organización y nombre: `Dashboard Comercial 2026`
4. Seleccionar región más cercana: **São Paulo** (Brasil) o **us-east-1** (AWS)
5. Guardar contraseña de base de datos
6. Esperar ~2 minutos hasta que el proyecto esté listo

## 2. Configurar Variables de Entorno

Copiar las claves de Supabase:

```bash
# En Supabase dashboard → Settings → API
# Copiar ANON_KEY y PROJECT_URL
```

Crear archivo `.env.local`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIs...
```

**Nota:** SERVICE_KEY es más permisivo (necesario para la carga). Ver en Settings → API → Service Role Secret.

## 3. Ejecutar Migraciones SQL

### Opción A: Desde Supabase Dashboard (Recomendado)

1. Ir a **SQL Editor** en Supabase dashboard
2. Click en **New Query**
3. Copiar contenido de `docs/supabase-schema.sql` y ejecutar
4. Crear nueva query con `docs/supabase-rls-policies.sql` y ejecutar

### Opción B: Desde CLI (si tienes Supabase CLI)

```bash
supabase db push
```

## 4. Habilitar Row Level Security

En Supabase dashboard → Authentication → Policies, verificar que todas las tablas tengan RLS habilitado (verde).

Si alguna no aparece, ejecutar en SQL Editor:

```sql
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE oportunidades ENABLE ROW LEVEL SECURITY;
-- ... etc para todas las tablas
```

## 5. Cargar Datos la Primera Vez

### Opción A: Ejecución Manual (Desarrollo)

```bash
# Desde el directorio del proyecto
bun src/integrations/supabase/load-excel.ts
```

Expected output:

```
📊 Iniciando carga de Excel a Supabase...
→ Cargando usuarios...
→ Cargando oportunidades...
... más mensajes ...
✅ Carga completada exitosamente
📊 Filas cargadas: {usuarios: 51, oportunidades: 1294, ...}
```

### Opción B: Via Node (si prefieres)

```bash
node --loader tsx src/integrations/supabase/load-excel.ts
```

## 6. Configurar Carga Semanal (GitHub Actions)

### Paso 1: Guardar Secrets en GitHub

Ir a **GitHub repo → Settings → Secrets and variables → Actions**

Agregar estos secrets:

```
SUPABASE_URL = https://your-project.supabase.co
SUPABASE_SERVICE_KEY = eyJhbGciOiJIUzI1NiIs...
EXCEL_FILE_URL = (opcional) URL donde descargar el Excel
```

### Paso 2: Verificar Workflow

El archivo `.github/workflows/weekly-excel-load.yml` se ejecutará automáticamente:

- **Cuándo**: Viernes a las 9 AM UTC (5 AM Caracas)
- **Qué hace**: Descarga Excel, carga datos, notifica si falla

Para testear manualmente:

1. Ir a **GitHub repo → Actions → Weekly Excel Load to Supabase**
2. Click en **Run workflow**
3. Seleccionar **main** branch y ejecutar

## 7. Verificar Datos en Supabase

Ir a **Table Editor** en Supabase dashboard y verificar:

```
✅ usuarios: 51 rows
✅ oportunidades: 1,294 rows
✅ cumplimiento_base: 45 rows
... etc
```

También ver la tabla `data_loads` para historial de cargas:

```sql
SELECT * FROM data_loads ORDER BY load_timestamp DESC;
```

## 8. Configurar Autenticación de Usuario

### Crear usuarios de prueba en Supabase

En **Authentication → Users → Add user**:

```
Email: asesor1@ccvenequip.com
Password: TempPassword123!
```

Luego actualizar en tabla `usuarios`:

```sql
INSERT INTO usuarios (nombre, rol, email, codigo, sucursal)
VALUES ('Juan Pérez', 'Asesores', 'asesor1@ccvenequip.com', 'A001', 'Caracas');
```

## 9. Testear RLS (Row Level Security)

### Test 1: Asesor solo ve sus datos

```sql
-- Conectado como asesor1@ccvenequip.com
SELECT * FROM oportunidades;
-- Debería retornar solo oportunidades del asesor
```

### Test 2: Gerencia ve todo

```sql
-- Conectado como gerente@ccvenequip.com
SELECT * FROM oportunidades;
-- Debería retornar TODAS las oportunidades
```

## 10. Troubleshooting

### ❌ "Permission denied" al ejecutar load

**Problema:** Usando ANON_KEY en lugar de SERVICE_KEY

**Solución:** Verificar `SUPABASE_SERVICE_KEY` en `.env.local`

### ❌ "RLS policy violation"

**Problema:** Policies mal configuradas

**Solución:** Verificar que las policies en `supabase-rls-policies.sql` se ejecutaron correctamente

### ❌ "Sheet not found"

**Problema:** El Excel está en otra ruta

**Solución:** Asegurar que `CCV Rendimiento.xlsx` esté en la raíz del proyecto

### ❌ Carga vacía (0 rows)

**Problema:** Datos del Excel no coinciden con mes/año actual

**Solución:** Editar `load-excel.ts` línea 48-50 para cambiar los meses que se cargan

```typescript
const meses = [5, 6]; // Cargar mayo y junio en lugar del mes actual
```

## 11. Próximos Pasos

1. ✅ Schema creado
2. ✅ RLS configurado
3. ✅ Carga semanal programada
4. ⏳ **Conectar dashboard con React Query hooks**
5. ⏳ Implementar filtros y búsqueda
6. ⏳ Agregar KPIs y dashboards

## Recursos

- [Supabase Docs](https://supabase.com/docs)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL Best Practices](https://www.postgresql.org/docs/)
