"use client";

import React, { useState, useEffect } from "react";

export function CookieConsentBanner() {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem("cookie_consent")) {
        setShowBanner(true);
      }
    } catch {
      setShowBanner(true);
    }
  }, []);

  const handleAccept = () => {
    try {
      localStorage.setItem("cookie_consent", "accepted");
    } catch {
      // El aviso puede cerrarse en esta sesión aunque el navegador no guarde la preferencia.
    }
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <aside className="ccv-cookie-consent fixed bottom-4 right-4 z-50 max-w-md rounded-lg border border-border bg-card p-4 text-card-foreground" role="region" aria-label="Aviso sobre cookies" aria-live="polite">
      <div className="space-y-2">
        <h4 className="text-sm font-semibold">Política de Cookies & Privacidad</h4>
        <p className="text-xs text-muted-foreground">
          Utilizamos cookies esenciales para la autenticación y seguridad del Dashboard Comercial.
          Al continuar navegando, aceptas nuestros términos de privacidad.
        </p>
        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={handleAccept}
            className="ccv-cookie-accept"
          >
            Aceptar
          </button>
          <details className="ccv-cookie-details">
            <summary>Detalles de almacenamiento</summary>
            <p>Al aceptar, esta preferencia se guarda en el almacenamiento local del navegador para no volver a mostrar el aviso en este dispositivo.</p>
          </details>
        </div>
      </div>
    </aside>
  );
}
