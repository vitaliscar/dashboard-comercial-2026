import { Button } from "@/components/ui/button";
import { useState, useEffect, useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

const FILTER_LABEL_CLASS =
  "text-[11px] font-semibold text-muted-foreground tracking-wide whitespace-nowrap";

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterState {
  meses: number[] | "all";
  anio: number;
  /** Single-select mode: one sucursal ID or undefined (all). */
  sucursal?: string;
  /** Multi-select mode: array of sucursal IDs or undefined (all). */
  sucursales?: string[];
  /** Single-select legacy mode: one unidad ID or undefined (all). */
  unidad?: string;
  /** Multi-select mode: array of unidad IDs or undefined (all). */
  unidades?: string[];
}

interface FilterHeaderProps {
  onApplyFilters: (filters: FilterState) => void;
  /** Legacy: name-based list (value === label). Used by resumen.tsx. */
  sucursales?: string[];
  /** Preferred: id-based list. */
  sucursalOptions?: FilterOption[];
  /** When true, sucursal selector becomes a multi-checkbox dropdown. */
  sucursalMulti?: boolean;
  /** Unit filter chips rendered in a second row. */
  unitOptions?: FilterOption[];
  defaultMes?: number[] | "all";
  defaultAnio: number;
  defaultSucursal?: string;
  defaultUnit?: string;
  defaultUnits?: string[];
  showAllMonths?: boolean;
}

export function FilterHeader({
  onApplyFilters,
  sucursales,
  sucursalOptions,
  sucursalMulti = false,
  unitOptions,
  defaultMes,
  defaultAnio,
  defaultSucursal,
  defaultUnit,
  defaultUnits,
}: FilterHeaderProps) {
  const { role, profile } = useAuth();
  const today = new Date();
  const [selectedMonths, setSelectedMonths] = useState<number[] | "all">(
    defaultMes ?? [today.getMonth() + 1],
  );
  const [anio, setAnio] = useState(defaultAnio);
  const [sucursal, setSucursal] = useState(defaultSucursal ?? "all");
  const [selectedSucursales, setSelectedSucursales] = useState<string[]>([]);
  const [selectedUnits, setSelectedUnits] = useState<string[]>(defaultUnits ?? []);

  useEffect(() => {
    if (defaultMes !== undefined) setSelectedMonths(defaultMes);
  }, [defaultMes]);
  useEffect(() => {
    setAnio(defaultAnio);
  }, [defaultAnio]);
  useEffect(() => {
    setSucursal(defaultSucursal ?? "all");
  }, [defaultSucursal]);
  useEffect(() => {
    if (defaultUnits) {
      setSelectedUnits(defaultUnits);
      return;
    }
    setSelectedUnits(defaultUnit ? [defaultUnit] : []);
  }, [defaultUnit, defaultUnits]);

  const resolvedSucursalOptions: FilterOption[] =
    sucursalOptions ?? sucursales?.map((s) => ({ value: s, label: s })) ?? [];

  const allowedUnitIds = useMemo(() => {
    if (role === "gerente_comercial" && profile) {
      return (
        profile.unidades_negocio_ids ??
        (profile.unidad_negocio_id ? [profile.unidad_negocio_id] : [])
      );
    }
    return null;
  }, [role, profile]);

  const resolvedUnitOptions = useMemo(() => {
    if (!unitOptions) return [];
    if (allowedUnitIds) {
      return unitOptions.filter((opt) => allowedUnitIds.includes(opt.value));
    }
    return unitOptions;
  }, [unitOptions, allowedUnitIds]);

  const buildFilters = (unitIds: string[]): FilterState => {
    const filteredUnits = allowedUnitIds
      ? unitIds.filter((id) => allowedUnitIds.includes(id))
      : unitIds;
    if (sucursalMulti) {
      return {
        meses: selectedMonths,
        anio,
        sucursales: selectedSucursales.length > 0 ? selectedSucursales : undefined,
        unidades: filteredUnits.length > 0 ? filteredUnits : undefined,
        unidad: filteredUnits.length === 1 ? filteredUnits[0] : undefined,
      };
    } else {
      return {
        meses: selectedMonths,
        anio,
        sucursal: sucursal === "all" ? undefined : sucursal,
        unidades: filteredUnits.length > 0 ? filteredUnits : undefined,
        unidad: filteredUnits.length === 1 ? filteredUnits[0] : undefined,
      };
    }
  };

  const handleApply = () => {
    onApplyFilters(buildFilters(selectedUnits));
  };

  const applyUnitSelection = (unitIds: string[]) => {
    const filtered = allowedUnitIds ? unitIds.filter((id) => allowedUnitIds.includes(id)) : unitIds;
    setSelectedUnits(filtered);
    onApplyFilters(buildFilters(filtered));
  };

  const handleSelectAllUnits = () => {
    applyUnitSelection([]);
  };

  const toggleSucursal = (id: string) => {
    setSelectedSucursales((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const sucursalLabel =
    selectedSucursales.length === 0
      ? "Todas"
      : selectedSucursales.length === 1
        ? (resolvedSucursalOptions.find((o) => o.value === selectedSucursales[0])?.label ??
          "1 sucursal")
        : `${selectedSucursales.length} sucursales`;

  const mesLabel =
    selectedMonths === "all"
      ? "Todo el año"
      : selectedMonths.length === 1
        ? MESES[selectedMonths[0] - 1]
        : `${selectedMonths.length} meses`;

  return (
    <div className="mb-6 relative z-10">
      {/* ── Row 1: Filter bar ───────────────────────────────────────── */}
      <div className="bg-card border border-border shadow-sm rounded-md px-3 py-2.5 flex items-center gap-4 flex-wrap">
        {/* Meses — multi-select */}
        <Field orientation="horizontal" className="w-auto gap-2">
          <FieldLabel className={FILTER_LABEL_CLASS}>Meses</FieldLabel>
          <Popover>
            <PopoverTrigger className="h-8 w-[140px] flex items-center justify-between px-3 text-sm font-semibold bg-background border border-input hover:bg-muted transition-colors rounded">
              <span className="truncate">{mesLabel}</span>
              <ChevronDown className="shrink-0 ml-2" />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[200px] p-0">
              <Command>
                <CommandList>
                  <CommandGroup>
                    <CommandItem
                      data-checked={selectedMonths === "all"}
                      onSelect={() => setSelectedMonths("all")}
                      className="font-semibold"
                    >
                      Todo el año (YTD)
                    </CommandItem>
                    {MESES.map((m, i) => {
                      const monthVal = i + 1;
                      const isChecked =
                        selectedMonths !== "all" && selectedMonths.includes(monthVal);
                      return (
                        <CommandItem
                          key={monthVal}
                          data-checked={isChecked}
                          onSelect={() => {
                            setSelectedMonths((prev) => {
                              if (prev === "all") return [monthVal];
                              const next = prev.includes(monthVal)
                                ? prev.filter((x) => x !== monthVal)
                                : [...prev, monthVal];
                              return next.length === 0 ? "all" : next;
                            });
                          }}
                        >
                          {m}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </Field>

        {/* Año */}
        <Field orientation="horizontal" className="w-auto gap-2">
          <FieldLabel className={FILTER_LABEL_CLASS}>Año</FieldLabel>
          <Select value={String(anio)} onValueChange={(value) => value && setAnio(parseInt(value))}>
            <SelectTrigger className="h-8 w-[90px] bg-background border border-input text-sm font-semibold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 5 }, (_, i) => today.getFullYear() - 2 + i).map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {/* Sucursal — multi-select */}
        {sucursalMulti && resolvedSucursalOptions.length > 0 && (
          <Field orientation="horizontal" className="w-auto gap-2">
            <FieldLabel className={FILTER_LABEL_CLASS}>Sucursal</FieldLabel>
            <Popover>
              <PopoverTrigger className="h-8 w-[160px] flex items-center justify-between px-3 text-sm font-semibold bg-background border border-input hover:bg-muted transition-colors rounded">
                <span className="truncate">{sucursalLabel}</span>
                <ChevronDown className="shrink-0 ml-2" />
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[220px] p-0">
                <Command>
                  <CommandList>
                    <CommandGroup>
                      <CommandItem
                        data-checked={selectedSucursales.length === 0}
                        onSelect={() => setSelectedSucursales([])}
                        className="font-semibold"
                      >
                        Todas las sucursales
                      </CommandItem>
                      {resolvedSucursalOptions.map((opt) => (
                        <CommandItem
                          key={opt.value}
                          data-checked={selectedSucursales.includes(opt.value)}
                          onSelect={() => toggleSucursal(opt.value)}
                        >
                          {opt.label}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </Field>
        )}

        {/* Sucursal — single-select */}
        {!sucursalMulti && resolvedSucursalOptions.length > 0 && (
          <Field orientation="horizontal" className="w-auto gap-2">
            <FieldLabel className={FILTER_LABEL_CLASS}>Sucursal</FieldLabel>
            <Select
              value={sucursal}
              onValueChange={(v) => setSucursal(v ?? "")}
              disabled={resolvedSucursalOptions.length === 1}
            >
              <SelectTrigger className="h-8 w-[150px] bg-background border border-input text-sm font-semibold">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                {resolvedSucursalOptions.length > 1 && <SelectItem value="all">Todas</SelectItem>}
                {resolvedSucursalOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}

        {/* Apply button — pushed to the right */}
        <Button
          onClick={handleApply}
          className="h-8 px-4 text-xs font-bold tracking-wide w-full sm:w-auto sm:ml-auto transition-[opacity,transform] duration-150 ease-out hover:opacity-90 active:scale-[0.98]"
        >
          Aplicar filtros
        </Button>
      </div>

      {/* ── Row 2: Unit chips bar ────────────────────────────────────── */}
      {resolvedUnitOptions && resolvedUnitOptions.length > 0 && (
        <div className="bg-card border border-t-0 border-border rounded-b-md px-4 py-2.5 flex items-center gap-4 flex-wrap">
          <span className={FILTER_LABEL_CLASS}>Filtrar por unidad:</span>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={selectedUnits.length === 0 ? "default" : "outline"}
              size="sm"
              onClick={handleSelectAllUnits}
              className={cn(
                "h-auto rounded-full px-3.5 py-1 text-xs font-semibold",
                selectedUnits.length === 0
                  ? "bg-foreground text-background hover:bg-foreground/90"
                  : "text-muted-foreground",
              )}
            >
              Todas
            </Button>
            <ToggleGroup
              multiple
              value={selectedUnits}
              onValueChange={applyUnitSelection}
              spacing={2}
            >
              {resolvedUnitOptions.map((opt) => (
                <ToggleGroupItem
                  key={`${opt.value}-${opt.label}`}
                  value={opt.value}
                  variant="outline"
                  className="rounded-full px-3.5 py-1 text-xs font-semibold text-muted-foreground data-[state=on]:bg-foreground data-[state=on]:text-background data-[state=on]:border-border border border-transparent"
                >
                  {opt.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </div>
      )}
    </div>
  );
}
