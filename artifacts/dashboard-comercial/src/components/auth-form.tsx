"use client";

import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Mail, Lock, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export function AuthForm() {
  const [, setLocation] = useLocation();
  const { signIn } = useAuth();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Leer el estado de bloqueo existente al montar (no limpiarlo) — antes se
  // reseteaba incondicionalmente aquí, así que cerrar y reabrir la pestaña
  // hacía que el contador visual mintiera sobre cuántos intentos quedaban.
  // El límite real (5 intentos/15 min, por email+IP) vive server-side en
  // artifacts/api-server/src/routes/auth.ts y sigue aplicando aunque este
  // contador local se pierda; esto solo corrige que el aviso visible sea fiel.
  const [attempts, setAttempts] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    return Number(sessionStorage.getItem("login_attempts") ?? 0);
  });
  const [lockUntil, setLockUntil] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const stored = sessionStorage.getItem("login_lock_until");
    return stored ? Number(stored) : null;
  });
  const [showPassword, setShowPassword] = useState(false);

  const isLocked = lockUntil !== null && lockUntil > Date.now();
  const minutesRemaining = isLocked ? Math.ceil((lockUntil - Date.now()) / 60000) : 0;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) {
      const msg = `Demasiados intentos fallidos. Intenta de nuevo en ${minutesRemaining} minutos.`;
      setErrorMessage(msg);
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
      } else {
        const msg = error.message + ` (Intento ${newAttempts}/5)`;
        setErrorMessage(msg);
      }
      return;
    }

    setLoading(false);
    sessionStorage.removeItem("login_attempts");
    sessionStorage.removeItem("login_lock_until");
    toast.success("Sesión iniciada");
    // The dashboard entry selects the correct home for the authenticated role
    // and assigned units; sending every role to /resumen can bypass that path.
    setLocation("/");
  };

  return (
    <div className="ccv-login min-h-screen grid lg:grid-cols-[1.08fr_0.92fr] bg-background">
      {/* ── Left panel: brand ────────────────────────────────────────── */}
      <div className="ccv-login-brand hidden lg:flex items-center justify-center relative overflow-hidden px-14 py-12 bg-sidebar">
        {/* Amber glow behind logo */}
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-[560px] rounded-full opacity-55"
          style={{
            background:
              "radial-gradient(circle, color-mix(in oklab, var(--primary) 55%, transparent) 0%, transparent 70%)",
          }}
          aria-hidden="true"
        />

        <div className="relative z-10 flex w-full max-w-xl flex-col items-start text-left">
          <div className="ccv-login-brandmark flex items-center gap-4">
            <img src="/Logo_CCV.png" alt="Centro Comercial VENEQUIP" className="size-[76px] object-contain" />
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-white">Centro Comercial</p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.24em] text-white/55">Venequip · Decisiones 2026</p>
            </div>
          </div>
          <div className="ccv-login-orbit relative mt-16 flex min-h-[340px] w-full flex-col justify-between overflow-hidden p-8" aria-hidden="true">
            <div className="relative z-10 max-w-lg">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#e2f0c5]">CCV / Inteligencia comercial</span>
              <p className="mt-5 font-display text-5xl leading-[0.98] text-white">Del plan<br />a la <em className="font-normal text-[#d7b27b]">ejecución.</em></p>
              <p className="mt-5 max-w-sm text-sm leading-6 text-white/65">Metas, ventas y seguimiento comercial en un solo espacio de trabajo.</p>
            </div>
            <div className="ccv-login-route relative z-10 mt-10 flex items-center gap-0">
              <span>Plan</span><i aria-hidden="true" /><span>Gestión</span><i aria-hidden="true" /><span>Resultado</span>
            </div>
          </div>
          <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[10px] uppercase tracking-[0.14em] text-white/55">
            <span>Ventas</span><span>Metas</span><span>Sucursales</span><span>Unidades de negocio</span>
          </div>
        </div>

        <div className="absolute bottom-6 left-14 right-14 flex items-center justify-between text-[10px] font-mono tracking-wider text-muted-foreground/50">
          <span>Dashboard Comercial CCV</span>
          <span>CCV · Todos los derechos reservados</span>
        </div>
      </div>

      {/* ── Right panel: login form ──────────────────────────────────── */}
      <div className="ccv-login-form flex items-center justify-center p-6 sm:p-10 bg-background">
        <div className="ccv-login-card w-full max-w-[390px] flex flex-col gap-8">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3">
            <img src="/Logo_CCV.png" alt="CCV" className="size-9 object-contain" />
            <div className="font-sans font-extrabold text-sm uppercase tracking-wide text-foreground">
              Centro Comercial CCV
              <span className="mt-0.5 block font-mono text-[9px] font-medium tracking-[0.18em] text-muted-foreground">DECISIONES 2026</span>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[10px] tracking-[0.18em] font-mono text-primary font-bold uppercase">
              ESPACIO DE TRABAJO · CCV
            </p>
            <h2 className="font-display text-4xl font-medium tracking-tight text-foreground">
              Iniciar sesión
            </h2>
            <p className="text-sm text-muted-foreground">
              Accede a la información disponible para tu equipo.
            </p>
          </div>

          <form onSubmit={handleLogin} className="ccv-login-fields space-y-5">
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
                    className="pl-9 h-11 bg-input-background border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-ring"
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
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pl-9 pr-10 h-11 bg-input-background border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-ring"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                    className="absolute right-1 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
            </div>

            {errorMessage && (
              <div
                role="alert"
                className="text-xs font-semibold text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3"
              >
                {errorMessage}
              </div>
            )}

            <Button
              type="submit"
              className="ccv-login-submit w-full h-12 text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              disabled={loading || isLocked}
            >
              {loading && <Loader2 className="animate-spin mr-2 size-4" />}
              {isLocked ? `Bloqueado por ${minutesRemaining} min` : "Continuar"}
            </Button>
          </form>

          <p className="ccv-login-footnote text-[11px] text-muted-foreground leading-relaxed">
            Acceso privado para equipos CCV. Si necesitas una cuenta, contacta al administrador del sistema.
          </p>
        </div>
      </div>
    </div>
  );
}
