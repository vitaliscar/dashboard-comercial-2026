# Dashboard Hooks Integration Checklist

## Pre-Integration Verification

- [ ] Review `HOOKS_IMPLEMENTATION_SUMMARY.md` for overview
- [ ] Read `src/hooks/INDEX.md` for quick reference
- [ ] Check `src/hooks/DASHBOARD_HOOKS_README.md` for detailed docs
- [ ] Review example implementations in `src/hooks/dashboard-hooks-examples.tsx`
- [ ] Verify Supabase schema includes all required tables:
  - [ ] cumplimiento_base
  - [ ] cumplimiento_asesores
  - [ ] facturacion
  - [ ] cobranzas
  - [ ] ventas_perdidas
  - [ ] cotizaciones
  - [ ] oportunidades
  - [ ] usuarios
  - [ ] unidades_negocio
  - [ ] sucursales

## Code Review Checklist

### Hook Implementation

- [ ] All 5 new hooks are present in `src/hooks/useSupabaseQuery.ts`
- [ ] All interfaces are exported with correct types
- [ ] `AppRole` type is properly defined
- [ ] Error handling includes `.throw error` after all queries
- [ ] Cache settings are appropriate (5-min stale, 30-min gc)
- [ ] Query keys include all filtering parameters
- [ ] Parallel fetching using `Promise.all()` is implemented

### Types and Interfaces

- [ ] `DashboardNacionalKPIs` includes all 8 properties
- [ ] `DashboardUNKPIs` includes advisor count and conversions
- [ ] `DashboardSucursalKPIs` includes `ventasPorAsesor` array
- [ ] `DashboardAsesorKPIs` includes opportunities and quotations
- [ ] `FilterOptions` has 6 required properties
- [ ] `UserContext` has all 4 optional properties

### Documentation

- [ ] DASHBOARD_HOOKS_README.md (4,500+ lines)
  - [ ] All 5 hooks documented with examples
  - [ ] Usage patterns shown
  - [ ] RLS integration explained
  - [ ] Performance tips included
  - [ ] Testing guidelines provided
  - [ ] Troubleshooting section complete

- [ ] INDEX.md contains
  - [ ] Quick reference for all hooks
  - [ ] Quick start example (5 steps)
  - [ ] File structure listed
  - [ ] Key features highlighted

- [ ] HOOKS_IMPLEMENTATION_SUMMARY.md includes
  - [ ] Overview of changes
  - [ ] All new hooks detailed
  - [ ] Key features listed
  - [ ] Usage examples provided
  - [ ] Migration guide from old code

### Examples

- [ ] `dashboard-hooks-examples.tsx` has 5 component examples
  - [ ] NationalDashboardExample (Gerencia)
  - [ ] BusinessUnitDashboardExample
  - [ ] BranchDashboardExample (with advisor breakdown)
  - [ ] AdvisorDashboardExample (personal)
  - [ ] FilterExampleComponent (shows permissions)
- [ ] All examples are runnable (no broken imports)
- [ ] KPICard reusable component is included

## Integration Steps

### Step 1: Review and Understand

- [ ] Read HOOKS_IMPLEMENTATION_SUMMARY.md (15 min)
- [ ] Review INDEX.md for quick reference (5 min)
- [ ] Check example implementations (10 min)
- [ ] Skim DASHBOARD_HOOKS_README.md for details (20 min)

### Step 2: Import Hooks in Components

```typescript
// Add to your dashboard component
import {
  useDashboardAsesor,
  useDashboardSucursal,
  useDashboardUN,
  useDashboardGerenciaNacional,
  useFilterOptions,
  type DashboardAsesorKPIs,
  type FilterOptions,
} from "@/hooks/useSupabaseQuery";
import { useAuth } from "@/hooks/use-auth";
```

- [ ] Imports added to first dashboard component
- [ ] No TypeScript errors on imports

### Step 3: Get User Context

```typescript
// Add to component
const { role, profile } = useAuth();
const currentMonth = new Date().getMonth() + 1;
const currentYear = new Date().getFullYear();
```

- [ ] Auth hook integrated
- [ ] Current month/year calculated
- [ ] User profile properly typed

### Step 4: Load Filter Options (Optional but Recommended)

