import { describe, expect, it } from "vitest";
import { compararVersiones, leerEtiquetas, novedadesPendientes, parseNotas, SEP_CAMPO, SEP_ETIQUETA, type Novedad } from "./novedades";

describe("parseNotas", () => {
  it("quita el encabezado «Novedades:» y separa los puntos", () => {
    expect(parseNotas("Novedades:\n- Uno.\n- Dos.\n")).toEqual(["Uno.", "Dos."]);
  });

  it("une al punto anterior las líneas que siguen sin guion y acepta texto suelto", () => {
    expect(parseNotas("- Uno que\n  sigue aquí.\n\n- Dos.")).toEqual(["Uno que sigue aquí.", "Dos."]);
    expect(parseNotas("Arreglo de un error.")).toEqual(["Arreglo de un error."]);
    expect(parseNotas("")).toEqual([]);
  });
});

it("compara versiones por número, no como texto", () => {
  expect(compararVersiones("0.4.10", "0.4.9")).toBeGreaterThan(0);
  expect(compararVersiones("v0.4.2", "0.4.2")).toBe(0);
  expect(compararVersiones("0.9.0", "1.0.0")).toBeLessThan(0);
  expect(compararVersiones("0.0.0-test", "0.0.0")).toBe(0);
});

it("lee la salida de git: solo etiquetas vX.Y.Z, la más nueva primero", () => {
  const etiqueta = (nombre: string, fecha: string, texto: string) => `${nombre}${SEP_CAMPO}${fecha}${SEP_CAMPO}${texto}${SEP_ETIQUETA}\n`;
  const salida =
    etiqueta("v0.4.9", "2026-10-21", "Novedades:\n- Nueve.\n") +
    etiqueta("v0.4.10", "2026-10-21", "Novedades:\n- Diez.\n") +
    etiqueta("prueba", "2026-10-01", "x") +
    etiqueta("v0.1.1", "2026-10-18", "");
  expect(leerEtiquetas(salida)).toEqual([
    { version: "0.4.10", fecha: "2026-10-21", notas: ["Diez."] },
    { version: "0.4.9", fecha: "2026-10-21", notas: ["Nueve."] },
    { version: "0.1.1", fecha: "2026-10-18", notas: [] },
  ]);
});

describe("novedadesPendientes", () => {
  const v = (version: string): Novedad => ({ version, fecha: "2026-10-20", notas: [version] });
  const lista = [v("0.4.14"), v("0.4.13"), v("0.4.12"), v("0.4.11")];
  const versiones = (n: Novedad[]) => n.map((x) => x.version);

  it("muestra las versiones nuevas desde la última vista, la más nueva primero", () => {
    expect(versiones(novedadesPendientes(lista, "0.4.11", "0.4.14"))).toEqual(["0.4.14", "0.4.13", "0.4.12"]);
    expect(versiones(novedadesPendientes(lista, "0.4.13", "0.4.14"))).toEqual(["0.4.14"]);
  });

  it("nada si ya se vio esta versión, si se volvió a una anterior o si la versión no tiene notas", () => {
    expect(novedadesPendientes(lista, "0.4.14", "0.4.14")).toEqual([]);
    expect(novedadesPendientes(lista, "0.4.14", "0.4.12")).toEqual([]);
    expect(novedadesPendientes(lista, "0.4.14", "0.4.15")).toEqual([]);
  });

  it("sin versión vista registrada, solo la actual", () => {
    expect(versiones(novedadesPendientes(lista, null, "0.4.13"))).toEqual(["0.4.13"]);
  });
});
