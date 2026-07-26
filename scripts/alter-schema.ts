import { dbAdmin } from "@/db";

async function alterSchema() {
  try {
    console.log("🔄 Alterando schema de PostgreSQL...");

    // Ejecutar SQL raw para alterar las tablas
    await dbAdmin.execute(
      `ALTER TABLE cotizaciones DROP CONSTRAINT IF EXISTS cotizaciones_unidad_negocio_id_fkey`,
    );
    await dbAdmin.execute(`ALTER TABLE cotizaciones ALTER COLUMN unidad_negocio_id DROP NOT NULL`);
    await dbAdmin.execute(
      `ALTER TABLE cotizaciones ADD CONSTRAINT cotizaciones_unidad_negocio_id_fkey
       FOREIGN KEY (unidad_negocio_id) REFERENCES unidades_negocio(id)`,
    );

    await dbAdmin.execute(
      `ALTER TABLE facturas DROP CONSTRAINT IF EXISTS facturas_unidad_negocio_id_fkey`,
    );
    await dbAdmin.execute(`ALTER TABLE facturas ALTER COLUMN unidad_negocio_id DROP NOT NULL`);
    await dbAdmin.execute(
      `ALTER TABLE facturas ADD CONSTRAINT facturas_unidad_negocio_id_fkey
       FOREIGN KEY (unidad_negocio_id) REFERENCES unidades_negocio(id)`,
    );

    await dbAdmin.execute(
      `ALTER TABLE ventas_perdidas DROP CONSTRAINT IF EXISTS ventas_perdidas_unidad_negocio_id_fkey`,
    );
    await dbAdmin.execute(
      `ALTER TABLE ventas_perdidas ALTER COLUMN unidad_negocio_id DROP NOT NULL`,
    );
    await dbAdmin.execute(
      `ALTER TABLE ventas_perdidas ADD CONSTRAINT ventas_perdidas_unidad_negocio_id_fkey
       FOREIGN KEY (unidad_negocio_id) REFERENCES unidades_negocio(id)`,
    );

    console.log("✅ Schema alterado exitosamente");
  } catch (error) {
    console.error("❌ Error al alterar schema:", error);
    process.exit(1);
  }
}

alterSchema();
