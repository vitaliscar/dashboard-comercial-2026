# KPI Calculations Library - Implementation Guide

## Overview

A complete, production-ready KPI calculations library has been created for the Dashboard Comercial 2026 project. The library provides pure, immutable functions for all commercial dashboard calculations.

## Files Created

### 1. **src/lib/kpi-calculations.ts** (Main Library)

Core calculation functions with full TypeScript support.

**Functions:**

- `calcularCumplimiento(presupuesto, venta)` - Sales compliance percentage
- `calcularPareto(datos, campo)` - 80/20 analysis
- `agruparPorSucursal(datos, campo, campoValor)` - Group by branch
- `agruparPorUN(datos)` - Group by business unit
- `calcularVariacion(anterior, actual)` - Percentage change
- `rankingAsesores(datos, ...)` - Advisor rankings
- `carteraVencida(cuentas, dias, ...)` - Overdue accounts
- `calcularEstadisticas(valores)` - Summary statistics
- `filtrarPorFecha(datos, inicio, fin, campo)` - Date range filter
- `calcularCrecimiento(periodoAnterior, periodoPosterior)` - Growth rate

**Exported Types:**

- `CumplimientoResult`
- `ParetoItem<T>`
- `GroupedResult`
- `AsesoresRanking`
- `CuentaVencida`
- `VariacionResult`

---

### 2. **src/lib/kpi-calculations.examples.ts** (Usage Examples)

Real-world examples for all 10 functions plus comprehensive dashboard scenario.

**Examples:**

- Individual function usage
- Multi-step commercial analysis
- Complete dashboard scenario combining all metrics

**How to Use:**

```typescript
import { ejemplo_cumplimiento, ejecutarTodosLosEjemplos } from "@/lib/kpi-calculations.examples";

// Run specific example
ejemplo_cumplimiento();

// Or run all examples
ejecutarTodosLosEjemplos();
```

---

### 3. **src/lib/kpi-calculations.test.ts** (Unit Tests)

Comprehensive test suite with 40+ test cases using Vitest.

**Coverage:**

- Normal cases for all functions
- Edge cases (zero, null, empty arrays)
- Error handling
- Type validation
- Immutability verification

**AAA Pattern:**
Each test follows Arrange-Act-Assert structure.

**How to Run:**

```bash
# Run all tests
bun run test

# Run specific file
bun test src/lib/kpi-calculations.test.ts

# Watch mode
bun run test:watch

# Coverage report
bun run test:coverage
```

---

### 4. **src/lib/kpi-hooks.ts** (React Integration)

Custom React hooks combining TanStack Query with KPI calculations.

**Hooks:**

- `useDashboardMetrics()` - Complete dashboard metrics
- `useComplianceMetrics(presupuesto)` - Compliance tracking
- `useAdvisorRankings(limit)` - Top advisors
- `useParetoAnalysis(tipo)` - 80/20 analysis
- `useBranchAnalysis(sortBy)` - Branch performance
- `useBusinessUnitAnalysis()` - Business unit metrics
- `useOverdueAccounts(diasThreshold)` - Cartera vencida tracking
- `useComparisonMetrics()` - Month-over-month comparison
- `useSalesStats()` - General statistics

**How to Use:**

```typescript
import { useDashboardMetrics, useAdvisorRankings } from "@/lib/kpi-hooks";

export function Dashboard() {
  const { metricas, isLoading } = useDashboardMetrics();
  const { ranking, topAdvisors } = useAdvisorRankings(10);

  if (isLoading) return <Loading />;

  return (
    <div>
      <KpiCard value={metricas?.cumplimiento.porcentaje} />
      <RankingList advisors={ranking} />
    </div>
  );
}
```

---

### 5. **src/lib/KPI_CALCULATIONS_README.md** (Documentation)

Comprehensive API documentation with:

- Function descriptions with examples
- Type definitions
- React component integration patterns
- Performance considerations
- Troubleshooting guide
- Testing information

---

## Quick Start

### 1. **Import Functions**

```typescript
import { calcularCumplimiento, rankingAsesores, agruparPorSucursal } from "@/lib/kpi-calculations";
```

### 2. **Use in Component**

```typescript
export function SalesMetrics({ ventasData }) {
  const cumplimiento = useMemo(
    () => calcularCumplimiento(100000, ventasData),
    [ventasData]
  );

  return (
    <KpiCard
      value={cumplimiento.porcentaje}
      status={cumplimiento.estado}
      label="Cumplimiento"
    />
  );
}
```

