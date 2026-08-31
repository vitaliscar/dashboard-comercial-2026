import { SkeletonBox } from "@/components/ui/skeleton-box";

/**
 * Skeleton de página completa — reemplaza el patrón
 * `{isLoading && <div>Cargando datos…</div>}` (que dejaba la página real
 * renderizando con ceros/vacío mientras tanto) por una forma que calca el
 * grid real de la página: tira de KPIs + bloques de N columnas.
 */
export function PageSkeleton({
  kpis = 4,
  blocks = [],
}: {
  /** Cantidad de KpiCard en la fila superior (0 para omitirla). */
  kpis?: number;
  /** Un bloque por sección de contenido debajo de los KPIs: cols = columnas del grid, height = alto de cada card. */
  blocks?: { cols: number; height?: number }[];
}) {
  return (
    <div className="flex flex-col gap-4">
      {kpis > 0 && (
        <div
          className="grid grid-cols-1 gap-4"
          style={{ gridTemplateColumns: `repeat(${Math.min(kpis, 4)}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: kpis }, (_, i) => (
            <div key={i} className="card-elevated p-5 flex flex-col gap-3">
              <SkeletonBox className="h-3 w-24" />
              <SkeletonBox className="h-7 w-32" />
            </div>
          ))}
        </div>
      )}
      {blocks.map((block, bi) => (
        <div
          key={bi}
          className="grid grid-cols-1 gap-4"
          style={{ gridTemplateColumns: `repeat(${Math.min(block.cols, 6)}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: block.cols }, (_, i) => (
            <SkeletonBox key={i} className="w-full" style={{ height: block.height ?? 220 }} />
          ))}
        </div>
      ))}
    </div>
  );
}
