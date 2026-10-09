export type Alerta = {
  id: string;
  tipo: string;
  severidad: "alta" | "media" | "baja";
  titulo: string;
  contexto: { detalle?: string; monto?: number; accion?: string; cliente?: string } | null;
  sucursalId: string | null;
  unidadNegocioId: string | null;
  asesorId: string | null;
  estado: "abierta" | "resuelta";
  createdAt: string;
  resueltaManualmente: boolean;
  resueltaEn: string | null;
  resueltaPor: string | null;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/alertas${path}`, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...init?.headers } });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null;
    const error = new Error(body?.message ?? "No se pudieron cargar las alertas.");
    Object.assign(error, { status: response.status });
    throw error;
  }
  return response.json() as Promise<T>;
}
export const getAlertas = (estado: "abierta" | "resuelta" | "todas" = "abierta") => request<Alerta[]>(`?estado=${estado}`);
export const getOpenAlertCount = async () => {
  try {
    const result = await request<{ count: number }>("/count");
    if (!Number.isSafeInteger(result.count) || result.count < 0) {
      throw new Error("El conteo de alertas no es válido.");
    }
    return result.count;
  } catch (error) {
    if ((error as { status?: number })?.status !== 404) throw error;
    return (await getAlertas()).filter((alerta) => alerta.estado === "abierta").length;
  }
};
export const resolverAlerta = (id: string) => request<{ id: string; estado: "resuelta" }>(`/${id}/resolver`, { method: "POST" });
