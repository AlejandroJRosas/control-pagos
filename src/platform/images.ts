import { BaseDirectory, mkdir, readFile, remove, writeFile } from "@tauri-apps/plugin-fs";

export type ImagenValue = { kind: "stored"; path: string } | { kind: "new"; file: Blob; previewUrl: string } | null;

const EXT_BY_MIME: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const MIME_BY_EXT: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

export const ACCEPTED_IMAGE_TYPES = Object.keys(EXT_BY_MIME);
export const extensionFor = (mime: string): string | null => EXT_BY_MIME[mime] ?? null;
export const mimeForPath = (path: string): string =>
  MIME_BY_EXT[path.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";

const opts = { baseDir: BaseDirectory.AppData };

export async function saveImage(file: Blob): Promise<string> {
  const ext = extensionFor(file.type);
  if (!ext) throw new Error("Formato de imagen no soportado. Usa PNG, JPG o WEBP.");
  await mkdir("imagenes", { ...opts, recursive: true });
  const rel = `imagenes/${crypto.randomUUID()}.${ext}`;
  await writeFile(rel, new Uint8Array(await file.arrayBuffer()), opts);
  return rel;
}

export async function loadImageUrl(relPath: string): Promise<string> {
  return URL.createObjectURL(await loadImageBlob(relPath));
}

/** La imagen guardada como `Blob` (con su tipo), p. ej. para volver a leerla con el OCR. */
export async function loadImageBlob(relPath: string): Promise<Blob> {
  return new Blob([await readFile(relPath, opts)], { type: mimeForPath(relPath) });
}

export async function persistImagen(v: ImagenValue): Promise<string | null> {
  if (!v) return null;
  return v.kind === "stored" ? v.path : saveImage(v.file);
}

/** Borra una imagen guardada; si ya no existe (os error 2) no hace nada. */
export async function deleteImage(relPath: string): Promise<void> {
  try {
    await remove(relPath, opts);
  } catch (e) {
    if (!/os error 2\b/.test(String(e))) throw e;
  }
}

/** Separa los archivos de un lote en imágenes aceptadas (PNG, JPG, WEBP) y el resto. */
export function separarImagenes<T extends { type: string }>(files: T[]): { aceptadas: T[]; rechazadas: T[] } {
  const aceptadas = files.filter((f) => ACCEPTED_IMAGE_TYPES.includes(f.type));
  return { aceptadas, rechazadas: files.filter((f) => !aceptadas.includes(f)) };
}
