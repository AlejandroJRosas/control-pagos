import { describe, expect, it } from "vitest";
import type { FilaPlan } from "@/db/operaciones/importarPagos";
import { motivosFila } from "./incidencias";

const limpia = {
  problemas: [],
  duplicados: [],
  repetidaEnArchivo: null,
  posiblesRepetidos: [],
  repetidaPosibleEnArchivo: null,
  bancoDesconocido: false,
  estadoTasa: "registrada",
} as unknown as FilaPlan;
const fila = (c: Partial<FilaPlan>): FilaPlan => ({ ...limpia, ...c });
const dup = { fecha: "2026-03-02", gerenteNombre: "Ana", campanaNombre: "C" } as FilaPlan["duplicados"][number];

describe("motivosFila", () => {
  it("una fila limpia no tiene motivos", () => expect(motivosFila(limpia)).toEqual([]));
  it("incluye los problemas tal cual", () => expect(motivosFila(fila({ problemas: ["Falta el banco"] }))).toEqual(["Falta el banco"]));
  it("duplicado y banco desconocido, en orden", () =>
    expect(motivosFila(fila({ duplicados: [dup], bancoDesconocido: true }))).toEqual(["Ya está registrado", "Banco desconocido"]));
  it("repetida en el archivo", () => expect(motivosFila(fila({ repetidaEnArchivo: 2 }))).toEqual(["Repetida en el archivo (fila 2)"]));
  it("posible repetido en el archivo con su fila", () =>
    expect(motivosFila(fila({ repetidaPosibleEnArchivo: 3 }))).toContain("Posible repetido (fila 3)"));
  it("posible repetido ya registrado", () => expect(motivosFila(fila({ posiblesRepetidos: [dup] }))).toEqual(["Posible repetido"]));
  it("tasa distinta", () => expect(motivosFila(fila({ estadoTasa: "distinta" }))).toEqual(["Tasa distinta a la registrada"]));
});
