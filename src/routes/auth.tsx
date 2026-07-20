import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState, lazy, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Mail, Lock } from "lucide-react";

const SVG3DLogo = lazy(() => import("@/components/svg-3d-logo"));

export const Route = createFileRoute("/auth")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/resumen" });
  },
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [attempts, setAttempts] = useState(() => {
    if (typeof window !== "undefined") {
      return Number(sessionStorage.getItem("login_attempts") || "0");
    }
    return 0;
  });
  const [lockUntil, setLockUntil] = useState<number | null>(() => {
    if (typeof window !== "undefined") {
      const val = sessionStorage.getItem("login_lock_until");
      return val ? Number(val) : null;
    }
    return null;
  });

  const isLocked = lockUntil !== null && lockUntil > Date.now();
  const minutesRemaining = isLocked ? Math.ceil((lockUntil - Date.now()) / 60000) : 0;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) {
      toast.error(`Demasiados intentos fallidos. Intenta de nuevo en ${minutesRemaining} minutos.`);
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setLoading(false);
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      sessionStorage.setItem("login_attempts", String(newAttempts));

      if (newAttempts >= 5) {
        const lockTime = Date.now() + 15 * 60 * 1000;
        setLockUntil(lockTime);
        sessionStorage.setItem("login_lock_until", String(lockTime));
        toast.error(
          "Acceso temporalmente bloqueado por 15 minutos debido a demasiados intentos fallidos.",
        );
      } else {
        toast.error(loginErrorMessage(error.message) + ` (Intento ${newAttempts}/5)`);
      }
      return;
    }

    setLoading(false);
    sessionStorage.removeItem("login_attempts");
    sessionStorage.removeItem("login_lock_until");
    toast.success("Sesión iniciada");
    nav({ to: "/resumen" });
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr] bg-background">
      {/* Panel izquierdo — branding */}
      <div className="hidden lg:flex flex-col items-center justify-center relative overflow-hidden bg-sidebar border-r border-border">
        {/* Gradiente ambiental sutil */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% 40%, color-mix(in oklab, var(--primary) 12%, transparent), transparent 70%)",
          }}
          aria-hidden="true"
        />
        {/* Grid sutil */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "linear-gradient(var(--primary) 1px, transparent 1px), linear-gradient(90deg, var(--primary) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
          aria-hidden="true"
        />

        <div className="relative z-10 flex flex-col items-center gap-6 px-12">
          <Suspense
            fallback={
              <div className="size-[200px] rounded-full bg-sidebar-accent/40 animate-pulse" />
            }
          >
            <SVG3DLogo size={200} showLabel={false} />
          </Suspense>
          <div className="text-center space-y-2">
            <p className="text-[10px] tracking-widest font-display text-primary font-semibold">
              CCV Industrial
            </p>
            <h1 className="font-display text-2xl font-bold tracking-tight text-sidebar-foreground">
              Gestión Comercial CCV
            </h1>
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
              Cotizaciones, facturación, cobranzas y análisis comercial en tiempo real.
            </p>
          </div>
        </div>

        {/* Footer decorativo */}
        <div className="absolute bottom-6 left-6 right-6 flex items-center justify-between text-[11px] font-display tracking-wider text-muted-foreground">
          <span>Dashboard Comercial 2026</span>
          <span>CCV · Todos los derechos reservados</span>
        </div>
      </div>

      {/* Panel derecho — formulario */}
      <div className="flex items-center justify-center p-6 sm:p-10 bg-background">
        <div className="w-full max-w-sm flex flex-col gap-8">
          {/* Logo mobile */}
          <div className="lg:hidden flex items-center gap-3">
            <img src="/logo-ccv.png" alt="CCV" className="size-9 object-contain" />
            <div className="font-display font-semibold text-lg text-foreground">CCV Dashboard</div>
          </div>

          <div className="space-y-1.5">
            <p className="text-[10px] tracking-widest font-display text-muted-foreground font-semibold">
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
                <Label htmlFor="email" className="text-sm font-medium">
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
                    className="pl-9 h-10"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pass" className="text-sm font-medium">
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
                    className="pl-9 h-10"
                  />
                </div>
              </div>
            </div>
            <Button
              type="submit"
              className="w-full h-11 text-sm font-semibold"
              disabled={loading || isLocked}
            >
              {loading && <Loader2 className="animate-spin mr-2 size-4" />}
              {isLocked ? `Bloqueado por ${minutesRemaining} min` : "Ingresar"}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center leading-relaxed">
            La creación de cuentas está restringida. Contacta al administrador del sistema.
          </p>
        </div>
      </div>
    </div>
  );
}

function loginErrorMessage(message: string): string {
  if (/invalid login credentials/i.test(message)) return "Correo o contraseña incorrectos.";
  if (/email not confirmed/i.test(message)) return "Debes confirmar tu correo antes de ingresar.";
  return "No se pudo iniciar sesión. Intenta nuevamente.";
}
