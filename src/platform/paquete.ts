import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { BaseDirectory, mkdir, readFile, writeFile } from "@tauri-apps/plugin-fs";
import { leerPaquete, type Paquete } from "@/domain/paquete";
import { mimeForPath, saveImage } from "./images";

const opts = { baseDir: BaseDirectory.AppData };
const FILTRO = { name: "Paquete de Control de Pagos", extensions: ["cpagos"] };

/** Escribe el paquete en `envios\` y lo copia al portapapeles como archivo (se pega en WhatsApp con Ctrl+V). */
export async function copiarPaquete(paquete: Paquete, imagenes: string[], nombre: string): Promise<void> {
  await invoke<string>("crear_paquete", { datos: JSON.stringify(paquete), imagenes, nombre });
  await invoke("copiar_envio", { nombre });
}

/** Pide dónde guardar el paquete; `false` si se cancela. */
export async function guardarPaqueteComo(paquete: Paquete, imagenes: string[], nombre: string): Promise<boolean> {
  const ruta = await save({ defaultPath: nombre, filters: [FILTRO] });
  if (!ruta) return false;
  await invoke<string>("crear_paquete", { datos: JSON.stringify(paquete), imagenes, nombre, ruta });
  return true;
}

/** Elige un `.cpagos`, lo extrae y devuelve su carpeta (relativa a AppData); `null` si se cancela. */
export async function abrirPaqueteDeDialogo(): Promise<string | null> {
  const ruta = await open({ multiple: false, directory: false, filters: [FILTRO] });
  if (!ruta || Array.isArray(ruta)) return null;
  return invoke<string>("abrir_paquete", { ruta });
}

/** Un `.cpagos` soltado en la app: se guarda en `recibidos\` y se extrae. */
export async function abrirPaqueteDeArchivo(f: File): Promise<string> {
  await mkdir("recibidos", { ...opts, recursive: true });
  const recibido = `r${Date.now()}.cpagos`;
  await writeFile(`recibidos/${recibido}`, new Uint8Array(await f.arrayBuffer()), opts);
  return invoke<string>("abrir_paquete", { recibido });
}

export async function leerPaqueteDeCarpeta(carpeta: string): Promise<Paquete> {
  const bytes = await readFile(`${carpeta}/paquete.json`, opts);
  return leerPaquete(new TextDecoder().decode(bytes));
}

/** Pasa un comprobante del paquete a `imagenes\`; `null` si el paquete no lo trae. */
export async function importarImagenRecibida(carpeta: string, nombre: string): Promise<string | null> {
  let bytes: Uint8Array;
  try {
    bytes = await readFile(`${carpeta}/imagenes/${nombre}`, opts);
  } catch (e) {
    if (/os error 2\b/.test(String(e))) return null;
    throw e;
  }
  return saveImage(new Blob([bytes as BlobPart], { type: mimeForPath(nombre) }));
}

export const tamanoImagenes = (imagenes: string[]): Promise<number> => invoke<number>("tamano_imagenes", { imagenes });

export async function nombreEquipo(): Promise<string> {
  return (await invoke<string>("nombre_equipo")) || "otro equipo";
}

export const esPaquete = (f: { name: string }): boolean => f.name.toLowerCase().endsWith(".cpagos");
