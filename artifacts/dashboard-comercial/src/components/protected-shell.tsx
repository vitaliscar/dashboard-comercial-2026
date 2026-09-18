"use client";

import { useLocation } from "wouter";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Loader2, ShieldAlert } from "lucide-react";

/** Inactividad máxima antes de preguntar si mantener la sesión. */
const IDLE_MS = 8 * 60 * 1000;
/** Gracia tras el aviso (sigue en wall-clock / segundo plano). */
const GRACE_MS = 30 * 1000;

export function ProtectedShell({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  const { session, loading, signOut } = useAuth();

  const [isWarningOpen, setIsWarningOpen] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);

  const lastActiveRef = useRef<number>(Date.now());
  /** Deadline absoluta de cierre (Date.now()); null = aún no en fase de cierre. */
  const logoutAtRef = useRef<number | null>(null);
  const loggingOutRef = useRef(false);
  const warningOpenRef = useRef(false);
  const keepingAliveRef = useRef(false);
  const hiddenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHiddenTimer = () => {
    if (hiddenTimerRef.current != null) {
      clearTimeout(hiddenTimerRef.current);
      hiddenTimerRef.current = null;
    }
  };

  const doLogout = useCallback(async () => {
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;
    clearHiddenTimer();
    logoutAtRef.current = null;
    warningOpenRef.current = false;
    setIsWarningOpen(false);
    try {
      await signOut();
    } finally {
      setLocation("/auth");
      loggingOutRef.current = false;
    }
  }, [signOut, setLocation]);

  const scheduleHiddenDeadline = useCallback(() => {
    clearHiddenTimer();
    if (document.visibilityState !== "hidden" || !session || loggingOutRef.current) return;

    const now = Date.now();
    let fireAt: number;
    if (logoutAtRef.current != null) {
      fireAt = logoutAtRef.current;
    } else {
      fireAt = lastActiveRef.current + IDLE_MS;
    }
    const delay = Math.max(0, fireAt - now);
    hiddenTimerRef.current = setTimeout(() => {
      hiddenTimerRef.current = null;
      tickRef.current?.();
    }, delay + 25);
  }, [session]);

  const tickRef = useRef<(() => void) | null>(null);

  const tick = useCallback(() => {
    if (!session || loggingOutRef.current) return;

    const now = Date.now();

    // Fase de gracia / cierre: siempre wall-clock (también con pestaña oculta).
    if (logoutAtRef.current != null) {
      const remainingMs = logoutAtRef.current - now;
      if (remainingMs <= 0) {
        void doLogout();
        return;
      }
      if (warningOpenRef.current) {
        setTimeLeft(Math.ceil(remainingMs / 1000));
      }
      if (document.visibilityState === "hidden") scheduleHiddenDeadline();
      return;
    }

    const idleFor = now - lastActiveRef.current;
    if (idleFor < IDLE_MS) {
      if (document.visibilityState === "hidden") scheduleHiddenDeadline();
      return;
    }

    // Inactividad cumplida: en segundo plano cierra; si la pestaña está visible, pregunta.
    if (document.visibilityState === "hidden") {
      void doLogout();
      return;
    }

    logoutAtRef.current = now + GRACE_MS;
    warningOpenRef.current = true;
    setTimeLeft(Math.ceil(GRACE_MS / 1000));
    setIsWarningOpen(true);
  }, [session, doLogout, scheduleHiddenDeadline]);

  useEffect(() => {
    tickRef.current = tick;
  }, [tick]);

  // Actividad del usuario (no aplica mientras el aviso está abierto).
  useEffect(() => {
    if (!session) return;

    const handleActivity = () => {
      if (warningOpenRef.current || loggingOutRef.current) return;
      lastActiveRef.current = Date.now();
    };

    const events: (keyof WindowEventMap)[] = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
      "pointerdown",
    ];
    for (const e of events) window.addEventListener(e, handleActivity, { passive: true });
    return () => {
      for (const e of events) window.removeEventListener(e, handleActivity);
    };
  }, [session]);

  // Reloj wall-clock + chequeo al volver de segundo plano.
  useEffect(() => {
    if (!session) {
      clearHiddenTimer();
      logoutAtRef.current = null;
      warningOpenRef.current = false;
      setIsWarningOpen(false);
      return;
    }

    const id = window.setInterval(tick, 1000);
    const onVisibility = () => {
      tick();
      if (document.visibilityState === "hidden") scheduleHiddenDeadline();
      else clearHiddenTimer();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    window.addEventListener("pageshow", onVisibility);
    tick();

    return () => {
      window.clearInterval(id);
      clearHiddenTimer();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
      window.removeEventListener("pageshow", onVisibility);
    };
  }, [session, tick, scheduleHiddenDeadline]);

  useEffect(() => {
    if (!loading && !session) {
      setLocation("/auth");
    }
  }, [session, loading, setLocation]);

  const handleResumeSession = () => {
    keepingAliveRef.current = true;
    clearHiddenTimer();
    lastActiveRef.current = Date.now();
    logoutAtRef.current = null;
    warningOpenRef.current = false;
    setIsWarningOpen(false);
    setTimeLeft(0);
    // Liberar el flag en el siguiente tick (tras onOpenChange del cierre del diálogo).
    window.setTimeout(() => {
      keepingAliveRef.current = false;
    }, 0);
  };

  const handleLogoutClick = () => {
    void doLogout();
  };

  // Mientras auth hidrata (fallback si no hubo initialAuth), no montar páginas:
  // evita flash de "Usuario sin rol" / "Acceso restringido".
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-muted-foreground" aria-label="Cargando sesión" />
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <>
      {children}

      <AlertDialog
        open={isWarningOpen}
        onOpenChange={(open) => {
          // Cerrar el diálogo sin "Mantener abierta" = cerrar sesión.
          if (!open && warningOpenRef.current && !keepingAliveRef.current) {
            void doLogout();
          }
        }}
      >
        <AlertDialogContent className="border border-border bg-background shadow-2xl p-6">
          <AlertDialogHeader className="flex flex-col items-center text-center gap-3">
            <div className="bg-destructive/10 p-3 rounded-full text-destructive">
              <ShieldAlert className="size-8" />
            </div>
            <AlertDialogTitle className="font-display text-xl font-bold tracking-tight">
              ¿Mantener la sesión abierta?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground text-sm max-w-xs">
              Llevas 8 minutos inactivo. ¿Quieres mantener la sesión abierta? Si no respondes se
              cerrará en{" "}
              <span className="font-bold text-destructive font-mono text-base">{timeLeft}</span>{" "}
              segundos (también si la pestaña está en segundo plano).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col sm:flex-row gap-2 mt-4">
            <AlertDialogCancel onClick={handleLogoutClick} className="w-full sm:w-auto h-10 font-medium">
              Cerrar sesión
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResumeSession}
              className="w-full sm:w-auto h-10 font-bold bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Mantener abierta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
