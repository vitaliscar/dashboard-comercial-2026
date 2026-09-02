async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...init?.headers } });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(body?.message ?? "No se pudo completar la operación.");
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}
export type UserData = { profiles: any[]; roles: any[]; users: any[]; profileUnidades: any[]; profileSucursales: any[] };
export const getUsuariosHttp = () => request<UserData>("/usuarios");
export const createUsuarioHttp = (data: Record<string, unknown>) => request<{ userId: string }>("/usuarios", { method: "POST", body: JSON.stringify(data) });
export const updateUsuarioHttp = (id: string, data: Record<string, unknown>) => request<void>(`/usuarios/${id}`, { method: "PATCH", body: JSON.stringify(data) });
export const deleteUsuarioHttp = (id: string) => request<void>(`/usuarios/${id}`, { method: "DELETE" });
export const getAjustesHttp = (anio: number) => request<any[]>(`/ajustes-manuales?anio=${anio}`);
export const createAjusteHttp = (data: Record<string, unknown>) => request<any>("/ajustes-manuales", { method: "POST", body: JSON.stringify(data) });
export const deleteAjusteHttp = (id: string) => request<void>(`/ajustes-manuales/${id}`, { method: "DELETE" });