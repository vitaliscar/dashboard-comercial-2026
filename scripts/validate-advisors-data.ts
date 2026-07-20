import { createClient } from "@supabase/supabase-js";
import {
  resolverAsesor,
  VENTAS_CASA,
  ASESORES_CANONICOS,
  normalizarNombre,
} from "../src/lib/asesores-catalogo";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment!");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function run() {
  console.log("=== ADVISORS MATCHING VALIDATION (FASE 0) ===");
  console.log(`Canonical catalog size: ${ASESORES_CANONICOS.length} advisors`);

  // 1. Build a dynamic alias map from cumplimiento_asesores
  // Since cumplimiento_asesores lists both the name (asesor) and the code (codigo_asesor)
  // for actual advisor quota entries, it gives us a direct translation map.
  console.log("\n1. Fetching compliance advisors to construct resolver aliases...");
  const { data: caData, error: caError } = await supabase
    .from("cumplimiento_asesores")
    .select("codigo_asesor, asesor")
    .not("codigo_asesor", "is", null)
    .not("asesor", "is", null);

  if (caError) {
    console.error("Failed to fetch compliance advisors:", caError.message);
    process.exit(1);
  }

  const aliases = new Map<string, string>();
  caData.forEach((row: { codigo_asesor: string; asesor: string }) => {
    const normName = normalizarNombre(row.asesor);
    const code = String(row.codigo_asesor).trim();
    if (normName && code) {
      aliases.set(normName, code);
    }
  });
  console.log(`Constructed name-to-code alias map with ${aliases.size} entries.`);

  // 2. Validate cotizaciones (which identify advisors by code)
  console.log("\n2. Validating cotizaciones codes...");
  const { data: cotData, error: cotError } = await supabase
    .from("cotizaciones")
    .select("asesor_codigo")
    .not("asesor_codigo", "is", null);

  if (cotError) {
    console.error("Failed to fetch cotizaciones:", cotError.message);
  } else {
    let matched = 0;
    const total = cotData.length;
    const unmatchedCodes = new Map<string, number>();

    cotData.forEach((row: { asesor_codigo: string }) => {
      const code = String(row.asesor_codigo).trim();
      const resolved = resolverAsesor({ codigo: code }, aliases);
      if (resolved !== VENTAS_CASA) {
        matched++;
      } else {
        unmatchedCodes.set(code, (unmatchedCodes.get(code) || 0) + 1);
      }
    });

    const pct = total > 0 ? ((matched / total) * 100).toFixed(2) : "0.00";
    console.log(`Matched: ${matched} / ${total} rows (${pct}%)`);
    console.log(`Unmatched rows (routed to Ventas Casa): ${total - matched}`);
    if (unmatchedCodes.size > 0) {
      console.log("Top unmatched codes in cotizaciones:");
      const sortedUnmatched = Array.from(unmatchedCodes.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      sortedUnmatched.forEach(([code, count]) => {
        console.log(`  - Code: "${code}" (occurred ${count} times)`);
      });
    }
  }

  // 3. Validate facturas (which identify advisors by name string)
  console.log("\n3. Validating facturas names...");
  const { data: facData, error: facError } = await supabase
    .from("facturas")
    .select("asesor")
    .not("asesor", "is", null);

  if (facError) {
    console.error("Failed to fetch facturas:", facError.message);
  } else {
    let matched = 0;
    const total = facData.length;
    const unmatchedNames = new Map<string, number>();

    facData.forEach((row: { asesor: string }) => {
      const name = String(row.asesor).trim();
      const resolved = resolverAsesor({ nombre: name }, aliases);
      if (resolved !== VENTAS_CASA) {
        matched++;
      } else {
        unmatchedNames.set(name, (unmatchedNames.get(name) || 0) + 1);
      }
    });

    const pct = total > 0 ? ((matched / total) * 100).toFixed(2) : "0.00";
    console.log(`Matched: ${matched} / ${total} rows (${pct}%)`);
    console.log(`Unmatched rows (routed to Ventas Casa): ${total - matched}`);
    if (unmatchedNames.size > 0) {
      console.log("Top unmatched names in facturas:");
      const sortedUnmatched = Array.from(unmatchedNames.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      sortedUnmatched.forEach(([name, count]) => {
        console.log(`  - Name: "${name}" (occurred ${count} times)`);
      });
    }
  }

  // 4. Validate ventas_perdidas (which identify advisors by name string)
  console.log("\n4. Validating ventas_perdidas names...");
  const { data: vpData, error: vpError } = await supabase
    .from("ventas_perdidas")
    .select("asesor")
    .not("asesor", "is", null);

  if (vpError) {
    console.error("Failed to fetch ventas_perdidas:", vpError.message);
  } else {
    let matched = 0;
    const total = vpData.length;
    const unmatchedNames = new Map<string, number>();

    vpData.forEach((row: { asesor: string }) => {
      const name = String(row.asesor).trim();
      const resolved = resolverAsesor({ nombre: name }, aliases);
      if (resolved !== VENTAS_CASA) {
        matched++;
      } else {
        unmatchedNames.set(name, (unmatchedNames.get(name) || 0) + 1);
      }
    });

    const pct = total > 0 ? ((matched / total) * 100).toFixed(2) : "0.00";
    console.log(`Matched: ${matched} / ${total} rows (${pct}%)`);
    console.log(`Unmatched rows (routed to Ventas Casa): ${total - matched}`);
    if (unmatchedNames.size > 0) {
      console.log("Top unmatched names in ventas_perdidas:");
      const sortedUnmatched = Array.from(unmatchedNames.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      sortedUnmatched.forEach(([name, count]) => {
        console.log(`  - Name: "${name}" (occurred ${count} times)`);
      });
    }
  }

  console.log("\n=== VALIDATION COMPLETED ===");
}

run();
