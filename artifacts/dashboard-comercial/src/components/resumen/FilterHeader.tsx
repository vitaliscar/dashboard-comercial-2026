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
import { ChevronDown } from "@/components/icons";
import { useAuth } from "@/hooks/use-auth";
import { canPickSucursalFilter } from "@/lib/permissions";

const FILTER_LABEL_CLASS =
  "text-xs font-semibold text-muted-foreground tracking-wide whitespace-nowrap";

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
  sucursal?: string;
  sucursales?: string[];
  unidad?: string;
  unidades?: string[];
}

interface FilterHeaderProps {
  onApplyFilters: (filters: FilterState) => void;
  sucursales?: string[];
  sucursalOptions?: FilterOption[];
  sucursalMulti?: boolean;
  unitOptions?: FilterOption[];
  defaultMes?: number[] | "all";
  defaultAnio: number;
  defaultSucursal?: string;
  /** Hidrata el multi-select de sucursales desde shared filters. */
  defaultSucursales?: string[];
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
  defaultSucursales,
  defaultUnit,
  defaultUnits,
}: FilterHeaderProps) {
  const { role, profile } = useAuth();
  // No usar new Date() en el estado inicial: SSR y la primera pintada del
  // cliente deben coincidir (hydration). Si defaultMes no llegó todavía,
  // "all" es un placeholder determinístico – el useEffect de abajo lo
  // corrige apenas defaultMes esté disponible.
  const [selectedMonths, setSelectedMonths] = useState<number[] | "all">(defaultMes ?? "all");
  const [anio, setAnio] = useState(defaultAnio);
  const [sucursal, setSucursal] = useState(defaultSucursal ?? "all");
  const [selectedSucursales, setSelectedSucursales] = useState<string[]>(defaultSucursales ?? []);
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
    if (defaultSucursales !== undefined) setSelectedSucursales(defaultSucursales);
  }, [defaultSucursales]);
  useEffect(() => {
    if (defaultUnits) {
      setSelectedUnits(defaultUnits);
      return;
    }
    setSelectedUnits(defaultUnit ? [defaultUnit] : []);
  }, [defaultUnit, defaultUnits]);

  // Coordinador/asesor: nunca mostrar selector de sucursal aunque el padre
  // pase opciones (RLS ya fija su alcance).
  const canPickSucursal = canPickSucursalFilter(role);
  const resolvedSucursalOptions: FilterOption[] = canPickSucursal
    ? (sucursalOptions ?? sucursales?.map((s) => ({ value: s, label: s })) ?? [])
    : [];

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
    <div className="ccv-filter-shell sticky top-14 z-10 mb-4 w-full bg-background/95 pt-2 pb-1 backdrop-blur">
      {/* ── Row 1: Filter bar ───────────────────────────────────────── */}
      <div className="ccv-filter-bar flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
        {/* Meses */}
        <Field orientation="horizontal" className="w-auto gap-2">
          <FieldLabel className={FILTER_LABEL_CLASS}>Meses</FieldLabel>
          <Popover>
            <PopoverTrigger aria-label="Filtrar por meses" className="h-9 w-[140px] flex items-center justify-between px-3 text-sm font-semibold bg-input-background border border-border hover:bg-accent transition-colors rounded text-foreground">
              <span className="truncate">{mesLabel}</span>
              <ChevronDown className="shrink-0 ml-2 text-muted-foreground" />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[200px] p-0 bg-popover border-border">
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
            <SelectTrigger aria-label="Filtrar por año" className="h-9 w-[90px] bg-input-background border border-border text-sm font-semibold text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border">
              {Array.from({ length: 5 }, (_, i) => defaultAnio - 2 + i).map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {/* Sucursal – multi-select */}
        {sucursalMulti && resolvedSucursalOptions.length > 0 && (
          <Field orientation="horizontal" className="w-auto gap-2">
            <FieldLabel className={FILTER_LABEL_CLASS}>Sucursal</FieldLabel>
            <Popover>
              <PopoverTrigger aria-label="Filtrar por sucursal" className="h-9 w-[160px] flex items-center justify-between px-3 text-sm font-semibold bg-input-background border border-border hover:bg-accent transition-colors rounded text-foreground">
                <span className="truncate">{sucursalLabel}</span>
                <ChevronDown className="shrink-0 ml-2 text-muted-foreground" />
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[220px] p-0 bg-popover border-border">
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

        {/* Sucursal – single-select */}
        {!sucursalMulti && resolvedSucursalOptions.length > 0 && (
          <Field orientation="horizontal" className="w-auto gap-2">
            <FieldLabel className={FILTER_LABEL_CLASS}>Sucursal</FieldLabel>
            <Select
              items={[{ value: "all", label: "Todas" }, ...resolvedSucursalOptions]}
              value={sucursal}
              onValueChange={(v) => setSucursal(v ?? "")}
              disabled={resolvedSucursalOptions.length === 1}
            >
              <SelectTrigger aria-label="Filtrar por sucursal" className="h-9 w-[150px] bg-input-background border border-border text-sm font-semibold text-foreground">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
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

      {/* Con 1 sola unidad asignada (gerente comercial de una sola unidad,
          p.ej. Repuestos, Servicios o Lub/Filtros) no hay nada entre qué
          navegar, así que el filtro no aporta – solo se muestra con 2+. */}
      {resolvedUnitOptions && resolvedUnitOptions.length > 1 && (
        <div className="ccv-filter-units flex min-w-0 items-center gap-2">
          <FieldLabel className={FILTER_LABEL_CLASS}>Unidad</FieldLabel>
          <Popover>
            <PopoverTrigger aria-label="Filtrar por unidad" className="ccv-filter-unit-trigger flex h-9 items-center gap-2 rounded-md border border-border bg-input-background px-3 text-sm font-semibold text-foreground hover:bg-accent">
              <span className="truncate">
                {selectedUnits.length === 0
                  ? "Todas"
                  : selectedUnits.length === 1
                    ? resolvedUnitOptions.find((unit) => unit.value === selectedUnits[0])?.label ?? "1 unidad"
                    : `${selectedUnits.length} unidades`}
              </span>
              <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[220px] p-0 bg-popover border-border">
              <div role="group" aria-label="Seleccionar unidades" className="grid gap-1 p-1">
                <Button
                  type="button"
                  variant="ghost"
                  aria-pressed={selectedUnits.length === 0}
                  onClick={handleSelectAllUnits}
                  className="justify-start font-semibold"
                >
                  Todas las unidades
                </Button>
                {resolvedUnitOptions.map((opt) => {
                  const pressed = selectedUnits.includes(opt.value);
                  return (
                    <Button
                      key={`${opt.value}-${opt.label}`}
                      type="button"
                      variant="ghost"
                      aria-pressed={pressed}
                      onClick={() => applyUnitSelection(
                        pressed ? selectedUnits.filter((id) => id !== opt.value) : [...selectedUnits, opt.value],
                      )}
                      className="justify-start"
                    >
                      <span aria-hidden="true" className="w-4 text-primary">{pressed ? "✓" : ""}</span>
                      {opt.label}
                    </Button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}

        {/* Apply button */}
        <Button
          onClick={handleApply}
          className="ml-auto h-9 w-full px-4 text-xs font-semibold sm:w-auto"
        >
          Aplicar filtros
        </Button>
      </div>
    </div>
  );
}
