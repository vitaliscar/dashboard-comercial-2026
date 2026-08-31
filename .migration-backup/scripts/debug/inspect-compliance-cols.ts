import * as fs from "fs";
import * as path from "path";

function findFile(dir: string, name: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const fullPath = path.join(dir, f);
    try {
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        const found = findFile(fullPath, name);
        if (found) return found;
      } else if (f.toLowerCase() === name.toLowerCase()) {
        return fullPath;
      }
    } catch (e) {
      // ignore inaccessible paths
    }
  }
  return null;
}

function run() {
  const name = "asesores-canonicos-ventas-casa.md";
  const searchDirs = [
    "C:\\Users\\v52anap\\.claude",
    "C:\\Users\\v52anap\\.gemini\\antigravity\\brain",
    "d:\\Users\\v52anap\\Documents\\CCV 2026\\Dashboard Comercial 2026",
  ];
  for (const dir of searchDirs) {
    console.log("Searching in:", dir);
    const found = findFile(dir, name);
    if (found) {
      console.log("FOUND AT:", found);
      const content = fs.readFileSync(found, "utf-8");
      console.log(content);
      return;
    }
  }
  console.log("Not found anywhere in standard dirs!");
}

run();
