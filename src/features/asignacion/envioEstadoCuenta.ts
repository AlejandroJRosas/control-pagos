import { join } from "@tauri-apps/api/path";
import { open, save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import type { Campana } from "@/db/repos/campanas";
import type { CampanaView } from "@/domain/campanaView";
import { buildGerenteWorkbook } from "@/export/campanaWorkbook";
import { buildGerentePdf } from "@/export/campanaPdf";
import { pdfBytes } from "@/export/savePdf";
import { ETIQUETA_FORMATO, archivosDeFormato, nombreEstadoCuenta, type FormatoArchivo, type FormatoEnvio } from "@/lib/formatoEnvio";
import { copiarArchivo, copiarArchivos } from "@/platform/envios";
import { copiarImagen, imagenDeHoja } from "./HojaEstadoCuenta";

/** Lo necesario para armar el estado de cuenta de un gerente en cualquier formato. */
export type FuenteEstadoCuenta = {
  hoja: HTMLElement | null;
  campana: Campana;
  view: CampanaView;
  asignacionId: number;
  gerenteNombre: string;
  fechaCorte: string;
};

async function bytes(formato: FormatoArchivo, f: FuenteEstadoCuenta): Promise<Uint8Array> {
  switch (formato) {
    case "imagen":
      return new Uint8Array(await (await imagenDeHoja(f.hoja)).arrayBuffer());
    case "pdf":
      return pdfBytes(buildGerentePdf(f.campana, f.view, f.asignacionId));
    case "excel":
      return new Uint8Array((await buildGerenteWorkbook(f.campana, f.view, f.asignacionId).xlsx.writeBuffer()) as ArrayBuffer);
  }
}

const nombre = (formato: FormatoArchivo, f: FuenteEstadoCuenta) => nombreEstadoCuenta(formato, f.gerenteNombre, f.campana.nombre, f.fechaCorte);

/** Los archivos del estado de cuenta (la imagen como PNG; "PDF y Excel" son dos), para copiar o guardar varios juntos. */
export async function archivosEstadoCuenta(formato: FormatoEnvio, f: FuenteEstadoCuenta): Promise<{ bytes: Uint8Array; nombre: string }[]> {
  const archivos = [];
  for (const a of archivosDeFormato(formato)) archivos.push({ bytes: await bytes(a, f), nombre: nombre(a, f) });
  return archivos;
}

/** La imagen se copia como imagen; el PDF y el Excel, como archivo (los dos juntos en "PDF y Excel"). Devuelve el aviso para el usuario. */
export async function copiarEstadoCuenta(formato: FormatoEnvio, f: FuenteEstadoCuenta): Promise<string> {
  if (formato === "imagen") {
    await copiarImagen(await imagenDeHoja(f.hoja));
    return "Imagen copiada";
  }
  const archivos = await archivosEstadoCuenta(formato, f);
  if (archivos.length === 1) await copiarArchivo(archivos[0].bytes, archivos[0].nombre);
  else await copiarArchivos(archivos);
  return `${ETIQUETA_FORMATO[formato]} ${archivos.length === 1 ? "copiado" : "copiados"}`;
}

const FILTRO: Record<FormatoArchivo, { name: string; extensions: string[] }> = {
  imagen: { name: "Imagen PNG", extensions: ["png"] },
  pdf: { name: "PDF", extensions: ["pdf"] },
  excel: { name: "Excel", extensions: ["xlsx"] },
};

/** Pide dónde guardarlo (con dos archivos, la carpeta); false si se canceló. */
export async function guardarEstadoCuenta(formato: FormatoEnvio, f: FuenteEstadoCuenta): Promise<boolean> {
  const partes = archivosDeFormato(formato);
  if (partes.length > 1) {
    const carpeta = await open({ directory: true, multiple: false, recursive: true, title: "Carpeta donde guardar el estado de cuenta" });
    if (typeof carpeta !== "string") return false;
    for (const a of await archivosEstadoCuenta(formato, f)) await writeFile(await join(carpeta, a.nombre), a.bytes);
    return true;
  }
  const path = await save({ defaultPath: nombre(partes[0], f), filters: [FILTRO[partes[0]]] });
  if (!path) return false;
  await writeFile(path, await bytes(partes[0], f));
  return true;
}
