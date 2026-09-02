export type Alerta = {
  id: string;
  tipo: string;
  severidad: "alta" | "media" | "baja";
  titulo: string;
  contexto: { detalle?: string; monto?: number; accion?: string } | null;
  sucursalId: string | null;
  unidadNegocioId: string | null;
  asesorId: string | null;
  estado: "abierta" | "resuelta";
  createdAt: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/alertas${path}`, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...init?.headers } });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(body?.message ?? "No se pudieron cargar las alertas.");
  }
  return response.json() as Promise<T>;
}
export const getAlertas = () => request<Alerta[]>("");
export const resolverAlerta = (id: string) => request<{ id: string; estado: "resuelta" }>(`/${id}/resolver`, { method: "POST" });