### 3. **Use with React Hooks**

```typescript
import { useDashboardMetrics } from "@/lib/kpi-hooks";

export function Dashboard() {
  const { metricas, isLoading } = useDashboardMetrics();

  if (!metricas) return null;

  return (
    <div>
      <h1>Cumplimiento: {metricas.cumplimiento.porcentaje}%</h1>
      <StatusBadge status={metricas.cumplimiento.estado} />
    </div>
  );
}
```

---

## Integration Checklist

### ✓ Setup

- [x] Functions created with full TypeScript types
- [x] All interfaces exported
- [x] Zero dependencies (pure functions)
- [x] Immutable by design

### ✓ Testing

- [x] Unit tests created (40+ cases)
- [x] AAA pattern used
- [x] Edge cases covered
- [x] 95%+ coverage target

### ✓ Documentation

- [x] Comprehensive README
- [x] JSDoc comments on all functions
- [x] Usage examples for each function
- [x] React integration guide

### ✓ Integration

- [x] React hooks provided
- [x] TanStack Query integration
- [x] Supabase-ready patterns
- [x] Memoization examples

---

## Common Usage Patterns

### Pattern 1: Dashboard Metrics

```typescript
import { useDashboardMetrics } from "@/lib/kpi-hooks";

export function DashboardPage() {
  const { metricas, isLoading, error } = useDashboardMetrics();

  if (isLoading) return <Loading />;
  if (error) return <Error message={error.message} />;

  return (
    <div className="grid grid-cols-4 gap-4">
      <KpiCard
        label="Cumplimiento"
        value={metricas.cumplimiento.porcentaje}
        status={metricas.cumplimiento.estado}
      />
      <KpiCard
        label="Top Asesor"
        value={metricas.ranking[0]?.nombre}
        subtitle={`$${metricas.ranking[0]?.venta}`}
      />
      <KpiCard
        label="Sucursal Top"
        value={metricas.porSucursal[0]?.nombre}
        subtitle={`$${metricas.porSucursal[0]?.total}`}
      />
      <KpiCard
        label="Promedio Venta"
        value={metricas.estadisticas.promedio}
      />
    </div>
  );
}
```

### Pattern 2: Pareto Analysis Chart

```typescript
import { useParetoAnalysis } from "@/lib/kpi-hooks";
import { BarChart } from "recharts";

export function ParetoChart() {
  const { pareto, top80 } = useParetoAnalysis("productos");

  return (
    <BarChart data={top80.map((item) => ({
      name: item.item.nombre,
      valor: item.valor,
      acumulado: item.porcentajeAcumulado,
    }))} />
  );
}
```

### Pattern 3: Ranking Table

```typescript
import { useAdvisorRankings } from "@/lib/kpi-hooks";

export function RankingTable() {
  const { ranking } = useAdvisorRankings();

  return (
    <table>
      <thead>
        <tr>
          <th>Posición</th>
          <th>Asesor</th>
          <th>Ventas</th>
        </tr>
      </thead>
      <tbody>
        {ranking.map((asesor) => (
          <tr key={asesor.id}>
            <td>#{asesor.posicion}</td>
            <td>{asesor.nombre}</td>
            <td>${asesor.venta.toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

### Pattern 4: Comparative Analysis

```typescript
import { useComparisonMetrics } from "@/lib/kpi-hooks";

export function MonthComparison() {
  const { comparison } = useComparisonMetrics();

  if (!comparison) return null;

  return (
    <div>
      <p>Mes Anterior: ${comparison.previousMonth.toLocaleString()}</p>
      <p>Mes Actual: ${comparison.currentMonth.toLocaleString()}</p>
      <p>
        Variación: {comparison.variation.porcentaje}%
        ({comparison.variation.tendencia})
      </p>
    </div>
  );
}
```

---

## Performance Tips

### 1. Memoize Calculations

Always wrap calculations in `useMemo` when data is used by multiple components:

```typescript
const metricas = useMemo(() => calcularPareto(productos, "ventas"), [productos]);
```

### 2. Lazy Load Large Datasets

For datasets >1000 records, consider pagination or pagination:

```typescript
const datos = useMemo(
  () => products.slice(0, 100), // First 100 items
  [products],
);
const pareto = useMemo(() => calcularPareto(datos, "ventas"), [datos]);
```

### 3. Query Optimization

Set appropriate refetch intervals in React Query:

```typescript
const { data } = useQuery({
  queryKey: ["ventas"],
  queryFn: fetchVentas,
  refetchInterval: 5 * 60 * 1000, // 5 minutes
});
```

---

## Testing in Your Components

### Unit Test Example

```typescript
import { describe, it, expect } from "vitest";
import { calcularCumplimiento } from "@/lib/kpi-calculations";

