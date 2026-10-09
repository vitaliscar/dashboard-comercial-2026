"use client";

import { useState } from "react";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password-policy";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, Loader2 } from "@/components/icons";

type Mode = "choose" | "change";

interface FirstLoginPasswordDialogProps {
  open: boolean;
  onResolved: () => void;
}

async function postAuth(path: string, body?: Record<string, string>) {
  const response = await fetch(`/api/auth${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await response.json().catch(() => null)) as { message?: string } | null;
  if (!response.ok) {
    return { error: data?.message ?? "No se pudo completar la operación." };
  }
  return { error: null };
}

/**
 * Aviso obligatorio al entrar con must_change_password=true:
 * el usuario puede mantener la clave temporal o definir una nueva.
 */
export function FirstLoginPasswordDialog({ open, onResolved }: FirstLoginPasswordDialogProps) {
  const [mode, setMode] = useState<Mode>("choose");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const resetForm = () => {
    setMode("choose");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
  };

  const handleKeep = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await postAuth("/keep-password");
      if (result.error) {
        setError(result.error);
        return;
      }
      resetForm();
      onResolved();
    } finally {
      setBusy(false);
    }
  };

  const handleChange = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await postAuth("/change-password", { newPassword, confirmPassword });
      if (result.error) {
        setError(result.error);
        return;
      }
      resetForm();
      onResolved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) return;
      }}
    >
      <DialogContent className="ccv-password-dialog sm:max-w-md" aria-busy={busy} showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <KeyRound className="size-5 text-primary" />
            Contraseña inicial
          </DialogTitle>
          <DialogDescription>
            Entraste con la clave temporal de primer acceso. Puedes mantenerla o definir una nueva
            ahora (mínimo {PASSWORD_MIN_LENGTH} caracteres).
          </DialogDescription>
        </DialogHeader>

        {mode === "choose" ? (
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            {error && <p role="alert" className="text-sm text-destructive w-full text-left">{error}</p>}
            <Button type="button" onClick={() => setMode("change")} disabled={busy} className="w-full">
              Cambiar clave
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleKeep}
              disabled={busy}
              className="w-full"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Mantener esta clave
            </Button>
          </DialogFooter>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void handleChange();
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-password">Nueva contraseña</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                minLength={PASSWORD_MIN_LENGTH}
                maxLength={128}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="confirm-password">Confirmar contraseña</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                minLength={PASSWORD_MIN_LENGTH}
                maxLength={128}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={busy}
              />
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <DialogFooter className="flex-col gap-2 sm:flex-col">
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                Guardar nueva clave
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setMode("choose");
                  setError(null);
                }}
                disabled={busy}
                className="w-full"
              >
                Volver
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
