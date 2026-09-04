export type MinutaEstado = "pendiente" | "en_proceso" | "cumplido";

export interface MinutaInput {
  fecha: string;
  destinatarioId: string;
  cliente: string | null;
  descripcion: string;
  fechaLimite: string | null;
  sucursalId?: string | null;
  unidadNegocioId?: string | null;
  estado?: MinutaEstado;
  alertaIds: string[];
}

export interface MinutaDestinatario {
  id: string;
  nombreCompleto: string | null;
  role: string;
  sucursalId: string | null;
  unidadNegocioId: string | null;
}

export interface MinutaAlertaAbierta {
  id: string;
  tipo: string;
  severidad: "alta" | "media" | "baja";
  titulo: string;
  contexto: { detalle?: string; accion?: string; cliente?: string | null } | null;
  sucursalId: string | null;
  unidadNegocioId: string | null;
  asesorId: string | null;
  estado: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/minutas${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? "No se pudo completar la operación.");
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const getMinutasHttp = () => request<any[]>("");
export const getDestinatariosHttp = () => request<MinutaDestinatario[]>("/destinatarios");
export const getAlertasAbiertasHttp = () => request<MinutaAlertaAbierta[]>("/alertas-abiertas");
export const searchClientesHttp = (q: string) => request<string[]>(`/clientes?q=${encodeURIComponent(q)}`);
export const getClientesDestinatarioHttp = (destinatarioId: string) =>
  request<string[]>(`/clientes-destinatario/${destinatarioId}`);
export const createMinutaHttp = (data: MinutaInput) =>
  request<any>("", { method: "POST", body: JSON.stringify(data) });
export const updateMinutaHttp = (id: string, data: Pick<MinutaInput, "descripcion" | "fechaLimite" | "estado">) =>
  request<any>(`/${id}`, { method: "PATCH", body: JSON.stringify(data) });
export const deleteMinutaHttp = (id: string) => request<void>(`/${id}`, { method: "DELETE" });
export const addComentarioHttp = (id: string, texto: string) =>
  request<any>(`/${id}/comentarios`, { method: "POST", body: JSON.stringify({ texto }) });
export const resolveAlertaHttp = (id: string) =>
  request<any>(`/alertas/${id}/resolver`, { method: "POST" });