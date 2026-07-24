// Stub de @node-rs/argon2 para el bundle de cliente. auth.ts importa
// password.ts (que usa argon2) a nivel de módulo para el handler server-only de
// loginFn; el escáner de dependencias de Vite recorre ese import crudo y trata de
// pre-empaquetar argon2 para el navegador, resolviendo su campo `browser` →
// browser.js → `@node-rs/argon2-wasm32-wasi` (no instalado) → error de build.
// El cliente NUNCA ejecuta hash/verify (solo corren dentro de handlers en el
// servidor), así que estos stubs jamás se invocan; existen solo para que el grafo
// del cliente resuelva. vite.config.ts los aliasa únicamente para environment.name
// === "client"; el servidor/SSR sigue usando el binding nativo real.
const message =
  "@node-rs/argon2 no está disponible en el navegador; hashPassword/verifyPassword solo corren en el servidor.";

export function hash(): never {
  throw new Error(message);
}

export function verify(): never {
  throw new Error(message);
}
