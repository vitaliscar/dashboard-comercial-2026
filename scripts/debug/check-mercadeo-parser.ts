/* Verificación manual del parser de Mercadeo contra el Excel real.
   Uso: bun scripts/check-mercadeo-parser.ts ["CCV Rendimiento.xlsx"] */
import { ExcelParser } from "@/lib/excel-parser";

const ruta = process.argv[2] ?? "CCV Rendimiento.xlsx";
const buf = await Bun.file(ruta).arrayBuffer();
const parser = new ExcelParser(Buffer.from(buf));

const canales = parser.getMercadeoCanales();
const instagram = parser.getMercadeoInstagram();
const gmb = parser.getMercadeoGoogleBusiness();
const posts = parser.getMercadeoPostHistorias();
const leads = parser.getClientesPotenciales();

console.log("Canales:", canales.length, "| Instagram:", instagram.length);
console.log("GMB:", gmb.length, "| Post/Historias:", posts.length);
console.log("Clientes Potenciales:", leads.length);
console.log("GMB sucursales:", [...new Set(gmb.map((g) => g.sucursal))].sort());
console.log("Leads sin fecha:", leads.filter((l) => l.fechaDetectada === null).length);
console.log("Leads con etapa:", leads.filter((l) => l.etapaOportunidad !== null).length);
console.log("Estatus:", [...new Set(leads.map((l) => l.estatusBis))]);
