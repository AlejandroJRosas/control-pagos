import type { TDocumentDefinitions } from "pdfmake/interfaces";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";

/** pdfmake pesa varios MB con sus fuentes: se carga solo al exportar. */
async function cargarPdfMake() {
  const pdfMake = (await import("pdfmake/build/pdfmake")).default;
  const vfs = (await import("pdfmake/build/vfs_fonts")).default;
  pdfMake.addVirtualFileSystem(vfs);
  return pdfMake;
}

export async function pdfBytes(dd: TDocumentDefinitions): Promise<Uint8Array> {
  const pdfMake = await cargarPdfMake();
  return new Uint8Array(await pdfMake.createPdf(dd).getBuffer());
}

export async function savePdf(dd: TDocumentDefinitions, defaultName: string): Promise<boolean> {
  const path = await save({ defaultPath: defaultName, filters: [{ name: "PDF", extensions: ["pdf"] }] });
  if (!path) return false;
  await writeFile(path, await pdfBytes(dd));
  return true;
}
