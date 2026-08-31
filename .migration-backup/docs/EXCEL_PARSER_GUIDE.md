# 📊 Excel Parser - Guía de Uso

## Descripción

Este proyecto incluye un **parser Excel completo** que lee el archivo `CCV Rendimiento.xlsx` e implementa todas las reglas del PRD (Product Requirement Document) para procesamiento y análisis de datos comerciales.

## Instalación

### Paso 1: Instalar dependencias

```bash
cd "d:/Users/v52anap/Documents/CCV 2026/Dashboard Comercial 2026"
bun install
```

Esto incluirá:

- `xlsx` - Parser de archivos Excel
- `@types/xlsx` - Tipos TypeScript para xlsx

### Paso 2: Ejecutar los tests

```bash
bun run test:excel
```

## Estructura de Archivos

```
src/
├── lib/
│   └── excel-parser.ts       # Parser principal (ExcelParser class)
├── tests/
│   └── excel.test.ts         # Suite de 12 tests
```

## Archivos Creados

### 1. `src/lib/excel-parser.ts`

**Clase: `ExcelParser`**

Implementa la lectura y procesamiento de todas las hojas Excel:

```typescript
const parser = new ExcelParser("path/to/CCV Rendimiento.xlsx");

// Métodos disponibles:
parser.obtenerNombresHojas(); // Obtiene y muestra los nombres de todas las hojas
parser.getUsuarios(); // Lee hoja "Usuarios"
parser.getOportunidades(meses, anio); // Lee hoja "Oportunidades"
parser.getOportunidadesLubFiltros(meses, anio); // Lee "Oportunidades Lub/Filtros"
parser.getCumplimientoBase(meses, anio); // Lee "Cumplimiento_Base"
parser.getCuentasPorCobrar(anio); // Lee "Cuentas por Cobrar"
parser.getVentasPerdidas(meses, anio); // Lee "Ventas Perdidas"
parser.getFacturacion(meses, anio); // Lee "Facturación"
parser.getServicios(meses, anio); // Lee "Servicios"
parser.getLubricantesFiltos(meses, anio); // Lee "Lubricantes/Filtros"
parser.getCumplimientoAsesores(meses, anio); // Lee "Cumplimiento_Asesores_Base"
```

**Funciones auxiliares:**

```typescript
parser.normalizarEtapaLubFiltros(estatus); // Mapea estatus a etapa de ventas
parser.clasificarUnidadVentaPerdida(area, suplidor); // Clasifica por área/suplidor
```

### 2. `src/tests/excel.test.ts`

**Suite de 12 tests:**

| #   | Test                          | Descripción                            |
| --- | ----------------------------- | -------------------------------------- |
| 1   | `testLogin`                   | Carga y valida usuarios, roles, emails |
| 2   | `testContarRoles`             | Distribución de roles y coordinadores  |
| 3   | `testExclusionMachineShop`    | Verifica exclusión de sucursal         |
| 4   | `testOportunidades`           | Carga oportunidades por mes/año        |
| 5   | `testOportunidadesLubFiltros` | Agrupa cotizaciones por Nro.           |
| 6   | `testCumplimientoBase`        | Presupuestos y ventas reales           |
| 7   | `testCuentasPorCobrar`        | Cartera vencida y clasificación        |
| 8   | `testVentasPerdidas`          | Montos y razones de pérdida            |
| 9   | `testFacturacion`             | Facturas por tipo de negocio           |
| 10  | `testServicios`               | Servicios externos agrupados           |
| 11  | `testLubricantesFiltos`       | Lubricantes/Filtros facturados         |
| 12  | `testCumplimientoAsesores`    | Meta vs venta por asesor               |

## Ejecutar Tests

### Todos los tests

```bash
bun run test:excel
```

Salida esperada:

```
╔════════════════════════════════════════════════════════════════════════════════╗
║          SUITE DE TESTS - PARSER EXCEL CCV RENDIMIENTO                        ║
╚════════════════════════════════════════════════════════════════════════════════╝

================================================================================
TEST 1: LOGIN Y USUARIOS
================================================================================

✓ Parser inicializado
  Total de usuarios cargados: X

--- Primeros 3 usuarios ---
  1. Nombre Empleado
     Rol: Gerencia
     Email: email@ccvenequip.com
     ...

✓ Test de login completado

[... más tests ...]

================================================================================
RESUMEN DE TESTS
================================================================================

✓ Todos los tests completados
```

## Reglas Implementadas

### 1. Normalización de Sucursales

```typescript
"Los Ruices" → "Caracas"
"FMO Piar" → "FMO Piar"
"Puerto Ordaz" → "Puerto Ordaz"
// ... etc
```

### 2. Exclusión Global

- **Machine Shop** se excluye de TODOS los cálculos

### 3. Unidades de Negocio Estándar

```
- repuestos
- lubFiltros (Lubricantes y Filtros)
- servicios
- equipos
- alquiler
```

### 4. Mapeo de Estatus a Etapa (Lub/Filtros)

```
"Re-Impresa", "Impresa", "Activa" → "Desarrollo"
"Convertida en Orden" → "Propuesta-Negociación"
"Venta Perdida", "Cerrada" → "Venta Perdida"
"Expirada" → "Desconocido"
```

### 5. Clasificación de Área/Suplidor (Ventas Perdidas)

```
Si Área contiene "repuesto":
  - Si Suplidor en ["CO", "DN", "D1", "NC", "GF"] → "lubFiltros"
  - Sino → "repuestos"
```

## Integración con Dashboard React

El parser está listo para integrar con el dashboard:

```typescript
// En un hook React
import { ExcelParser } from "@/lib/excel-parser";

export function useOportunidades(meses: number[], anio: number) {
  const parser = new ExcelParser(EXCEL_PATH);
  const datos = parser.getOportunidades(meses, anio);
  return datos;
}
```

## Próximos Pasos

1. ✅ Parser Excel completado
2. ✅ Tests reescritos
3. ⏳ Implementar servicio de carga a Supabase
4. ⏳ Crear schema Supabase
5. ⏳ Conectar con dashboard React

## Troubleshooting

### Error: "Hoja no encontrada"

Verifica que el nombre de la hoja en el Excel coincida exactamente con los nombres esperados:

- `Usuarios`
- `Oportunidades`
- `Oportunidades Lub/Filtros`
- `CumplimientoBase`
- etc.

### Error: "No se encontraron datos para este mes/año"

- Verifica que el Excel tenga datos para ese mes/año
- Los datos pueden estar vacíos o con formato diferente

### Error en instalación de xlsx

```bash
# Reinstalar
bun install --force
```

## Contacto

Para preguntas sobre la implementación, consulta el PRD en:
`PRD - Solicitud de Extraccion de Datos.txt`
