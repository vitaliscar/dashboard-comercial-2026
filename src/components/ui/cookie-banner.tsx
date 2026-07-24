'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';

export function CookieBanner() {
  const [accepted, setAccepted] = useState<boolean | null>(null);

  useEffect(() => {
    const consent = localStorage.getItem('cookie_consent');
    if (consent) {
      setAccepted(consent === 'accepted');
    } else {
      setAccepted(false);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('cookie_consent', 'accepted');
    setAccepted(true);
  };

  const handleDecline = () => {
    localStorage.setItem('cookie_consent', 'declined');
    setAccepted(true);
  };

  if (accepted !== false) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl backdrop-blur-md">
      <div className="flex flex-col space-y-3">
        <h4 className="text-sm font-semibold text-foreground">Gestión de Cookies y Privacidad</h4>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Utilizamos cookies esenciales y analíticas para garantizar la seguridad del sistema y mejorar la experiencia de usuario según las normativas GDPR y de protección de datos.
        </p>
        <div className="flex justify-end space-x-2 pt-2">
          <Button variant="outline" size="sm" onClick={handleDecline}>
            Rechazar opcionales
          </Button>
          <Button size="sm" onClick={handleAccept}>
            Aceptar todas
          </Button>
        </div>
      </div>
    </div>
  );
}
