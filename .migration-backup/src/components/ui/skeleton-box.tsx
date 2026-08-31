import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * Bloque de shimmer (ver @utility skeleton en styles.css) — gradiente
 * animado, no el animate-pulse genérico de shadcn/ui/skeleton.tsx. Extraído
 * de resumen/page.tsx para reusar en cualquier tabla/página con isLoading.
 */
export function SkeletonBox({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={cn("skeleton rounded", className)} style={style} />;
}

/** Fila de tabla con N celdas de shimmer — mismo grid que la fila real. */
export function SkeletonTableRow({
  columns,
  colSpan,
}: {
  /** Ancho relativo de cada celda (Tailwind width class), una por columna. */
  columns: string[];
  colSpan?: number;
}) {
  return (
    <tr className="hover:bg-transparent">
      <td colSpan={colSpan ?? columns.length} className="p-0">
        <div className="flex items-center gap-4 px-4 py-3">
          {columns.map((w, i) => (
            <SkeletonBox key={i} className={cn("h-3.5", w)} />
          ))}
        </div>
      </td>
    </tr>
  );
}
