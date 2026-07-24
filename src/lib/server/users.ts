import { dbAdmin } from "@/db";
import { users, profiles } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";

/**
 * Crea un usuario nuevo (usado por seeding/`/usuarios`, no expuesto en el
 * login). Hashea el password con argon2id.
 *
 * Vive aquí y NO en auth.ts porque auth.ts es importado por el hook cliente
 * use-auth.tsx (para loginFn/logoutFn/meFn). TanStack Start elimina los cuerpos
 * de `.handler()` del bundle de cliente, pero una función normal como esta no se
 * elimina — y arrastraría `@node-rs/argon2` (binding nativo de Node) al grafo del
 * navegador, que falla al resolver su fallback wasm32-wasi. Aislada aquí, el
 * cliente nunca la alcanza.
 */
export async function createUserWithPassword(email: string, password: string) {
  const passwordHash = await hashPassword(password);
  const [user] = await dbAdmin.insert(users).values({ email, passwordHash }).returning();
  await dbAdmin.insert(profiles).values({ id: user.id, email });
  return user;
}
