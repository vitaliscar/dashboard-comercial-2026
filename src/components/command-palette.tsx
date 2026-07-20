import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useAuth } from "@/hooks/use-auth";
import { canAccessModule, type ModuleKey } from "@/lib/permissions";
import {
  LayoutDashboard,
  ClipboardList,
  Wallet,
  TrendingUp,
  GitBranch,
  BellRing,
  Upload,
  Users,
  Award,
  Wrench,
  UserSearch,
  Percent,
  Calculator,
  type LucideIcon,
} from "lucide-react";

interface PaletteRoute {
  to: string;
  label: string;
  module: ModuleKey;
  icon: LucideIcon;
}

// Todas las rutas navegables de la app. La visibilidad real se filtra por rol
// vía canAccessModule — la misma fuente de verdad que app-shell.tsx.
const ROUTES: PaletteRoute[] = [
  { to: "/resumen", label: "Resumen", module: "resumen", icon: LayoutDashboard },
  { to: "/dashboard", label: "Dashboard", module: "dashboard", icon: LayoutDashboard },
  { to: "/minutas", label: "Minutas", module: "minutas", icon: ClipboardList },
  { to: "/cobranzas", label: "Cobranzas", module: "cobranzas", icon: Wallet },
  { to: "/embudo", label: "Embudo Comercial", module: "embudo", icon: GitBranch },
  { to: "/pareto", label: "Análisis Pareto 80/20", module: "pareto", icon: TrendingUp },
  { to: "/asesores", label: "Asesores", module: "asesores", icon: Award },
  { to: "/cliente-360", label: "Cliente 360°", module: "cliente_360", icon: UserSearch },
  { to: "/comisiones", label: "Comisiones Proyectadas", module: "comisiones", icon: Percent },
  { to: "/simulador", label: "Simulador de Presupuesto", module: "simulador", icon: Calculator },
  { to: "/alertas", label: "Torre de Control · Alertas", module: "alertas", icon: BellRing },
  { to: "/carga", label: "Cargar Excel", module: "carga", icon: Upload },
  { to: "/usuarios", label: "Usuarios", module: "usuarios", icon: Users },
  { to: "/servicios", label: "Servicios", module: "servicios", icon: Wrench },
  { to: "/lubfiltros", label: "Lub / Filtros", module: "lubfiltros", icon: Wrench },
  { to: "/equipos", label: "Equipos", module: "equipos", icon: Wrench },
  { to: "/alquiler", label: "Alquiler", module: "alquiler", icon: Wrench },
];

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Paleta de comandos global (Ctrl+K / Cmd+K). Navegación filtrada por rol vía
 * canAccessModule — la misma fuente de verdad que el nav lateral de
 * app-shell.tsx. Ver docs/MASTER_STRATEGY.md §3.3 (F1).
 */
export function CommandPalette({ open, onOpenChange: setOpen }: CommandPaletteProps) {
  const { role } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!open);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, setOpen]);

  const visibleRoutes = ROUTES.filter((r) => canAccessModule(role, r.module));

  const go = (to: string) => {
    setOpen(false);
    navigate({ to });
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Paleta de comandos"
      description="Navega rápido con el teclado"
    >
      <CommandInput placeholder="Ir a una sección…" />
      <CommandList>
        <CommandEmpty>Sin resultados.</CommandEmpty>
        <CommandGroup heading="Navegación">
          {visibleRoutes.map((r) => (
            <CommandItem key={r.to} value={r.label} onSelect={() => go(r.to)}>
              <r.icon className="size-4" />
              {r.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
