// Capturas de las pantallas clave con la vista previa (`pnpm vista` en otra terminal), con Edge sin ventana.
// Uso: pnpm capturas [carpeta]   (por defecto ./capturas, que no se sube). Modo claro y oscuro.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const BASE = process.env.VISTA_URL ?? "http://localhost:1440";
const EDGE = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
if (!EDGE) throw new Error("No se encontró Microsoft Edge.");

const PANTALLAS = [
  ["resumen", "/resumen"],
  ["campanas", "/campanas"],
  ["campana", "/campanas/1"],
  ["campana-gerentes", "/campanas/1?tab=gerentes"],
  ["campana-estructura", "/campanas/1?tab=estructura"],
  ["gerente-en-campana", "/asignaciones/1"],
  ["gerentes", "/gerentes"],
  ["ficha-gerente", "/gerentes/1"],
  ["tasas", "/tasas"],
  ["configuracion", "/configuracion"],
];

const destino = path.resolve(process.argv[2] ?? "capturas");
mkdirSync(destino, { recursive: true });
for (const modo of ["claro", "oscuro"]) {
  for (const [nombre, ruta] of PANTALLAS) {
    // Un perfil nuevo por captura: cada una arranca de cero (localStorage limpio).
    const perfil = mkdtempSync(path.join(tmpdir(), "capturas-"));
    const archivo = path.join(destino, `${nombre}-${modo}.png`);
    execFileSync(EDGE, [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      `--user-data-dir=${perfil}`,
      "--window-size=1400,900",
      "--virtual-time-budget=10000",
      `--screenshot=${archivo}`,
      `${BASE}/?capturas&modo=${modo}#${ruta}`,
    ], { stdio: "ignore" });
    rmSync(perfil, { recursive: true, force: true });
    console.log(archivo);
  }
}
