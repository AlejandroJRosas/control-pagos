import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import type { Campana } from "@/db/repos/campanas";
import type { CampanaView } from "@/domain/campanaView";
import { buildGerenteWorkbook } from "@/export/campanaWorkbook";
import { buildGerentePdf } from "@/export/campanaPdf";
import { pdfBytes } from "@/export/savePdf";
import { ETIQUETA_FORMATO, nombreEstadoCuenta, type FormatoEnvio } from "@/lib/formatoEnvio";
import { copiarArchivo } from "@/platform/envios";
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

async function bytes(formato: FormatoEnvio, f: FuenteEstadoCuenta): Promise<Uint8Array> {
  switch (formato) {
    case "imagen":
      return new Uint8Array(await (await imagenDeHoja(f.hoja)).arrayBuffer());
    case "pdf":
      return pdfBytes(buildGerentePdf(f.campana, f.view, f.asignacionId));
    case "excel":
      return new Uint8Array((await buildGerenteWorkbook(f.campana, f.view, f.asignacionId).xlsx.writeBuffer()) as ArrayBuffer);
  }
}

const nombre = (formato: FormatoEnvio, f: FuenteEstadoCuenta) => nombreEstadoCuenta(formato, f.gerenteNombre, f.campana.nombre, f.fechaCorte);

/** La imagen se copia como imagen; el PDF y el Excel, como archivo. Devuelve el aviso para el usuario. */
export async function copiarEstadoCuenta(formato: FormatoEnvio, f: FuenteEstadoCuenta): Promise<string> {
  if (formato === "imagen") {
    await copiarImagen(await imagenDeHoja(f.hoja));
    return "Imagen copiada";
  }
  await copiarArchivo(await bytes(formato, f), nombre(formato, f));
  return `${ETIQUETA_FORMATO[formato]} copiado`;
}

/** Pide dónde guardarlo; false si se canceló. */
export async function guardarEstadoCuenta(formato: FormatoEnvio, f: FuenteEstadoCuenta): Promise<boolean> {
  const filtro = { imagen: { name: "Imagen PNG", extensions: ["png"] }, pdf: { name: "PDF", extensions: ["pdf"] }, excel: { name: "Excel", extensions: ["xlsx"] } }[formato];
  const path = await save({ defaultPath: nombre(formato, f), filters: [filtro] });
  if (!path) return false;
  await writeFile(path, await bytes(formato, f));
  return true;
}
