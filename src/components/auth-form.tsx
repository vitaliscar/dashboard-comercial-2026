"use client";

import { useState, useEffect, lazy, Suspense } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Mail, Lock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

const Logo3DGlb = lazy(() => import("@/components/logo-3d-glb"));

export function AuthForm() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [lockUntil, setLockUntil] = useState<number | null>(null);

  const resetAttempts = () => {
    setAttempts(0);
    setLockUntil(null);
    setErrorMessage(null);
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("login_attempts");
      sessionStorage.removeItem("login_lock_until");
    }
  };

  useEffect(() => {
    resetAttempts();
  }, []);

  const isLocked = lockUntil !== null && lockUntil > Date.now();
  const minutesRemaining = isLocked ? Math.ceil((lockUntil - Date.now()) / 60000) : 0;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) {
      const msg = `Demasiados intentos fallidos. Intenta de nuevo en ${minutesRemaining} minutos.`;
      setErrorMessage(msg);
      toast.error(msg);
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    const { error } = await signIn(email, password);

    if (error) {
      setLoading(false);
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      sessionStorage.setItem("login_attempts", String(newAttempts));

      if (newAttempts >= 5) {
        const lockTime = Date.now() + 15 * 60 * 1000;
        setLockUntil(lockTime);
        sessionStorage.setItem("login_lock_until", String(lockTime));
        const msg =
          "Acceso temporalmente bloqueado por 15 minutos debido a demasiados intentos fallidos.";
        setErrorMessage(msg);
        toast.error(msg);
      } else {
        const msg = error.message + ` (Intento ${newAttempts}/5)`;
        setErrorMessage(msg);
        toast.error(msg);
      }
      return;
    }

    setLoading(false);
    sessionStorage.removeItem("login_attempts");
    sessionStorage.removeItem("login_lock_until");
    toast.success("Sesión iniciada");
    router.push("/resumen");
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr] bg-background">
      {/* ── Left panel: brand + 3D logo ─────────────────────────────── */}
      <div
        className="hidden lg:flex flex-col justify-center relative overflow-hidden px-14 py-12"
        style={{ background: "oklch(0.08 0.01 255)" }}
      >
        {/* Subtle grid texture */}
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.04]"
          viewBox="0 0 400 400"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="400" height="400" fill="url(#grid)" />
        </svg>

        {/* Amber glow behind logo */}
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-[400px] rounded-full opacity-20"
          style={{
            background:
              "radial-gradient(circle, oklch(0.78 0.16 75 / 0.4) 0%, transparent 70%)",
          }}
          aria-hidden="true"
        />

        <div className="relative z-10 flex flex-col gap-8 max-w-md">
          <Suspense
            fallback={
              <div className="size-[220px] rounded-full bg-foreground/5 animate-pulse" />
            }
          >
            <Logo3DGlb size={220} onReady={() => {}} />
          </Suspense>

          <div className="space-y-4">
            <p className="text-[10px] tracking-[0.18em] uppercase font-mono text-primary font-bold">
              Consorcio de Cogestión Venequip
            </p>
            <h1 className="font-display text-[34px] font-light leading-[1.14] text-foreground">
              La continuidad de su{" "}
              <b className="font-semibold text-primary">operación</b>, garantizada.
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground max-w-[36ch]">
              Distribuidores autorizados Generac y Donaldson. Maquinaria Cat, Cummins, JLG,
              Sullair, Bomag y Wacker Neuson para todo el país.
            </p>
          </div>

          <ul className="space-y-2.5">
            {[
              "Servicio técnico posventa especializado",
              "Repuestos originales en stock nacional",
              "Cobertura Barquisimeto y todo el territorio",
            ].map((item) => (
              <li
                key={item}
                className="flex items-start gap-2.5 text-[13px] text-foreground/70"
              >
                <span className="mt-[6px] size-[5px] rounded-full bg-primary flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap gap-2.5">
            {["Generac", "Donaldson", "Blumaq"].map((brand) => (
              <span
                key={brand}
                className="text-[11px] px-3 py-1.5 rounded-full border border-border bg-card/40 text-muted-foreground font-mono"
              >
                {brand}
              </span>
            ))}
          </div>
        </div>

        <div className="absolute bottom-6 left-14 right-14 flex items-center justify-between text-[10px] font-mono tracking-wider text-muted-foreground/50">
          <span>Dashboard Comercial 2026</span>
          <span>CCV · Todos los derechos reservados</span>
        </div>
      </div>

      {/* ── Right panel: login form ──────────────────────────────────── */}
      <div className="flex items-center justify-center p-6 sm:p-10 bg-background">
        <div className="w-full max-w-sm flex flex-col gap-8">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3">
            <img src="/Logo_CCV.png" alt="CCV" className="size-9 object-contain" />
            <div className="font-display font-semibold text-lg text-foreground">
              CCV Dashboard
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-[10px] tracking-[0.18em] font-mono text-primary font-bold uppercase">
              Acceso al panel
            </p>
            <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">
              Iniciar sesión
            </h2>
            <p className="text-sm text-muted-foreground">
              Ingresa tus credenciales para acceder al panel.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium text-foreground">
                  Correo electrónico
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@ccv.com"
                    className="pl-9 h-10 bg-input-background border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-ring"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pass" className="text-sm font-medium text-foreground">
                  Contraseña
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    id="pass"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pl-9 h-10 bg-input-background border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-ring"
                  />
                </div>
              </div>
            </div>

            {errorMessage && (
              <div
                role="alert"
                aria-live="assertive"
                className="text-xs font-semibold text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3"
              >
                {errorMessage}
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-11 text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              disabled={loading || isLocked}
            >
              {loading && <Loader2 className="animate-spin mr-2 size-4" />}
              {isLocked ? `Bloqueado por ${minutesRemaining} min` : "Ingresar"}
            </Button>

            {(isLocked || attempts > 0) && (
              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={resetAttempts}
                  className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
                >
                  Reiniciar conteo de intentos fallidos
                </button>
              </div>
            )}
          </form>

          <p className="text-xs text-muted-foreground text-center leading-relaxed">
            La creación de cuentas está restringida. Contacta al administrador del sistema.
          </p>
        </div>
      </div>
    </div>
  );
}
