import type { TDocumentDefinitions } from "pdfmake/interfaces";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";

let pdfMakeListo: ReturnType<typeof importarPdfMake> | null = null;

async function importarPdfMake() {
  const pdfMake = (await import("pdfmake/build/pdfmake")).default;
  const vfs = (await import("pdfmake/build/vfs_fonts")).default;
  pdfMake.addVirtualFileSystem(vfs);
  return pdfMake;
}

/** pdfmake pesa varios MB con sus fuentes: se carga una sola vez y solo cuando hace falta. */
export function precargarPdfMake(): ReturnType<typeof importarPdfMake> {
  pdfMakeListo ??= importarPdfMake().catch((e) => {
    pdfMakeListo = null;
    throw e;
  });
  return pdfMakeListo;
}

export async function pdfBytes(dd: TDocumentDefinitions): Promise<Uint8Array> {
  const pdfMake = await precargarPdfMake();
  return new Uint8Array(await pdfMake.createPdf(dd).getBuffer());
}

/** `alGenerar` se llama después de elegir la ruta, cuando empieza la parte lenta. */
export async function savePdf(dd: TDocumentDefinitions, defaultName: string, alGenerar?: () => void): Promise<boolean> {
  const path = await save({ defaultPath: defaultName, filters: [{ name: "PDF", extensions: ["pdf"] }] });
  if (!path) return false;
  alGenerar?.();
  await writeFile(path, await pdfBytes(dd));
  return true;
}