```typescript
const { data: filters } = useFilterOptions({
  role: role as any,
  sucursalId: profile?.sucursal_id,
  unidadNegocioId: profile?.unidad_negocio_id,
  codigoAsesor: profile?.id,
});
```

- [ ] Filter options hook called with user context
- [ ] Conditional rendering based on `filters?.canView*`
- [ ] No TypeScript errors

### Step 5: Replace Old Hook Calls

**Old pattern** (still works):

```typescript
const { data: cumplimiento } = useCumplimientoAsesores(7, 2026, "ADV-001");
const { data: facturacion } = useFacturacion(7, 2026, "ADV-001");
// Manual calculation
const tasaConversion = ((facturacion?.monto || 0) / (cumplimiento?.venta || 1)) * 100;
```

**New pattern** (recommended):

```typescript
const { data: kpis } = useDashboardAsesor("ADV-001", 7, 2026);
const tasaConversion = kpis?.tasaConversion || 0; // Already calculated!
```

- [ ] Replace multi-hook queries with single aggregated hook
- [ ] Remove manual calculation code
- [ ] Verify results match previous implementation

### Step 6: Update JSX to Use KPIs

```typescript
// Before
<KPICard value={totalVenta} />

// After
<KPICard value={kpis?.totalVenta || 0} />
```

- [ ] All hardcoded values replaced with hook data
- [ ] Null checks in place (use `|| 0` or `kpis?.property`)
- [ ] Loading state shown while `isLoading` is true
- [ ] Error state shown if `error` is present

### Step 7: Add Filtering (Optional)

```typescript
const [selectedSucursal, setSelectedSucursal] = useState(profile?.sucursal_id)

// Re-fetch when selection changes
const { data: kpis } = useDashboardSucursal(
  selectedSucursal,
  selectedMonth,
  selectedYear
)

// Render selector
{filters?.canViewAllSucursales && (
  <select value={selectedSucursal} onChange={(e) => setSelectedSucursal(e.target.value)}>
    {filters?.sucursalesDisponibles.map(s => (
      <option key={s} value={s}>{s}</option>
    ))}
  </select>
)}
```

- [ ] Filter selector rendered (if user has permission)
- [ ] State updated on selection change
- [ ] Hook re-fetches with new parameter
- [ ] UI updates with new data

## Deployment Checklist

### Before Committing

- [ ] Run `bun run lint` - no errors
- [ ] Run `bun run format` - all files formatted
- [ ] Run `bun run type-check` - no TypeScript errors
- [ ] Manual testing with different user roles:
  - [ ] Gerencia can view national data
  - [ ] Gerente Comercial sees only their branch
  - [ ] Coordinador sees only their branch
  - [ ] Asesor sees only their data

### Before Merging

- [ ] All tests pass (if applicable)
- [ ] Peer review completed
- [ ] No console.log statements left
- [ ] Error messages are user-friendly
- [ ] Loading states properly shown

### After Deployment

- [ ] Monitor error logs for RLS issues
- [ ] Check React Query DevTools for cache hits
- [ ] Verify data accuracy across all roles
- [ ] Performance monitoring (< 1 second load)
- [ ] User acceptance testing by role

## Testing Strategy

### Unit Tests

```typescript
import { renderHook } from "@testing-library/react";
import { useDashboardAsesor } from "@/hooks/useSupabaseQuery";

test("loads advisor KPIs", async () => {
  const { result } = renderHook(() => useDashboardAsesor("ADV-001", 7, 2026), {
    wrapper: QueryClientProvider,
  });

  // Verify data structure
  expect(result.current.data?.totalVenta).toBeDefined();
  expect(result.current.data?.tasaConversion).toBeGreaterThanOrEqual(0);
});
```

- [ ] Test each hook independently
- [ ] Test error scenarios (no data, invalid params)
- [ ] Test with QueryClientProvider wrapper

### Integration Tests

