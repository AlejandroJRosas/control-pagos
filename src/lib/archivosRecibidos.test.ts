import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { FORMATO_TASAS } from "@/domain/archivoTasas";
import { separarRecibidos } from "./archivosRecibidos";

const zip = (nombre: string, entradas: Record<string, string>, type = "application/x-zip-compressed") =>
  new File([zipSync(Object.fromEntries(Object.entries(entradas).map(([k, v]) => [k, strToU8(v)])))], nombre, { type });
const imagen = (nombre: string, type = "image/jpeg") => new File(["img"], nombre, { type });

describe("separarRecibidos", () => {
  it("imágenes sueltas y .cpagos/.ctasas por su nombre", async () => {
    const r = await separarRecibidos([imagen("a.jpg"), new File(["x"], "Consolidar.cpagos"), new File(["x"], "t.CTASAS"), new File(["x"], "nota.txt")]);
    expect(r.imagenes.map((f) => f.name)).toEqual(["a.jpg"]);
    expect(r.paquetes.map((f) => f.name)).toEqual(["Consolidar.cpagos"]);
    expect(r.tasas.map((f) => f.name)).toEqual(["t.CTASAS"]);
    expect(r.rechazos).toEqual(['"nota.txt" no es una imagen PNG, JPG o WEBP']);
  });

  it("un .cpagos que WhatsApp volvió .zip entra como paquete (por su contenido, no por el nombre)", async () => {
    const json = JSON.stringify({ formato: 1 });
    const r = await separarRecibidos([zip("Consolidar - Marzo.cpagos.zip", { "paquete.json": json }), zip("otro.zip", { "paquete.json": json, "imagenes/a.jpg": "x" })]);
    expect(r.paquetes.map((f) => f.name)).toEqual(["Consolidar - Marzo.cpagos.zip", "otro.zip"]);
    expect(r.imagenes).toEqual([]);
    expect(r.rechazos).toEqual([]);
  });

  it("un .zip que trae adentro el .cpagos o el .ctasas entrega ese archivo", async () => {
    const r = await separarRecibidos([zip("a.zip", { "Consolidar - Marzo.cpagos": "P" }), zip("b.zip", { "x/Tasas.ctasas": "T" })]);
    expect(r.paquetes.map((f) => f.name)).toEqual(["Consolidar - Marzo.cpagos"]);
    expect(await r.paquetes[0].text()).toBe("P");
    expect(r.tasas.map((f) => f.name)).toEqual(["Tasas.ctasas"]);
  });

  it("un archivo de tasas en .zip", async () => {
    const r = await separarRecibidos([zip("Tasas.ctasas.zip", { "paquete.json": JSON.stringify({ formato: FORMATO_TASAS }) })]);
    expect(r.tasas.map((f) => f.name)).toEqual(["Tasas.ctasas.zip"]);
  });

  it("un .zip de imágenes (WhatsApp) entrega sus imágenes en orden, también las de carpetas, y salta lo demás", async () => {
    const r = await separarRecibidos([
      imagen("suelta.png", "image/png"),
      zip("WhatsApp Unknown.zip", {
        "WhatsApp Image 2026-11-18 at 10.02.00.jpeg": "b",
        "WhatsApp Image 2026-11-18 at 09.15.00.JPG": "a",
        "sub/c.webp": "c",
        "sub/d.png": "d",
        "__MACOSX/sub/._d.png": "basura",
        "leeme.txt": "x",
        "video.mp4": "x",
      }),
    ]);
    expect(r.imagenes.map((f) => f.name)).toEqual([
      "suelta.png",
      "c.webp",
      "d.png",
      "WhatsApp Image 2026-11-18 at 09.15.00.JPG",
      "WhatsApp Image 2026-11-18 at 10.02.00.jpeg",
    ]);
    expect(r.imagenes.map((f) => f.type)).toEqual(["image/png", "image/webp", "image/png", "image/jpeg", "image/jpeg"]);
    expect(await r.imagenes[3].text()).toBe("a");
    expect(r.rechazos).toEqual([]);
  });

  it("reconoce el .zip por el tipo aunque el nombre no lo diga", async () => {
    const r = await separarRecibidos([zip("descarga", { "a.jpg": "a" }, "application/zip")]);
    expect(r.imagenes.map((f) => f.name)).toEqual(["a.jpg"]);
  });

  it("un .zip sin imágenes ni paquete, o dañado, se rechaza con su motivo", async () => {
    const r = await separarRecibidos([zip("docs.zip", { "a.pdf": "x" }), new File(["no soy un zip"], "roto.zip")]);
    expect(r.imagenes).toEqual([]);
    expect(r.rechazos).toEqual(['"docs.zip" no trae imágenes PNG, JPG o WEBP', '"roto.zip" no se pudo abrir: el .zip está dañado']);
  });
});
