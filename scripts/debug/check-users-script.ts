import { dbAdmin } from "@/db";
import { users, profiles, userRoles } from "@/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const list = await dbAdmin
    .select({
      id: users.id,
      email: users.email,
      isAdmin: profiles.isAdmin,
      nombre: profiles.nombreCompleto,
      role: userRoles.role,
    })
    .from(users)
    .leftJoin(profiles, eq(users.id, profiles.id))
    .leftJoin(userRoles, eq(users.id, userRoles.userId));

  console.log("--- ROLES DISPONIBLES ---");
  for (const u of list) {
    console.log(
      `Email: ${u.email} | Nombre: ${u.nombre ?? "Sin nombre"} | Rol: ${u.isAdmin ? "gerencia (Admin)" : u.role}`,
    );
  }
  process.exit(0);
}

main();
