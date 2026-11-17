import { describe, expect, it } from "vitest";
import { armarArchivoTasas, cambiosImportarTasas, leerArchivoTasas, planImportarTasas, type TasaExistenteImportar } from "./archivoTasas";

describe("armarArchivoTasas / leerArchivoTasas", () => {
  it("lleva todas las tasas por fecha con el nombre de su captura, y se lee igual", () => {
    const { archivo, imagenes } = armarArchivoTasas(
      [
        { fecha: "2026-11-03", valor: "220.5", notas: null, imagenPath: null },
        { fecha: "2026-11-02", valor: "219.45", notas: "ojo", imagenPath: "imagenes/t1.png" },
      ],
      "2026-11-17T10:00:00.000Z",
    );
    expect(imagenes).toEqual(["imagenes/t1.png"]);
    expect(archivo.tasas).toEqual([
      { fecha: "2026-11-02", valor: "219.45", notas: "ojo", imagen: "t1.png" },
      { fecha: "2026-11-03", valor: "220.5", notas: null, imagen: null },
    ]);
    expect(leerArchivoTasas(JSON.stringify(archivo))).toEqual(archivo);
  });

  it("rechaza lo que no es un archivo de tasas o trae datos inválidos", () => {
    expect(() => leerArchivoTasas("no json")).toThrow(/no es un archivo de tasas/);
    expect(() => leerArchivoTasas(JSON.stringify({ formato: 1, campana: {} }))).toThrow(/no es un archivo de tasas/);
    const base = { formato: "control-pagos/tasas", version: 1, creadoEn: "" };
    expect(() => leerArchivoTasas(JSON.stringify({ ...base, tasas: [{ fecha: "2026-13-01", valor: "1", notas: null, imagen: null }] }))).toThrow();
    expect(() => leerArchivoTasas(JSON.stringify({ ...base, tasas: [{ fecha: "2026-11-02", valor: "1,5", notas: null, imagen: null }] }))).toThrow();
    expect(() => leerArchivoTasas(JSON.stringify({ ...base, tasas: [{ fecha: "2026-11-02", valor: "1", notas: null, imagen: "../x.png" }] }))).toThrow();
    expect(() => leerArchivoTasas(JSON.stringify({ ...base, version: 2, tasas: [] }))).toThrow(/versión más nueva/);
  });
});

describe("planImportarTasas", () => {
  const actual = (valor: string, imagenPath: string | null = null): TasaExistenteImportar => ({ id: 7, valor, notas: "mía", imagenPath, usos: 3 });
  const archivo = (tasas: { fecha: string; valor: string; imagen?: string | null; notas?: string | null }[]) => ({
    formato: "control-pagos/tasas" as const,
    version: 1 as const,
    creadoEn: "",
    tasas: tasas.map((t) => ({ notas: null, imagen: null, ...t })),
  });

  it("clasifica nuevas, iguales, capturas que faltan, distintas e inválidas", () => {
    const existentes = new Map([
      ["2026-11-03", actual("220.50")],
      ["2026-11-04", actual("221", "imagenes/a.png")],
      ["2026-11-05", actual("222")],
    ]);
    const plan = planImportarTasas(
      archivo([
        { fecha: "2026-11-02", valor: "219" },
        { fecha: "2026-11-03", valor: "220.5", imagen: "c.png" },
        { fecha: "2026-11-04", valor: "221", imagen: "b.png" },
        { fecha: "2026-11-05", valor: "223" },
        { fecha: "2026-11-07", valor: "224" },
        { fecha: "2026-11-09", valor: "225" },
        { fecha: "2026-11-02", valor: "219" },
      ]),
      existentes,
      new Set(["2026-11-09"]),
    );
    expect(plan.map((f) => f.tipo)).toEqual(["nueva", "captura", "igual", "distinta", "invalida", "invalida", "invalida"]);
    expect(plan.map((f) => (f.tipo === "invalida" ? f.motivo : ""))).toEqual(["", "", "", "", "Sábado o domingo: no lleva tasa propia", "Es feriado aquí: no lleva tasa propia", "Fecha repetida en el archivo"]);
  });

  it("los cambios: nuevas y capturas siempre; las distintas solo si se eligen, conservando captura y notas propias si el archivo no trae", () => {
    const existentes = new Map([
      ["2026-11-03", actual("220", null)],
      ["2026-11-05", actual("222", "imagenes/mia.png")],
      ["2026-11-06", actual("230")],
    ]);
    const plan = planImportarTasas(
      archivo([
        { fecha: "2026-11-02", valor: "219", imagen: "n.png", notas: "x" },
        { fecha: "2026-11-03", valor: "220", imagen: "c.png", notas: "del archivo" },
        { fecha: "2026-11-05", valor: "223" },
        { fecha: "2026-11-06", valor: "231" },
      ]),
      existentes,
      new Set(),
    );
    expect(cambiosImportarTasas(plan, new Set(["2026-11-05"]))).toEqual([
      { tipo: "nueva", fecha: "2026-11-02", valor: "219", notas: "x", imagen: "n.png" },
      { tipo: "actualizar", id: 7, fecha: "2026-11-03", valor: "220", notas: "mía", imagen: "c.png", imagenPath: null },
      { tipo: "actualizar", id: 7, fecha: "2026-11-05", valor: "223", notas: "mía", imagen: null, imagenPath: "imagenes/mia.png" },
    ]);
  });
});
