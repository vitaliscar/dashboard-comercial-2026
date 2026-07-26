import { readFileSync } from "fs";
import { dbAdmin } from "@/db";
import { eq } from "drizzle-orm";
import {
  users,
  profiles,
  userRoles,
  sucursales,
  unidadesNegocio,
  cotizaciones,
  facturas,
  ventasPerdidas,
} from "@/db/schema";
import { ExcelParser } from "@/lib/excel-parser";
import { hashPassword } from "@/lib/auth/password";

const EXCEL_PATH =
  process.argv[2] || "C:\\Users\\joaqu\\Documents\\dashboard-comercial-2026\\CCV Rendimiento.xlsx";

async function loadExcelToPostgres() {
  console.log(`📊 Cargando Excel desde: ${EXCEL_PATH}`);

  try {
    // Leer y parsear Excel
    const buffer = readFileSync(EXCEL_PATH);
    const parser = new ExcelParser(buffer);

    console.log("✓ Excel parseado");

    // Limpiar tablas (excepto usuarios/perfiles que se upsert)
    await dbAdmin.delete(ventasPerdidas);
    await dbAdmin.delete(facturas);
    await dbAdmin.delete(cotizaciones);
    console.log("✓ Tablas limpiadas");

    // Las hojas traen filas de ajuste sin fecha (p.ej. "Cliente S/N" con monto negativo
    // y sin nro. de documento). `fecha` es NOT NULL en las tres tablas, así que se
    // descartan aquí y se reporta el conteo — nunca en silencio.
    const insertRows = async (
      table: typeof cotizaciones | typeof facturas | typeof ventasPerdidas,
      rows: { fecha?: string | null }[],
      label: string,
    ) => {
      const valid = rows.filter((r) => r.fecha);
      const dropped = rows.length - valid.length;

      // Postgres soporta hasta 65535 parámetros por query. La tabla más ancha
      // (cotizaciones) tiene 14 columnas -> ~4681 filas/lote en el límite real;
      // 1000 deja margen amplio y corta los round-trips en ~20x vs. lotes de 50.
      const BATCH_SIZE = 1000;
      for (let i = 0; i < valid.length; i += BATCH_SIZE) {
        await dbAdmin
          .insert(table)
          .values(valid.slice(i, i + BATCH_SIZE) as never)
          .onConflictDoNothing();
      }

      console.log(
        `✓ ${valid.length} ${label} insertadas` +
          (dropped > 0 ? ` (${dropped} descartadas por fecha vacía)` : ""),
      );
    };

    await insertRows(
      cotizaciones,
      [...parser.getCotizacionesPrincipales(), ...parser.getCotizacionesLubFiltros()],
      "cotizaciones",
    );

    await insertRows(
      facturas,
      [...parser.getFacturasPrincipales(), ...parser.getFacturasLubFiltros()],
      "facturas",
    );

    await insertRows(ventasPerdidas, parser.getVentasPerdidasNuevo(), "ventas perdidas");

    // Crear usuario de demo si no existe
    const [existingUser] = await dbAdmin
      .select()
      .from(users)
      .where(eq(users.email, "aperez@ccvenequip.com"))
      .limit(1);

    if (!existingUser) {
      const passwordHash = await hashPassword("inicio2026");
      const [newUser] = await dbAdmin
        .insert(users)
        .values({
          email: "aperez@ccvenequip.com",
          passwordHash,
          isActive: true,
          isAdmin: false,
        })
        .returning();

      // Crear perfil asociado
      await dbAdmin
        .insert(profiles)
        .values({
          id: newUser.id,
          nombre: "Alejandro Perez",
          apellido: "Test",
          isAdmin: false,
        })
        .onConflictDoNothing();

      // Asignar rol
      await dbAdmin
        .insert(userRoles)
        .values({
          userId: newUser.id,
          role: "gerencia",
        })
        .onConflictDoNothing();

      console.log(`✓ Usuario de demo creado: aperez@ccvenequip.com / inicio2026`);
    } else {
      console.log(`✓ Usuario aperez@ccvenequip.com ya existe`);
    }

    console.log("\n✅ Carga completada exitosamente");
  } catch (error) {
    console.error("❌ Error cargando Excel:", error);
    process.exit(1);
  }
}

loadExcelToPostgres();
