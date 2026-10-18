import { BaseDirectory, mkdir, readFile, writeFile } from "@tauri-apps/plugin-fs";

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
  const bytes = await readFile(relPath, opts);
  return URL.createObjectURL(new Blob([bytes], { type: mimeForPath(relPath) }));
}

export async function persistImagen(v: ImagenValue): Promise<string | null> {
  if (!v) return null;
  return v.kind === "stored" ? v.path : saveImage(v.file);
}
