"use client";

import { useEffect, useRef } from "react";

interface AsciiFlowTrailProps {
  /** Hex or rgb() tint color for the glyphs. Defaults to the `--primary` design token. */
  tint?: string;
  /** 0-100: how much the trail follows the real cursor vs. autonomous drift */
  trackMouse?: number;
  /** 0-100: trail smoothing */
  momentum?: number;
  className?: string;
}

const BAYER_MATRIX = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

const GLYPHS = "▣▤▥▦▧▨▩ ".split("").reverse().join("");
const CHAR_SIZE = 11;
const MAX_DIST = 110;
const MAX_TRAIL_LENGTH = 40;

function resolveTintRgb(
  tint: string | undefined,
  canvas: HTMLCanvasElement,
): [number, number, number] {
  const source = tint ?? getComputedStyle(canvas).getPropertyValue("--primary-rgb").trim();
  if (source && /^\d+\s*,\s*\d+\s*,\s*\d+$/.test(source)) {
    const [r, g, b] = source.split(",").map((n) => parseInt(n.trim(), 10));
    return [r, g, b];
  }
  if (source?.startsWith("#")) {
    return [
      parseInt(source.slice(1, 3), 16),
      parseInt(source.slice(3, 5), 16),
      parseInt(source.slice(5, 7), 16),
    ];
  }
  // Probe via an offscreen element so the browser resolves oklch()/var() to rgb() for us.
  const probe = document.createElement("span");
  probe.style.color = "var(--primary)";
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  document.body.removeChild(probe);
  const match = resolved.match(/\d+/g);
  if (match && match.length >= 3) {
    return [Number(match[0]), Number(match[1]), Number(match[2])];
  }
  return [240, 162, 29];
}

export function AsciiFlowTrail({
  tint,
  trackMouse = 25,
  momentum = 55,
  className,
}: AsciiFlowTrailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const updateSize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    };
    updateSize();

    let resizeTimeout = 0;
    const handleResize = () => {
      window.clearTimeout(resizeTimeout);
      resizeTimeout = window.setTimeout(updateSize, 150);
    };
    window.addEventListener("resize", handleResize);

    const mousePos = { x: canvas.width / 2, y: canvas.height / 2 };
    const smoothPos = { x: canvas.width / 2, y: canvas.height / 2 };
    const trail: { x: number; y: number; life: number }[] = [];
    let time = 0;
    let frameId = 0;

    const handleMouse = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mousePos.x = e.clientX - rect.left;
      mousePos.y = e.clientY - rect.top;
    };
    canvas.addEventListener("mousemove", handleMouse);

    const [tintR, tintG, tintB] = resolveTintRgb(tint, canvas);

    ctx.font = `${CHAR_SIZE}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const animate = () => {
      time += 0.016;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const autoX = canvas.width / 2 + Math.sin(time * 0.6) * (canvas.width * 0.28);
      const autoY = canvas.height / 2 + Math.cos(time * 0.42) * (canvas.height * 0.28);
      const trackFactor = trackMouse / 100;
      const targetX = mousePos.x * trackFactor + autoX * (1 - trackFactor);
      const targetY = mousePos.y * trackFactor + autoY * (1 - trackFactor);

      const momentumFactor = 1 - (momentum / 100) * 0.95;
      smoothPos.x += (targetX - smoothPos.x) * momentumFactor;
      smoothPos.y += (targetY - smoothPos.y) * momentumFactor;

      trail.push({ x: smoothPos.x, y: smoothPos.y, life: 1 });
      while (trail.length > MAX_TRAIL_LENGTH) trail.shift();
      trail.forEach((p) => (p.life -= 0.02));
      for (let i = trail.length - 1; i >= 0; i--) {
        if (trail[i].life <= 0) trail.splice(i, 1);
      }

      ctx.globalCompositeOperation = "screen";

      // Only visit cells inside each trail point's radius instead of the full canvas grid.
      const visited = new Set<string>();
      for (const point of trail) {
        const minCol = Math.max(0, Math.floor((point.x - MAX_DIST) / CHAR_SIZE));
        const maxCol = Math.ceil((point.x + MAX_DIST) / CHAR_SIZE);
        const minRow = Math.max(0, Math.floor((point.y - MAX_DIST) / CHAR_SIZE));
        const maxRow = Math.ceil((point.y + MAX_DIST) / CHAR_SIZE);

        for (let row = minRow; row <= maxRow; row++) {
          for (let col = minCol; col <= maxCol; col++) {
            const key = `${col},${row}`;
            if (visited.has(key)) continue;
            visited.add(key);

            const x = col * CHAR_SIZE + CHAR_SIZE / 2;
            const y = row * CHAR_SIZE + CHAR_SIZE / 2;

            let intensity = 0;
            for (const p of trail) {
              const dist = Math.hypot(x - p.x, y - p.y);
              if (dist < MAX_DIST) {
                const value = (1 - dist / MAX_DIST) * p.life * 0.85;
                intensity = Math.max(intensity, value);
              }
            }

            const threshold = BAYER_MATRIX[((row % 4) + 4) % 4][((col % 4) + 4) % 4] / 16;
            intensity = intensity > threshold ? intensity : intensity * 0.5;
            intensity = Math.max(0, Math.min(1, intensity));

            if (intensity > 0.03) {
              const charIndex = Math.min(GLYPHS.length - 1, Math.floor(intensity * GLYPHS.length));
              const char = GLYPHS[charIndex];
              const alpha = intensity * 0.9;
              ctx.fillStyle = `rgba(${tintR}, ${tintG}, ${tintB}, ${alpha})`;
              ctx.fillText(char, x, y);
            }
          }
        }
      }

      ctx.globalCompositeOperation = "source-over";
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);

    return () => {
      window.clearTimeout(resizeTimeout);
      window.removeEventListener("resize", handleResize);
      canvas.removeEventListener("mousemove", handleMouse);
      cancelAnimationFrame(frameId);
    };
  }, [tint, trackMouse, momentum]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      style={{ display: "block", width: "100%", height: "100%" }}
    />
  );
}
