import { strFromU8, unzipSync } from "fflate";
import { EXTENSION_TASAS, FORMATO_TASAS } from "@/domain/archivoTasas";
import { ACCEPTED_IMAGE_TYPES, mimeForPath } from "@/platform/images";

/** Lo que llegó al soltar, pegar o elegir archivos, ya separado. Los `.zip` se abren y se clasifican por su contenido. */
export type Recibidos = {
  imagenes: File[];
  /** Paquetes para consolidar: `.cpagos`, o un `.zip` con `paquete.json` (WhatsApp entrega el `.cpagos` como `.zip`). */
  paquetes: File[];
  /** Archivos de tasas: `.ctasas` o su `.zip`. */
  tasas: File[];
  /** Un mensaje por archivo que no sirve. */
  rechazos: string[];
};

export const avisoTasas = (nombre: string) => `"${nombre}" es un archivo de tasas: impórtalo desde Tasas → Exportar / importar`;
export const avisoPaquete = (nombre: string) => `"${nombre}" es un paquete para consolidar: suéltalo fuera de esta zona o ábrelo desde el menú Campaña`;

const TIPOS_ZIP = ["application/zip", "application/x-zip-compressed", "application/x-zip"];
// Tope de lo descomprimido: un zip de comprobantes no se acerca; protege de un zip "bomba".
const MAX_DESCOMPRIMIDO = 1 << 30;

export const esZip = (f: { name: string; type: string }): boolean => /\.zip$/i.test(f.name) || TIPOS_ZIP.includes(f.type);
export const esTipoZip = (type: string): boolean => TIPOS_ZIP.includes(type);
const termina = (f: File, ext: string) => f.name.toLowerCase().endsWith(`.${ext}`);
const esImagenZip = (nombre: string) => ACCEPTED_IMAGE_TYPES.includes(mimeForPath(nombre));
const base = (ruta: string) => ruta.slice(ruta.lastIndexOf("/") + 1);
const esArchivoApp = (nombre: string) => /\.(cpagos|ctasas)$/i.test(nombre);
const ignorada = (ruta: string) => ruta.startsWith("__MACOSX/") || base(ruta).startsWith(".");

type ContenidoZip = { tipo: "paquete"; archivo: File } | { tipo: "tasas"; archivo: File } | { tipo: "imagenes"; imagenes: File[] } | { tipo: "nada" } | { tipo: "danado" } | { tipo: "grande" };

async function leerZip(f: File): Promise<ContenidoZip> {
  let total = 0;
  let entradas: Record<string, Uint8Array>;
  try {
    entradas = unzipSync(new Uint8Array(await f.arrayBuffer()), {
      filter: (e) => {
        const sirve = e.name === "paquete.json" || (!ignorada(e.name) && (esImagenZip(e.name) || esArchivoApp(e.name)));
        if (sirve) total += e.originalSize;
        return sirve && total <= MAX_DESCOMPRIMIDO;
      },
    });
  } catch {
    return { tipo: "danado" };
  }
  if (total > MAX_DESCOMPRIMIDO) return { tipo: "grande" };
  const json = entradas["paquete.json"];
  if (json) {
    let formato: unknown;
    try {
      formato = (JSON.parse(strFromU8(json)) as { formato?: unknown } | null)?.formato;
    } catch {
      // Lo valida quien lo abra (`leerPaquete`), con su mensaje.
    }
    return formato === FORMATO_TASAS ? { tipo: "tasas", archivo: f } : { tipo: "paquete", archivo: f };
  }
  const nombres = Object.keys(entradas)
    .filter((n) => !n.endsWith("/"))
    .sort((a, b) => a.localeCompare(b, "es", { numeric: true, sensitivity: "base" }));
  // El .cpagos o .ctasas metido dentro de un .zip (no el zip renombrado).
  const interno = nombres.find(esArchivoApp);
  if (interno) {
    const archivo = new File([entradas[interno] as BlobPart], base(interno), { lastModified: f.lastModified });
    return interno.toLowerCase().endsWith(".cpagos") ? { tipo: "paquete", archivo } : { tipo: "tasas", archivo };
  }
  if (nombres.length === 0) return { tipo: "nada" };
  return { tipo: "imagenes", imagenes: nombres.map((n) => new File([entradas[n] as BlobPart], base(n), { type: mimeForPath(n), lastModified: f.lastModified })) };
}

/** Separa lo recibido. Las imágenes de un `.zip` van en su lugar, como si se hubieran soltado sueltas y en orden. */
export async function separarRecibidos(files: File[]): Promise<Recibidos> {
  const r: Recibidos = { imagenes: [], paquetes: [], tasas: [], rechazos: [] };
  for (const f of files) {
    if (ACCEPTED_IMAGE_TYPES.includes(f.type)) r.imagenes.push(f);
    else if (termina(f, "cpagos")) r.paquetes.push(f);
    else if (termina(f, EXTENSION_TASAS)) r.tasas.push(f);
    else if (!esZip(f)) r.rechazos.push(`"${f.name}" no es una imagen PNG, JPG o WEBP`);
    else {
      const c = await leerZip(f);
      if (c.tipo === "paquete") r.paquetes.push(c.archivo);
      else if (c.tipo === "tasas") r.tasas.push(c.archivo);
      else if (c.tipo === "imagenes") r.imagenes.push(...c.imagenes);
      else if (c.tipo === "nada") r.rechazos.push(`"${f.name}" no trae imágenes PNG, JPG o WEBP`);
      else if (c.tipo === "grande") r.rechazos.push(`"${f.name}" es demasiado grande para abrirlo`);
      else r.rechazos.push(`"${f.name}" no se pudo abrir: el .zip está dañado`);
    }
  }
  return r;
}
