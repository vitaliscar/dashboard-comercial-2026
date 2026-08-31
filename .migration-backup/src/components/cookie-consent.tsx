"use client";

import React, { useState, useEffect } from "react";

export function CookieConsentBanner() {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem("cookie_consent");
    if (!consent) {
      setShowBanner(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem("cookie_consent", "accepted");
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md rounded-lg border border-border bg-card p-4 shadow-xl text-card-foreground">
      <div className="space-y-2">
        <h4 className="text-sm font-semibold">Política de Cookies & Privacidad</h4>
        <p className="text-xs text-muted-foreground">
          Utilizamos cookies esenciales para la autenticación y seguridad del Dashboard Comercial.
          Al continuar navegando, aceptas nuestros términos de privacidad.
        </p>
        <div className="flex items-center gap-2 pt-2">
          <button
            onClick={handleAccept}
            className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            Aceptar
          </button>
          <a
            href="/docs/legal/POLITICA-COOKIES.md"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-muted-foreground underline hover:text-foreground"
          >
            Saber más
          </a>
        </div>
      </div>
    </div>
  );
}
