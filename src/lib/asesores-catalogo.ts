export interface AsesorCanonico {
  codigo: string;
  nombre: string;
  sucursal: string;
}

export const VENTAS_CASA: AsesorCanonico = {
  codigo: "CASA",
  nombre: "Ventas Casa",
  sucursal: "Todas",
};

export const ASESORES_CANONICOS: AsesorCanonico[] = [
  { sucursal: "Puerto Ordaz", nombre: "Abiezer Guerra", codigo: "75610" },
  { sucursal: "Puerto Ordaz", nombre: "Islanis Romero", codigo: "81238" },
  { sucursal: "Puerto Ordaz", nombre: "Hermes Heredia", codigo: "75595" },
  { sucursal: "Puerto Ordaz", nombre: "Onesimo Rodriguez", codigo: "44711" },
  { sucursal: "Puerto Ordaz", nombre: "Felix Conde", codigo: "57995" },
  { sucursal: "Puerto Ordaz", nombre: "Carlos Boom", codigo: "46128" },
  { sucursal: "Puerto la Cruz", nombre: "Cesar Ramirez", codigo: "46125" },
  { sucursal: "Puerto la Cruz", nombre: "Abel Briceño", codigo: "80068" },
  { sucursal: "Puerto la Cruz", nombre: "Jose A. Lopez", codigo: "27931" },
  { sucursal: "Puerto la Cruz", nombre: "Alfredo Betancourt", codigo: "80868" },
  { sucursal: "Barquisimeto", nombre: "Javier Gomez", codigo: "95520" },
  { sucursal: "Barquisimeto", nombre: "Ivan Gonzalez", codigo: "48179" },
  { sucursal: "Barquisimeto", nombre: "Jose Martinez", codigo: "45499" },
  { sucursal: "Barquisimeto", nombre: "Melvin Ramirez", codigo: "81459" },
  { sucursal: "Barquisimeto", nombre: "Samael Barillas", codigo: "48162" },
  { sucursal: "Valencia", nombre: "Juan Otaiza", codigo: "19415" },
  { sucursal: "Valencia", nombre: "Henry Urdaneta", codigo: "45497" },
  { sucursal: "Valencia", nombre: "Jesus Chavez", codigo: "78297" },
  { sucursal: "Valencia", nombre: "Jhon Hernandez", codigo: "49935" },
  { sucursal: "Valencia", nombre: "Diana Rangel", codigo: "81592" },
  { sucursal: "Caracas", nombre: "Omar Mendoza", codigo: "27124" },
  { sucursal: "Caracas", nombre: "Juan Valera", codigo: "77470" },
  { sucursal: "Maracaibo", nombre: "Manuel Barrios", codigo: "33236" },
  { sucursal: "Maracaibo", nombre: "Jose Montilla", codigo: "29177" },
  { sucursal: "Maracaibo", nombre: "Eudo Prieto", codigo: "61812" },
  { sucursal: "Maracaibo", nombre: "Omer Galban", codigo: "45511" },
  { sucursal: "Maracaibo", nombre: "Elsio Romero", codigo: "93031" },
  { sucursal: "Punto Fijo", nombre: "Leonel Avila", codigo: "45501" },
  { sucursal: "Maturín", nombre: "Fernando Diaz", codigo: "34771" },
  { sucursal: "Maturín", nombre: "Americo Alcalá Martinez", codigo: "31344" },
  { sucursal: "Maturín", nombre: "Hector Rojas", codigo: "31602" },
  { sucursal: "Maturín", nombre: "Jose Padron", codigo: "17622" },
];

export function normalizarNombre(nombre: string): string {
  return nombre
    .trim()
    .toLowerCase()
    .replace(/#/g, "n") // Map '#' to 'n' for spelling like BRICE#O
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9]/g, " ") // replace non-alphanumeric with space to prevent word merging (e.g. C.,JAVIER)
    .replace(/\s+/g, " ") // merge multiple spaces
    .trim();
}

const CANONICAL_SPELLING_OVERWRITES: Record<string, string> = {
  "hernandes g john g": "49935", // Jhon Hernandez
  "briceo r abel d": "80068", // Abel Briceño
  "briceno r abel d": "80068", // Abel Briceño
  "gomez c javier amilkar": "95520", // Javier Gomez
};

export function resolverAsesor(
  query: { codigo?: string | number | null; nombre?: string | null },
  aliases?: Map<string, string>,
): AsesorCanonico {
  // 1. Resolve by code if provided
  if (query.codigo !== undefined && query.codigo !== null) {
    const codeStr = String(query.codigo).trim();
    const codeClean = codeStr.replace(/^0+/, ""); // strip leading zeros
    if (codeClean) {
      const found = ASESORES_CANONICOS.find((a) => a.codigo.replace(/^0+/, "") === codeClean);
      if (found) return found;
    }
  }

  // 2. Resolve by name if provided
  if (query.nombre) {
    const normalizedQuery = normalizarNombre(query.nombre);
    if (normalizedQuery) {
      // Try spelling overwrites map
      const overwriteCode = CANONICAL_SPELLING_OVERWRITES[normalizedQuery];
      if (overwriteCode) {
        const foundOverwrite = ASESORES_CANONICOS.find((a) => a.codigo === overwriteCode);
        if (foundOverwrite) return foundOverwrite;
      }

      // Try exact match on name
      const foundExact = ASESORES_CANONICOS.find(
        (a) => normalizarNombre(a.nombre) === normalizedQuery,
      );
      if (foundExact) return foundExact;

      // Try using alias map if provided (e.g. from compliance map)
      if (aliases) {
        const aliasCode = aliases.get(normalizedQuery);
        if (aliasCode) {
          const foundAlias = ASESORES_CANONICOS.find((a) => a.codigo === aliasCode);
          if (foundAlias) return foundAlias;
        }
      }

      // Try subset matching: if one contains all words of the other
      const queryWords = normalizedQuery.split(" ").filter(Boolean);
      if (queryWords.length > 0) {
        const foundSubset = ASESORES_CANONICOS.find((a) => {
          const canonWords = normalizarNombre(a.nombre).split(" ").filter(Boolean);
          // Check if all query words are present in canon words, or vice versa
          const allQueryInCanon = queryWords.every((qw) => canonWords.includes(qw));
          const allCanonInQuery = canonWords.every((cw) => queryWords.includes(cw));
          return allQueryInCanon || allCanonInQuery;
        });
        if (foundSubset) return foundSubset;
      }
    }
  }

  return VENTAS_CASA;
}