- [ ] Test with different user roles
- [ ] Test RLS enforcement (user can't access other branch data)
- [ ] Test month/year parameter changes
- [ ] Test concurrent queries (multiple dashboards open)

### Manual Testing

- [ ] Load dashboard as Gerencia - should see national data
- [ ] Load dashboard as Gerente Comercial - should see only branch data
- [ ] Load dashboard as Asesor - should see only own data
- [ ] Check Network tab - verify parallel queries fire
- [ ] Check React Query DevTools - verify cache behavior

## Performance Optimization

### Caching

- [ ] Verify 5-minute stale time is appropriate
- [ ] Check if prefetching needed before navigation
- [ ] Monitor cache size in React Query DevTools

### Data Fetching

- [ ] Confirm parallel requests with `Promise.all()`
- [ ] Look for N+1 query problems (none should exist)
- [ ] Verify query deduplication works

### Rendering

- [ ] No unnecessary re-renders on data update
- [ ] Loading skeleton shown while fetching
- [ ] Error boundary catches hook errors

## RLS Verification

### Policies in Place

- [ ] cumplimiento_base has role-based filtering
- [ ] facturacion has branch/UN filtering
- [ ] cobranzas has branch/UN filtering
- [ ] ventas_perdidas has advisor filtering
- [ ] cotizaciones has advisor/branch filtering
- [ ] oportunidades has advisor filtering

### Test Cases

- [ ] Gerencia can query any branch
- [ ] Gerente Comercial gets 403 for other branches
- [ ] Asesor gets 403 for other advisors' data
- [ ] All queries work without manual permission logic

## Common Issues & Solutions

### Issue: "data is undefined"

**Checklist**:

- [ ] Hook has `enabled: true` (or condition is met)
- [ ] Parameters are not empty strings
- [ ] Query finished loading (`isLoading` is false)
- [ ] No network error returned

**Fix**: Check React Query DevTools -> Queries tab

### Issue: RLS permission denied error

**Checklist**:

- [ ] User has correct role in `user_roles` table
- [ ] User's sucursal_id is set if needed
- [ ] RLS policy condition checks auth.uid()
- [ ] No typos in policy column names

**Fix**: Check Supabase dashboard -> Authentication -> Users

### Issue: Stale data not updating

**Checklist**:

- [ ] 5 minutes haven't passed since last fetch
- [ ] No refetch requested
- [ ] Cache key includes all parameters

**Fix**: Manually refetch with `refetch()` or wait 5 minutes

### Issue: Slow performance / multiple duplicate requests

**Checklist**:

- [ ] Not making same query in multiple components
- [ ] React Query deduplication is working
- [ ] No rapid parameter changes causing unnecessary refetches
- [ ] Network tab shows parallel requests (not sequential)

**Fix**: Use React Query DevTools to monitor queries

## Success Criteria

- [ ] All 5 hooks working and returning correct data
- [ ] No console errors or warnings
- [ ] RLS properly enforcing access control
- [ ] Load time < 1 second for typical dashboard
- [ ] Cache hit performance < 50ms
- [ ] All roles can access appropriate data only
- [ ] Type safety with no `any` types
- [ ] Documentation complete and accurate
- [ ] Examples runnable without modification
- [ ] No breaking changes to existing code

## Rollback Plan (If Needed)

If issues arise after deployment:

1. **Immediate** (< 5 min)
   - [ ] Revert to previous commit
   - [ ] Restart server
   - [ ] Clear browser cache

2. **Short-term** (< 1 hour)
   - [ ] Identify issue using error logs
   - [ ] Fix in new branch
   - [ ] Run tests
   - [ ] Deploy fixed version

3. **Follow-up**
   - [ ] Root cause analysis
   - [ ] Add regression test
   - [ ] Document learnings

---

## Sign-Off

- **Reviewed by**: **\*\*\*\***\_**\*\*\*\*** Date: **\_\_\_**
- **Tested by**: **\*\*\*\***\_**\*\*\*\*** Date: **\_\_\_**
- **Approved by**: **\*\*\*\***\_**\*\*\*\*** Date: **\_\_\_**
- **Deployed by**: **\*\*\*\***\_**\*\*\*\*** Date: **\_\_\_**

---

## Support

For questions or issues:

1. Check `DASHBOARD_HOOKS_README.md` troubleshooting section
2. Review example implementations in `dashboard-hooks-examples.tsx`
3. Check React Query DevTools for cache/query status
4. Review Supabase logs for RLS violations
