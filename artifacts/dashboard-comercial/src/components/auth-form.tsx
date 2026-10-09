"use client";

import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowRight, Eye, EyeOff, Loader2 } from "@/components/icons";
import { useAuth } from "@/hooks/use-auth";

export function AuthForm() {
  const [, setLocation] = useLocation();
  const { signIn } = useAuth();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
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
    setLocation("/");
  };

  return (
    <main className="ccv-login-studio">
      <section className="ccv-login-art" aria-label="Dashboard Comercial">
        <div className="ccv-login-art-top" aria-hidden="true">
          <span>CCV</span>
          <span>2026 / 01</span>
        </div>

        <div className="ccv-login-artwork">
          <div className="ccv-login-artwork-frame">
            <span className="ccv-login-artwork-index" aria-hidden="true">DC / 26</span>
            <img
              src={`${import.meta.env.BASE_URL}Logo_CCV.png`}
              alt="Logo de Dashboard Comercial"
              className="ccv-login-artwork-logo"
            />
            <span className="ccv-login-artwork-corner" aria-hidden="true" />
          </div>
        </div>

        <div className="ccv-login-art-bottom" aria-label="Áreas de trabajo">
          <span>Ventas</span>
          <span>Metas</span>
          <span>Sucursales</span>
          <span>Unidades de negocio</span>
        </div>
      </section>

      <section className="ccv-login-access" aria-labelledby="login-title">
        <div className="ccv-login-access-inner">
          <div className="ccv-login-mobile-mark">
            <img src={`${import.meta.env.BASE_URL}Logo_CCV.png`} alt="Dashboard Comercial" />
          </div>

          <div className="ccv-login-intro">
            <span className="ccv-login-overline">DASHBOARD COMERCIAL <span aria-hidden="true">/</span> ACCESO</span>
            <h1 id="login-title">Iniciar sesión<span aria-hidden="true">.</span></h1>
            <p>Ventas, metas y cartera con el alcance de tu equipo.</p>
          </div>

          <form onSubmit={handleLogin} className="ccv-login-form-new" aria-busy={loading}>
            <div className="ccv-login-field">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                name="email"
                type="email"
                inputMode="email"
                required
                autoComplete="email"
                aria-invalid={Boolean(errorMessage)}
                aria-describedby={errorMessage ? "login-error" : undefined}
                disabled={loading}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="nombre@empresa.com"
              />
            </div>

            <div className="ccv-login-field">
              <Label htmlFor="pass">Contraseña</Label>
              <div className="ccv-login-password">
                <Input
                  id="pass"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  aria-invalid={Boolean(errorMessage)}
                  aria-describedby={errorMessage ? "login-error" : undefined}
                  disabled={loading}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Ingresa tu contraseña"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  aria-pressed={showPassword}
                  disabled={loading}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {errorMessage && <p id="login-error" role="alert" className="ccv-login-error">{errorMessage}</p>}

            <Button type="submit" className="ccv-login-enter" disabled={loading}>
              <span>{loading ? "Verificando acceso…" : "Entrar al dashboard"}</span>
              {loading ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <ArrowRight size={18} aria-hidden="true" />}
            </Button>
          </form>

          <p className="ccv-login-help">¿Necesitas acceso? Solicítalo al administrador de la aplicación.</p>
        </div>
        <div className="ccv-login-access-footer" aria-hidden="true">
          <span>CCV / DASHBOARD COMERCIAL</span>
          <span>ACCESO PRIVADO</span>
        </div>
      </section>
    </main>
  );
}
