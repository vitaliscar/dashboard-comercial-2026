"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Mail, Lock, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export function AuthForm() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [lockUntil, setLockUntil] = useState<number | null>(null);
  const [showPassword, setShowPassword] = useState(false);

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
      {/* ── Left panel: brand ────────────────────────────────────────── */}
      <div className="hidden lg:flex items-center justify-center relative overflow-hidden px-14 py-12 bg-sidebar">
        {/* Amber glow behind logo */}
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-[560px] rounded-full opacity-55"
          style={{
            background:
              "radial-gradient(circle, color-mix(in oklab, var(--primary) 55%, transparent) 0%, transparent 70%)",
          }}
          aria-hidden="true"
        />

        <div className="relative z-10 flex flex-col items-center gap-6 text-center">
          <img src="/Logo_CCV.png" alt="CCV" className="size-[140px] object-contain" />
          <h1 className="font-display text-[34px] font-semibold leading-[1.14] text-primary">
            Dashboard Comercial CCV
          </h1>
        </div>

        <div className="absolute bottom-6 left-14 right-14 flex items-center justify-between text-[10px] font-mono tracking-wider text-muted-foreground/50">
          <span>Dashboard Comercial CCV</span>
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
              Dashboard Comercial CCV
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
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
