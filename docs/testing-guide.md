# GUÍA COMPLETA DE TESTING - DASHBOARD COMERCIAL 2026

Este documento describe la estrategia de pruebas, la estructura de suites de test y las instrucciones para ejecutar cada tipo de prueba en la aplicación **Dashboard Comercial 2026**.

---

## 1. Tipos de Pruebas

La arquitectura de calidad comprende 3 niveles principales:

| Tipo                                | Herramienta       | Ubicación              | Objetivo                                                                                                        |
| :---------------------------------- | :---------------- | :--------------------- | :-------------------------------------------------------------------------------------------------------------- |
| **Pruebas Unitarias & Integración** | Vitest / Bun Test | `src/**/*.test.ts`     | Validar cálculos KPI, autenticación, data scope, funciones analíticas y utilidades de fechas.                   |
| **Pruebas E2E (End-to-End)**        | Playwright        | `e2e/*.spec.ts`        | Validar flujos de usuario completos, navegación entre rutas portadas, filtros de tablas y renderizado de roles. |
| **Pruebas de Carga (Load Test)**    | Autocannon        | `scripts/load-test.ts` | Simular 100 usuarios concurrentes para evaluar latencia (p50/p95/p99), throughput y tasa de errores.            |

---

## 2. Instrucciones de Ejecución

### 2.1 Pruebas Unitarias

Ejecutan los 130+ tests unitarios del proyecto:

```bash
# Con Bun (recomendado)
bun test

# Con npm / Vitest
npm run test
```

### 2.2 Pruebas E2E con Playwright

Playwright ejecuta los user journeys sobre el servidor local o un entorno staging:

```bash
# Ejecutar todas las pruebas E2E en modo headless
npx playwright test

# Ejecutar con interfaz gráfica (UI Mode)
npx playwright test --ui

# Ver reporte HTML generado tras los tests
npx playwright show-report
```

Las suites E2E cubren:

1. `e2e/auth.spec.ts`: Flujo de login, validación de formulario y credenciales.
2. `e2e/roles.spec.ts`: Acceso y renderizado por roles (`gerencia`, `gerente_comercial`, `coordinador`, `asesor`).
3. `e2e/navigation.spec.ts`: Carga de las 12+ rutas portadas sin errores 500.
4. `e2e/filters.spec.ts`: Comportamiento de búsqueda y filtrado en tablas de datos.
5. `e2e/kpis.spec.ts`: Renderizado de tarjetas KPI y widgets analíticos.

### 2.3 Pruebas de Carga (Load Testing)

Simula 100 usuarios concurrentes enviando solicitudes contínuas durante 10 segundos:

```bash
# Con el servidor dev o producción corriendo en http://localhost:3000
bun run scripts/load-test.ts

# Para probar contra una URL personalizada (ej. Staging):
LOAD_TEST_URL="https://staging.midominio.com" bun run scripts/load-test.ts
```

---

## 3. Integración en CI/CD

El pipeline de GitHub Actions (`.github/workflows/ci.yml`) ejecuta automáticamente las pruebas en cada `pull_request` y `push` a la rama principal (`main` o `master`).

No se permite el merge si alguna suite de pruebas falla.
