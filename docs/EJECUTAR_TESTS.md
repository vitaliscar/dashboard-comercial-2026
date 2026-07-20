# 🧪 Ejecutar Tests Excel - Guía Paso a Paso

## Opción 1: Desde PowerShell (Recomendado ⭐)

### Paso 1: Abre PowerShell en el directorio del proyecto

```powershell
cd "D:\Users\v52anap\Documents\CCV 2026\Dashboard Comercial 2026"
```

### Paso 2: Ejecuta el script de tests

```powershell
.\run-tests.ps1
```

**Resultado esperado:**

```
╔════════════════════════════════════════════════════════════════════════════════╗
║          SUITE DE TESTS - PARSER EXCEL CCV RENDIMIENTO                        ║
╚════════════════════════════════════════════════════════════════════════════════╝

✓ Archivo Excel encontrado: CCV Rendimiento.xlsx
🧪 Ejecutando tests...

================================================================================
TEST 1: LOGIN Y USUARIOS
================================================================================

✓ Parser inicializado
  Total de usuarios cargados: 50

--- Primeros 3 usuarios ---
  1. Nombre del Empleado
     Rol: Gerencia
     Email: email@ccvenequip.com
     ...

✓ Test de login completado

[... más tests ...]

✓ Tests completados exitosamente
```

---

## Opción 2: Línea de Comando

Si prefieres ejecutar directamente sin el script PowerShell:

```powershell
cd "D:\Users\v52anap\Documents\CCV 2026\Dashboard Comercial 2026"
bun install                  # Solo la primera vez
bun run test:excel
```

---

## Opción 3: Usar npm

Si `bun` no funciona, intenta con `npm`:

```powershell
cd "D:\Users\v52anap\Documents\CCV 2026\Dashboard Comercial 2026"
npm install                  # Solo la primera vez
npm run test:excel
```

---

## Opción 4: Node directo

Para ejecutar el script `.mjs`:

```powershell
cd "D:\Users\v52anap\Documents\CCV 2026\Dashboard Comercial 2026"
npm install xlsx            # Solo la primera vez
node run-tests.mjs
```

---

## ¿Qué hacen los Tests?

Los tests validan que el parser Excel funciona correctamente:

| Test     | Valida                           |
| -------- | -------------------------------- |
| ✓ TEST 1 | Lectura de usuarios y roles      |
| ✓ TEST 2 | Oportunidades por mes/año        |
| ✓ TEST 3 | Cumplimiento base y presupuestos |
| ✓ TEST 4 | Ventas perdidas y razones        |
| ✓ TEST 5 | Facturas por tipo de negocio     |
| ✓ TEST 6 | Cumplimiento de asesores         |

---

## Troubleshooting

### ❌ "bun: command not found"

**Solución:** Instala Bun globalmente

```powershell
npm install -g bun
```

### ❌ "CCV Rendimiento.xlsx no encontrado"

**Solución:** Asegúrate de estar en el directorio correcto

```powershell
Get-Location  # Ver directorio actual
dir           # Ver archivos en el directorio
```

### ❌ "No data found in sheet"

**Solución:** Verifica que el Excel tenga datos para el mes/año que se busca (mayo 2026 por defecto)

### ❌ Error de instalación de `xlsx`

**Solución:** Limpia la caché e instala de nuevo

```powershell
bun install --force
# o
npm install --force
```

---

## Próximos Pasos

Una vez que los tests se ejecuten correctamente ✓:

1. ✅ Parser Excel funcionando
2. ⏳ Implementar KPIs y cálculos
3. ⏳ Crear schema Supabase
4. ⏳ Conectar con dashboard React

---

## Archivos Generados

```
src/lib/excel-parser.ts     ← Parser principal
src/tests/excel.test.ts     ← Tests en TypeScript
run-tests.mjs              ← Script Node.js standalone
run-tests.ps1              ← Script PowerShell
EXCEL_PARSER_GUIDE.md      ← Documentación técnica
EJECUTAR_TESTS.md          ← Este archivo
```

---

## Contacto

Si encuentras problemas, verifica:

- ✓ Ruta del Excel correcta
- ✓ Bun/Node instalado
- ✓ Directorio correcto
- ✓ Archivo Excel no corrupto
