"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useRef, type ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";
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
import { ShieldAlert } from "lucide-react";

const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const WARNING_TIMEOUT = 30; // 30 seconds

export function ProtectedShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { session, loading, signOut } = useAuth();

  const [isWarningOpen, setIsWarningOpen] = useState(false);
  const [timeLeft, setTimeLeft] = useState(WARNING_TIMEOUT);
  const lastActiveRef = useRef<number>(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!session) return;

    const handleActivity = () => {
      lastActiveRef.current = Date.now();
    };

    const events = ["mousemove", "keydown", "scroll", "click", "touchstart"];
    events.forEach((e) => window.addEventListener(e, handleActivity));

    return () => {
      events.forEach((e) => window.removeEventListener(e, handleActivity));
    };
  }, [session]);

  useEffect(() => {
    if (!session) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      const timeSinceLastActive = Date.now() - lastActiveRef.current;

      if (isWarningOpen) {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            setIsWarningOpen(false);
            signOut();
            router.replace("/auth");
            return 0;
          }
          return prev - 1;
        });
      } else if (timeSinceLastActive > INACTIVITY_TIMEOUT) {
        setIsWarningOpen(true);
        setTimeLeft(WARNING_TIMEOUT);
      }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [session, isWarningOpen, signOut, router]);

  useEffect(() => {
    if (!loading && !session) {
      router.replace("/auth");
    }
  }, [session, loading, router]);

  const handleResumeSession = () => {
    lastActiveRef.current = Date.now();
    setIsWarningOpen(false);
  };

  const handleLogout = async () => {
    setIsWarningOpen(false);
    await signOut();
    router.replace("/auth");
  };

  return (
    <>
      <AppShell>{children}</AppShell>

      <AlertDialog open={isWarningOpen} onOpenChange={setIsWarningOpen}>
        <AlertDialogContent className="border border-border bg-background shadow-2xl p-6">
          <AlertDialogHeader className="flex flex-col items-center text-center gap-3">
            <div className="bg-destructive/10 p-3 rounded-full text-destructive">
              <ShieldAlert className="size-8" />
            </div>
            <AlertDialogTitle className="font-display text-xl font-bold tracking-tight">
              ¿Sigues ahí?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground text-sm max-w-xs">
              Tu sesión ha estado inactiva. Se cerrará automáticamente por seguridad en{" "}
              <span className="font-bold text-destructive font-mono text-base">{timeLeft}</span>{" "}
              segundos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col sm:flex-row gap-2 mt-4">
            <AlertDialogCancel onClick={handleLogout} className="w-full sm:w-auto h-10 font-medium">
              Cerrar sesión
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResumeSession}
              className="w-full sm:w-auto h-10 font-bold bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Mantener activa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
