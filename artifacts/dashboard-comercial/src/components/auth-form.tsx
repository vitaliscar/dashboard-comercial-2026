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
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    const { error } = await signIn(email, password);

    if (error) {
      setLoading(false);
      setErrorMessage(error.message);
      return;
    }

    setLoading(false);
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

        <div className="relative z-10 flex w-full max-w-xl flex-col items-center text-center">
          <div
            className="ccv-login-orbit relative flex min-h-[340px] w-full items-center justify-center overflow-hidden p-8"
          >
            <div className="ccv-login-center relative z-10 flex flex-col items-center gap-5">
              <img
                src="/Logo_CCV.png"
                alt="Logo Centro Comercial VENEQUIP"
                className="ccv-login-panel-logo object-contain"
              />
              <p className="ccv-login-panel-title font-sans text-base font-extrabold uppercase tracking-[0.14em] text-white sm:text-lg">
                CCV / Inteligencia comercial
              </p>
            </div>
          </div>
          <div className="ccv-login-benefits mt-7 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[10px] uppercase tracking-[0.14em] text-white/55">
            <span>Ventas</span>
            <span>Metas</span>
            <span>Sucursales</span>
            <span>Unidades de negocio</span>
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
            <img
              src="/Logo_CCV.png"
              alt="CCV"
              className="size-9 object-contain"
            />
            <div className="font-sans font-extrabold text-sm uppercase tracking-wide text-foreground">
              Centro Comercial CCV
              <span className="mt-0.5 block font-mono text-[9px] font-medium tracking-[0.18em] text-muted-foreground">
                DECISIONES 2026
              </span>
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

          <form
            onSubmit={handleLogin}
            className="ccv-login-fields space-y-5"
            aria-busy={loading}
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <Label
                  htmlFor="email"
                  className="text-sm font-medium text-foreground"
                >
                  Correo electrónico
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    aria-describedby={errorMessage ? "login-error" : undefined}
                    disabled={loading}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@ccv.com"
                    className="pl-9 h-11 bg-input-background border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-ring"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor="pass"
                  className="text-sm font-medium text-foreground"
                >
                  Contraseña
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    id="pass"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    aria-describedby={errorMessage ? "login-error" : undefined}
                    disabled={loading}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pl-9 pr-10 h-11 bg-input-background border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-ring"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={
                      showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                    }
                    className="absolute right-1 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {errorMessage && (
              <div
                id="login-error"
                role="alert"
                className="text-xs font-semibold text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3"
              >
                {errorMessage}
              </div>
            )}

            <Button
              type="submit"
              className="ccv-login-submit w-full h-12 text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              disabled={loading}
            >
              {loading && (
                <Loader2
                  className="animate-spin mr-2 size-4"
                  aria-hidden="true"
                />
              )}
              {loading ? "Verificando…" : "Continuar"}
            </Button>
          </form>

          <p className="ccv-login-footnote text-[11px] text-muted-foreground leading-relaxed">
            Acceso privado para equipos CCV. Si necesitas una cuenta, contacta
            al administrador del sistema.
          </p>
        </div>
      </div>
    </div>
  );
}
