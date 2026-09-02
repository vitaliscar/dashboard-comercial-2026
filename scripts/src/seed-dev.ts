import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const workspaceRoot = process.cwd().replace(/[\\/]+$/, "").endsWith("scripts")
  ? resolve(process.cwd(), "..")
  : process.cwd();
const { adminPool } = (await import(
  pathToFileURL(resolve(workspaceRoot, "lib/db/src/index.ts")).href
)) as { adminPool: { connect: () => Promise<any>; end: () => Promise<void> } };

const PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$Ba5COc0fgjsk5OSoMD8I5g$DGOB4d0oZSdiVyO5/lWIT7Jdtv2yUTYf6EYlhqYElMQ";

const id = (group: number, index: number) =>
  `${group.toString(16).padStart(8, "0")}-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;

const year = new Date().getUTCFullYear();
const month = new Date().getUTCMonth() + 1;
const months = [...new Set([Math.max(1, month - 2), Math.max(1, month - 1), month])];
const dateFor = (monthNumber: number, day: number) =>
  `${year}-${String(monthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

type Queryable = { query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }> };

async function ensureCatalogId(client: Queryable, table: "sucursales" | "unidades_negocio", name: string, extraColumn?: string) {
  const columns = extraColumn ? `(nombre, ${extraColumn})` : "(nombre)";
  const values = extraColumn ? [name, table === "sucursales" ? "Demo" : null] : [name];
  const placeholders = extraColumn ? "($1, $2)" : "($1)";
  const updates = extraColumn ? `, ${extraColumn} = EXCLUDED.${extraColumn}` : "";
  const result = await client.query(
    `INSERT INTO ${table} ${columns} VALUES ${placeholders}
     ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre${updates}
     RETURNING id`,
    values,
  );
  return result.rows[0].id as string;
}

async function insertRows(
  client: Queryable,
  table: string,
  columns: string[],
  rows: unknown[][],
  conflictColumns = ["id"],
) {
  if (!rows.length) return;
  const placeholders: string[] = [];
  const values: unknown[] = [];
  rows.forEach((row, rowIndex) => {
    const rowPlaceholders = row.map((_, columnIndex) => `$${rowIndex * columns.length + columnIndex + 1}`);
    placeholders.push(`(${rowPlaceholders.join(", ")})`);
    values.push(...row);
  });
  const updateColumns = columns.filter((column) => !conflictColumns.includes(column));
  const conflict =
    conflictColumns.length > 0
      ? `ON CONFLICT (${conflictColumns.join(", ")}) DO UPDATE SET ${updateColumns
          .map((column) => `${column} = EXCLUDED.${column}`)
          .join(", ")}`
      : "";
  await client.query(
    `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${placeholders.join(", ")}
     ${conflict}`,
    values,
  );
}

async function seed() {
  const client = await (adminPool as any).connect();
  try {
    await client.query("BEGIN");

    const branchNames = ["Caracas", "Valencia", "Maracaibo"];
    const branches: Record<string, string> = {};
    for (const branch of branchNames) {
      branches[branch] = await ensureCatalogId(client, "sucursales", branch, "ciudad");
    }
    const unitNames = {
      repuestos: "Repuestos",
      lubfiltros: "Lubricantes/Filtros",
      servicios: "Servicios",
      equipos: "Equipos",
      alquiler: "Alquiler",
    } as const;
    const units: Record<keyof typeof unitNames, string> = {} as Record<keyof typeof unitNames, string>;
    for (const [key, name] of Object.entries(unitNames)) {
      units[key as keyof typeof unitNames] = await ensureCatalogId(client, "unidades_negocio", name);
    }

    const users = [
      { key: "gerencia", email: "demo.gerencia@ccv.local", name: "Gerencia Demo", role: "gerencia", branch: null, unit: null },
      { key: "gc", email: "demo.gc@ccv.local", name: "Gerente Comercial Demo", role: "gerente_comercial", branch: "Caracas", unit: "equipos" },
      { key: "coord", email: "demo.coordinador@ccv.local", name: "Coordinación Demo", role: "coordinador", branch: "Valencia", unit: "servicios" },
      { key: "asesor", email: "demo.asesor@ccv.local", name: "Asesor Demo", role: "asesor", branch: "Caracas", unit: "repuestos" },
    ] as const;
    const userIds: Record<(typeof users)[number]["key"], string> = {} as Record<(typeof users)[number]["key"], string>;

    for (const user of users) {
      const result = await client.query(
        `INSERT INTO users (email, password_hash, is_active)
         VALUES ($1, $2, true)
         ON CONFLICT (email) DO UPDATE
         SET password_hash = EXCLUDED.password_hash, is_active = true
         RETURNING id`,
        [user.email, PASSWORD_HASH],
      );
      const userId = result.rows[0].id as string;
      userIds[user.key] = userId;
      await insertRows(client, "profiles", ["id", "email", "nombre_completo", "sucursal_id", "unidad_negocio_id", "is_admin"], [[
        userId,
        user.email,
        user.name,
        user.branch ? branches[user.branch] : null,
        user.unit ? units[user.unit] : null,
        user.role === "gerencia",
      ]]);
      await client.query("DELETE FROM user_roles WHERE user_id = $1", [userId]);
      await client.query("INSERT INTO user_roles (user_id, role) VALUES ($1, $2)", [userId, user.role]);
      await client.query("DELETE FROM profile_unidades_negocio WHERE profile_id = $1", [userId]);
      await client.query("DELETE FROM profile_sucursales WHERE profile_id = $1", [userId]);
      if (user.unit) {
        await client.query(
          "INSERT INTO profile_unidades_negocio (profile_id, unidad_negocio_id) VALUES ($1, $2)",
          [userId, units[user.unit]],
        );
      }
      if (user.branch) {
        await client.query(
          "INSERT INTO profile_sucursales (profile_id, sucursal_id) VALUES ($1, $2)",
          [userId, branches[user.branch]],
        );
      }
      if (user.key === "coord") {
        await client.query(
          "INSERT INTO profile_sucursales (profile_id, sucursal_id) VALUES ($1, $2)",
          [userId, branches.Maracaibo],
        );
      }
    }

    const budgetRows: unknown[][] = [];
    let budgetIndex = 1;
    for (const [unitIndex, unitKey] of Object.keys(unitNames).entries()) {
      for (const monthNumber of months) {
        for (const [branchIndex, branchName] of branchNames.entries()) {
          const target = 85000 + unitIndex * 12500 + branchIndex * 9000 + (monthNumber % 4) * 3500;
          const factor = 0.72 + ((unitIndex + branchIndex + monthNumber) % 4) * 0.08;
          const sale = Math.round(target * factor);
          budgetRows.push([
            id(0x40000000 + unitIndex, budgetIndex++),
            year,
            monthNumber,
            branches[branchName],
            units[unitKey as keyof typeof unitNames],
            target.toFixed(2),
            (sale * 0.65).toFixed(2),
            (sale * 0.2).toFixed(2),
            (sale * 0.15).toFixed(2),
          ]);
        }
      }
    }
    await insertRows(
      client,
      "presupuestos",
      ["id", "anio", "mes", "sucursal_id", "unidad_negocio_id", "monto", "ventas_ccv", "ventas_xibi", "ventas_estrategicas"],
      budgetRows,
    );

    const transactionalRows: unknown[][] = [];
    let transactionIndex = 1;
    for (const [unitIndex, unitKey] of Object.keys(unitNames).entries()) {
      const unit = units[unitKey as keyof typeof unitNames];
      const branchName = branchNames[unitIndex % branchNames.length];
      const branch = branches[branchName];
      const asesorId = unitKey === "repuestos" ? userIds.asesor : null;
      transactionalRows.push([
        id(0x50000000 + unitIndex, transactionIndex++),
        dateFor(month, 8),
        `Cliente ${unitKey} Demo`,
        `COT-${year}-${unitIndex + 1}`,
        asesorId,
        branch,
        unit,
        (18000 + unitIndex * 2200).toFixed(2),
        (4500 + unitIndex * 500).toFixed(2),
        "desarrollo",
      ]);
    }
    transactionalRows.push([
      id(0x5000000f, 1),
      dateFor(month, 9),
      "Cliente Repuestos Otro Asesor",
      `COT-${year}-OTRO`,
      userIds.gc,
      branches.Caracas,
      units.repuestos,
      "6400.00",
      "0.00",
      "desarrollo",
    ]);
    await insertRows(
      client,
      "cotizaciones",
      ["id", "fecha", "cliente", "nro_cotizacion", "asesor_id", "sucursal_id", "unidad_negocio_id", "monto", "monto_facturado", "etapa"],
      transactionalRows,
    );

    const invoiceRows = Object.keys(unitNames).map((unitKey, index) => [
      id(0x51000000 + index, 1),
      dateFor(month, 12),
      `FAC-${year}-${index + 1}`,
      `Cliente ${unitKey} Demo`,
      "Asesor Demo",
      index === 0 ? userIds.asesor : null,
      branches[branchNames[index % branchNames.length]],
      units[unitKey as keyof typeof unitNames],
      (9000 + index * 1100).toFixed(2),
    ]);
    await insertRows(
      client,
      "facturas",
      ["id", "fecha", "numero", "cliente", "asesor", "asesor_id", "sucursal_id", "unidad_negocio_id", "monto"],
      invoiceRows,
    );

    const receivableRows = Object.keys(unitNames).flatMap((unitKey, unitIndex) =>
      [0, 1].map((offset) => [
        id(0x52000000 + unitIndex, offset + 1),
        `Cliente cartera ${unitKey} ${offset + 1}`,
        `FAC-CXC-${unitIndex}-${offset}`,
        dateFor(Math.max(1, month - 1), 5),
        dateFor(Math.max(1, month - (offset ? 3 : 1)), 20),
        (25000 + unitIndex * 3000).toFixed(2),
        (9000 + offset * 4500 + unitIndex * 700).toFixed(2),
        offset ? 72 : 18,
        branches[branchNames[(unitIndex + offset) % branchNames.length]],
        units[unitKey as keyof typeof unitNames],
      ]),
    );
    await insertRows(
      client,
      "cobranzas",
      ["id", "cliente", "factura_numero", "fecha_emision", "fecha_vencimiento", "monto", "saldo", "dias_vencidos", "sucursal_id", "unidad_negocio_id"],
      receivableRows,
    );

    await insertRows(
      client,
      "cobranzas_snapshots",
      ["id", "cliente", "factura_numero", "fecha_emision", "fecha_vencimiento", "monto", "saldo", "dias_vencidos", "sucursal_id", "unidad_negocio_id", "captured_at"],
      receivableRows.map((row, index) => [
        id(0x52100000, index + 1),
        ...row.slice(1),
        new Date(Date.UTC(year, Math.max(0, month - 1), 1)),
      ]),
    );

    const advisorPerformanceRows = months.flatMap((monthNumber, index) => [
      [id(0x52200000, index * 2 + 1), year, monthNumber, "81300", "Anjjel Tellerias", userIds.asesor, branches.Caracas, units.repuestos, "15000.00", "12600.00", "84.0000", "55.0000"],
      [id(0x52200000, index * 2 + 2), year, monthNumber, "25593", "Ismael Farrera", userIds.gc, branches.Caracas, units.equipos, "22000.00", "23100.00", "105.0000", "45.0000"],
    ]);
    await insertRows(
      client,
      "cumplimiento_asesores",
      ["id", "anio", "mes", "codigo_asesor", "asesor", "asesor_id", "sucursal_id", "unidad_negocio_id", "presupuesto", "venta", "pct_cumplimiento", "pct_participacion"],
      advisorPerformanceRows,
    );
    await insertRows(
      client,
      "ventas_casa",
      ["id", "sucursal_id", "unidad_negocio_id", "mes", "monto"],
      [[id(0x52300000, 1), branches.Caracas, units.repuestos, month, "7400.00"]],
    );

    const minuteRows = [
      [id(0x52400000, 1), dateFor(month, 14), branches.Valencia, units.servicios, userIds.coord, "Cliente coordinación", "Seguimiento de compromisos de sucursal", dateFor(month, 28), "pendiente", userIds.gerencia, userIds.gerencia],
      [id(0x52400000, 2), dateFor(month, 15), branches.Caracas, units.repuestos, userIds.asesor, "Cliente asesor", "Seguimiento comercial del asesor", dateFor(month, 27), "en_proceso", userIds.gerencia, userIds.gerencia],
    ];
    await insertRows(
      client,
      "minutas",
      ["id", "fecha", "sucursal_id", "unidad_negocio_id", "destinatario_id", "cliente", "descripcion", "fecha_limite", "estado", "created_by", "updated_by"],
      minuteRows,
    );

    const lostRows = [0, 1, 2].map((index) => [
      id(0x53000000, index + 1),
      dateFor(month, 10 + index),
      `Cliente equipo perdido ${index + 1}`,
      userIds.gc,
      branches[branchNames[index]],
      units.equipos,
      (11000 + index * 2500).toFixed(2),
      index === 0 ? "Precio" : index === 1 ? "Tiempo de entrega" : "Competencia",
    ]);
    await insertRows(
      client,
      "ventas_perdidas",
      ["id", "fecha", "cliente", "asesor_id", "sucursal_id", "unidad_negocio_id", "monto", "razon"],
      lostRows,
    );

    const serviceRows = [0, 1, 2].map((index) => [
      id(0x54000000, index + 1),
      dateFor(month, 6 + index),
      `Cliente servicio ${index + 1}`,
      (7200 + index * 1800).toFixed(2),
      index === 0 ? "Mantenimiento" : "Reparación",
      index === 0 ? "Taller" : "CSA",
      "Consorcio Venequip",
      index === 0 ? "Taller Caracas" : null,
      index === 1 ? "CSA Valencia" : null,
      branches[branchNames[index]],
      units.servicios,
    ]);
    await insertRows(
      client,
      "servicios",
      ["id", "fecha", "cliente", "monto", "tipo_servicio", "categoria_venta", "compania", "taller", "csa", "sucursal_id", "unidad_negocio_id"],
      serviceRows,
    );

    const brandRows = Object.keys(unitNames).flatMap((unitKey, unitIndex) =>
      months.flatMap((monthNumber, monthIndex) => [
        [id(0x55000000 + unitIndex, unitIndex * 20 + monthIndex * 2 + 1), unitKey === "repuestos" ? "Caterpillar" : unitKey === "lubfiltros" ? "Donaldson" : "CAT", monthNumber, (12000 + unitIndex * 1400).toFixed(2), (3500 + monthIndex * 400).toFixed(2), unitKey === "lubfiltros" ? "1000.00" : "0.00", (16500 + unitIndex * 1800).toFixed(2)],
        [id(0x55000000 + unitIndex, unitIndex * 20 + monthIndex * 2 + 2), unitKey === "repuestos" ? "Blumaq" : unitKey === "lubfiltros" ? "Chronus" : "Generac", monthNumber, (8200 + unitIndex * 900).toFixed(2), (2500 + monthIndex * 200).toFixed(2), unitKey === "lubfiltros" ? "800.00" : "0.00", (11500 + unitIndex * 1200).toFixed(2)],
      ]),
    );
    await insertRows(
      client,
      "detalles_ventas_repuestos",
      ["id", "marca", "mes", "ventas_ccv", "ventas_xibi", "monto_total"],
      brandRows
        .filter((_, index) => Math.floor(index / (months.length * 2)) === 0)
        .map((row) => [row[0], row[1], row[2], row[3], row[4], row[6]]),
    );
    await insertRows(
      client,
      "detalles_ventas_lubfiltros",
      ["id", "marca", "mes", "ventas_ccv", "ventas_xibi", "ventas_estrategicas", "monto_total"],
      brandRows.filter((_, index) => Math.floor(index / (months.length * 2)) === 1),
    );

    const inventoryRows = [
      ["Lubricantes", "CO", "Caracas", "42000.00"],
      ["Filtros", "DN", "Valencia", "28500.00"],
      ["Lubricantes", "NC", "Maracaibo", "19800.00"],
    ].map((row, index) => [id(0x56000000, index + 1), ...row]);
    await insertRows(client, "inventario_lubfiltros", ["id", "tipo", "proveedor_codigo", "sucursal", "monto"], inventoryRows);

    const internalRows = months.map((monthNumber, index) => [id(0x57000000, index + 1), monthNumber, (4200 + index * 650).toFixed(2)]);
    await insertRows(client, "servicios_interno", ["id", "mes", "monto"], internalRows);
    const strategicRows = months.map((monthNumber, index) => [
      id(0x58000000, index + 1),
      branches.Valencia,
      monthNumber,
      "Servicio estratégico",
      (6800 + index * 700).toFixed(2),
    ]);
    await insertRows(client, "detalles_servicios_estrategicos", ["id", "sucursal_id", "mes", "tipo_servicio", "monto"], strategicRows);

    const equipmentBrands = ["CAT", "Generac", "EP"];
    const equipmentBrandRows = months.flatMap((monthNumber, monthIndex) =>
      equipmentBrands.map((brand, brandIndex) => [
        id(0x59000000 + brandIndex, monthIndex + 1),
        year,
        monthNumber,
        brand,
        (21000 + brandIndex * 4200 + monthIndex * 900).toFixed(2),
        units.equipos,
      ]),
    );
    await insertRows(client, "equipos_por_marca", ["id", "anio", "mes", "marca", "monto", "unidad_negocio_id"], equipmentBrandRows);
    const equipmentInventoryRows = equipmentBrands.map((brand, index) => [
      id(0x5a000000, index + 1),
      year,
      month,
      brand,
      "Generador",
      (75000 - index * 12000).toFixed(2),
      (18000 + index * 2500).toFixed(2),
      3 - index,
      index,
      branches[branchNames[index]],
      units.equipos,
    ]);
    await insertRows(
      client,
      "equipos_inventario",
      ["id", "anio", "mes", "marca", "tipo_equipo", "disponible", "transito", "stock_disponible", "stock_transito", "sucursal_id", "unidad_negocio_id"],
      equipmentInventoryRows,
    );

    await client.query("COMMIT");
    console.log(`Seed demo listo para ${year}-${String(month).padStart(2, "0")}.`);
    console.log("Usuarios: demo.gerencia, demo.gc, demo.coordinador y demo.asesor @ccv.local");
    console.log("Contraseña común: CCVdemo2026!");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await (adminPool as any).end();
  }
}

seed().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});