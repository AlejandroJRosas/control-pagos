import { invoke } from "@tauri-apps/api/core";
import { BaseDirectory, mkdir, writeFile } from "@tauri-apps/plugin-fs";

const opts = { baseDir: BaseDirectory.AppData };

/** Deja el archivo en `envios\` y lo copia al portapapeles como archivo (se pega en WhatsApp con Ctrl+V). */
export async function copiarArchivo(bytes: Uint8Array, nombre: string): Promise<void> {
  await mkdir("envios", { ...opts, recursive: true });
  await writeFile(`envios/${nombre}`, bytes, opts);
  await invoke("copiar_envio", { nombre });
}

/** Como `copiarArchivo`, pero varios juntos: en WhatsApp se pegan todos de una vez. */
export async function copiarArchivos(archivos: { bytes: Uint8Array; nombre: string }[]): Promise<void> {
  await mkdir("envios", { ...opts, recursive: true });
  for (const a of archivos) await writeFile(`envios/${a.nombre}`, a.bytes, opts);
  await invoke("copiar_envios", { nombres: archivos.map((a) => a.nombre) });
}
