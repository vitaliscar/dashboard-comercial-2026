"use client";

import { useState, lazy, Suspense } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Mail, Lock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

const SVG3DLogo = lazy(() => import("@/components/svg-3d-logo"));

export function AuthForm() {
  const router = useRouter();
  const { signIn } = useAuth();
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
        toast.error(
          "Acceso temporalmente bloqueado por 15 minutos debido a demasiados intentos fallidos.",
        );
      } else {
        toast.error(error.message + ` (Intento ${newAttempts}/5)`);
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
      <div
        className="hidden lg:flex flex-col justify-center relative overflow-hidden px-14 py-12"
        style={{ background: "linear-gradient(165deg, #0b1830 0%, #0e2040 60%, #10213e 100%)" }}
      >
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full opacity-60"
          viewBox="0 0 400 400"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M0 320 L120 320 L140 280 L180 280 L200 340 L400 340"
            stroke="#22406e"
            strokeWidth="1.5"
            fill="none"
          />
          <path d="M0 220 L90 220 L110 180 L400 180" stroke="#1a3358" strokeWidth="1" fill="none" />
          <circle cx="120" cy="320" r="3" fill="#f9ca0e" />
          <circle cx="200" cy="340" r="3" fill="#f9ca0e" />
        </svg>

        <div className="relative z-10 flex flex-col gap-8 max-w-md">
          <Suspense
            fallback={<div className="size-[140px] rounded-full bg-white/5 animate-pulse" />}
          >
            <SVG3DLogo size={140} showLabel={false} />
          </Suspense>

          <div className="space-y-4">
            <p className="text-[11px] tracking-[0.14em] uppercase font-display text-[#f9ca0e] font-semibold">
              Consorcio de Cogestión Venequip
            </p>
            <h1 className="font-display text-[34px] font-light leading-[1.14] text-[#eef2fb]">
              La continuidad de su <b className="font-bold text-[#f9ca0e]">operación</b>,
              garantizada.
            </h1>
            <p className="text-sm leading-relaxed text-[#93a2c2] max-w-[36ch]">
              Distribuidores autorizados Generac y Donaldson. Maquinaria Cat, Cummins, JLG, Sullair,
              Bomag y Wacker Neuson para todo el país.
            </p>
          </div>

          <ul className="space-y-2.5">
            {[
              "Servicio técnico posventa especializado",
              "Repuestos originales en stock nacional",
              "Cobertura Barquisimeto y todo el territorio",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-[13px] text-[#cfd7e8]">
                <span className="mt-[6px] size-[6px] rounded-full bg-[#f9ca0e] flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap gap-2.5">
            {["Generac", "Donaldson", "Blumaq"].map((brand) => (
              <span
                key={brand}
                className="text-[11px] px-3 py-1.5 rounded-full border border-[#2c3e63] text-[#a9b6d4]"
              >
                {brand}
              </span>
            ))}
          </div>
        </div>

        <div className="absolute bottom-6 left-14 right-14 flex items-center justify-between text-[11px] font-display tracking-wider text-[#6d7ea3]">
          <span>Dashboard Comercial 2026</span>
          <span>CCV · Todos los derechos reservados</span>
        </div>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-10 bg-background">
        <div className="w-full max-w-sm flex flex-col gap-8">
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
