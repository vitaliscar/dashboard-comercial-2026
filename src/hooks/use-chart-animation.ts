import { useEffect, useState } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Config de animación para elementos Recharts (Bar/Line/Area/Pie/RadialBar).
 * 300ms ease-out en motion normal; sin animación si el usuario prefiere
 * movimiento reducido — Recharts anima vía JS y no lee prefers-reduced-motion
 * por sí solo, así que hay que leerlo aquí.
 */
export function useChartAnimation() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(REDUCED_MOTION_QUERY);
    const onChange = () => setReducedMotion(mql.matches);
    mql.addEventListener("change", onChange);
    onChange();
    return () => mql.removeEventListener("change", onChange);
  }, []);

  if (reducedMotion) {
    return { isAnimationActive: false } as const;
  }
  return { animationDuration: 300, animationEasing: "ease-out" } as const;
}