describe("Dashboard with KPI calculations", () => {
  it("should display compliance correctly", () => {
    const result = calcularCumplimiento(100000, 85000);
    expect(result.porcentaje).toBe(85);
    expect(result.estado).toBe("warning");
  });
});
```

### Component Test with React Testing Library

```typescript
import { render, screen } from "@testing-library/react";
import { Dashboard } from "./Dashboard";
import { useDashboardMetrics } from "@/lib/kpi-hooks";

vi.mock("@/lib/kpi-hooks", () => ({
  useDashboardMetrics: () => ({
    metricas: {
      cumplimiento: { porcentaje: 85, estado: "warning" },
      ranking: [{ id: "1", nombre: "Juan", venta: 100000, posicion: 1 }],
    },
    isLoading: false,
  }),
}));

describe("Dashboard", () => {
  it("should render KPI metrics", () => {
    render(<Dashboard />);
    expect(screen.getByText("Cumplimiento: 85%")).toBeInTheDocument();
  });
});
```

---

## Troubleshooting

### Issue: NaN Results

**Solution:** Validate input data before passing:

```typescript
const datos = ventas.filter((v) => typeof v.monto === "number" && !Number.isNaN(v.monto));
```

### Issue: Type Errors with Custom Fields

**Solution:** Use proper field names or cast:

```typescript
const resultado = agruparPorSucursal<VentaRecord>(datos, "sucursal", "monto");
```

### Issue: Component Not Updating

**Solution:** Ensure data is in dependency array:

```typescript
const metricas = useMemo(
  () => calcularPareto(datos, "ventas"),
  [datos], // ← Include all dependencies
);
```

---

## Next Steps

### 1. Run Tests

```bash
bun run test
```

### 2. View Examples

```typescript
import { ejecutarTodosLosEjemplos } from "@/lib/kpi-calculations.examples";
ejecutarTodosLosEjemplos();
```

### 3. Integrate into Dashboard

- Import hooks in dashboard components
- Replace placeholder data with real Supabase queries
- Add KPI cards to your dashboard layout

### 4. Customize for Your Data

- Update field names in hooks to match your schema
- Adjust presupuesto values for your business
- Add additional calculations as needed

---

## API Reference Summary

| Function               | Purpose                | Input               | Output             |
| ---------------------- | ---------------------- | ------------------- | ------------------ |
| `calcularCumplimiento` | Compliance %           | presupuesto, venta  | CumplimientoResult |
| `calcularPareto`       | 80/20 analysis         | datos, campo        | ParetoItem[]       |
| `agruparPorSucursal`   | Group by branch        | datos, campo, valor | GroupedResult[]    |
| `agruparPorUN`         | Group by business unit | datos               | GroupedResult[]    |
| `calcularVariacion`    | % change               | anterior, actual    | VariacionResult    |
| `rankingAsesores`      | Rank advisors          | datos               | AsesoresRanking[]  |
| `carteraVencida`       | Overdue accounts       | cuentas, dias       | CuentaVencida[]    |
| `calcularEstadisticas` | Stats                  | valores             | Statistics         |
| `filtrarPorFecha`      | Date filter            | datos, inicio, fin  | T[]                |
| `calcularCrecimiento`  | Growth rate            | period1, period2    | Growth             |

---

## Support

For detailed documentation, see:

- **API Docs:** `src/lib/KPI_CALCULATIONS_README.md`
- **Examples:** `src/lib/kpi-calculations.examples.ts`
- **Tests:** `src/lib/kpi-calculations.test.ts`
- **React Hooks:** `src/lib/kpi-hooks.ts`

---

## Version Info

- **Created:** 2024-07-02
- **Type:** TypeScript/React
- **Dependencies:** None (pure functions)
- **React Hooks:** Requires @tanstack/react-query
- **Tests:** Vitest compatible

---

## License

This library is part of Dashboard Comercial 2026 internal project.
