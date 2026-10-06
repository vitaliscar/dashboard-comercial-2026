import { money } from "@/lib/format";

export const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export function descripcionMetaBase(data: {
  proyeccionVenta: {
    anio: number;
    ventaAcumulada: number;
    mesesConsiderados: number;
    metodo: "proyeccion" | "cierre" | "presupuesto";
  };
}) {
  const proyeccion = data.proyeccionVenta;
  if (proyeccion.metodo === "proyeccion") {
    return `${money(proyeccion.ventaAcumulada)} ÷ ${proyeccion.mesesConsiderados} × 12`;
  }
  if (proyeccion.metodo === "cierre") {
    return `Venta de cierre ${proyeccion.anio}: ${money(proyeccion.ventaAcumulada)}`;
  }
  return `Sin venta registrada; se usa el presupuesto ${proyeccion.anio}`;
}

export function sumaParticipacion(items: Array<{ participacion: number }>) {
  return items.reduce((sum, item) => sum + Number(item.participacion || 0), 0);
}

export function repartoEquitativo(count: number) {
  if (count <= 0) return [];
  const base = Math.floor(10000 / count);
  const remainder = 10000 - base * count;
  return Array.from({ length: count }, (_, index) => (base + (index === count - 1 ? remainder : 0)) / 100);
}

type DistributionInput = {
  unidades: Array<{ unidadNegocioId: string | null; participacion: number; gestionComercialPct: number }>;
  sucursales: Array<{ unidadNegocioId: string | null; participacion: number }>;
  meses: Array<{ unidadNegocioId: string | null; mes: number; participacion: number }>;
};

export function validarDistribucion(
  distribution: DistributionInput | null,
  visibleUnits: Array<{ unidadNegocioId: string | null; gestionComercialPct: number }>,
  isCommercialManager: boolean,
) {
  if (!distribution) return [];
  const errors: string[] = [];
  if (!isCommercialManager && Math.abs(sumaParticipacion(distribution.unidades) - 100) > 0.011) {
    errors.push("Los pesos base por unidad deben sumar 100 %.");
  }
  for (const unit of visibleUnits) {
    const branches = distribution.sucursales.filter((item) => item.unidadNegocioId === unit.unidadNegocioId);
    if (branches.some((item) => item.participacion < 0 || item.participacion > 100) || Math.abs(sumaParticipacion(branches) - 100) > 0.011) {
      errors.push(`La participación de las sucursales de ${unit.unidadNegocioId ?? "la unidad"} debe sumar 100 %.`);
    }
    const months = distribution.meses.filter((item) => item.unidadNegocioId === unit.unidadNegocioId);
    if (months.some((item) => item.participacion < 0 || item.participacion > 100) || Math.abs(sumaParticipacion(months) - 100) > 0.011) {
      errors.push(`La distribución mensual de ${unit.unidadNegocioId ?? "la unidad"} debe sumar 100 %.`);
    }
    if (!isCommercialManager && (unit.gestionComercialPct < 0 || unit.gestionComercialPct > 100)) {
      errors.push("Cada porcentaje de Gestión Comercial debe estar entre 0 % y 100 %.");
    }
  }
  return errors;
}
