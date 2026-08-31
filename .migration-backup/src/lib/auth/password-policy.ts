/** Política de contraseña aplicada en server actions (create/reset). */
export const PASSWORD_MIN_LENGTH = 8;

export function validatePasswordStrength(password: string): string | null {
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
    return `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  }
  if (password.length > 128) {
    return "La contraseña no puede superar 128 caracteres.";
  }
  return null;
}
