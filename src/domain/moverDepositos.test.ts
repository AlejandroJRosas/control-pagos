import { describe, expect, it } from "vitest";
import { destinosPara } from "./moverDepositos";

// Ana es jefa de Beto y de Caro; Caro es jefa de Dani. Eva no tiene jefe.
const asignaciones = [
  { id: 1, gerenteNombre: "Ana", jefeId: null },
  { id: 2, gerenteNombre: "Beto", jefeId: 1 },
  { id: 3, gerenteNombre: "Caro", jefeId: 1 },
  { id: 4, gerenteNombre: "Dani", jefeId: 3 },
  { id: 5, gerenteNombre: "Eva", jefeId: null },
];
const resumen = (r: ReturnType<typeof destinosPara>) => r.map((d) => `${d.gerenteNombre}${d.equipo ? "*" : ""}`);

describe("destinosPara", () => {
  it("de un solo gerente: primero su gente (toda la rama), después los demás, y sin él", () => {
    expect(resumen(destinosPara(asignaciones, [1]))).toEqual(["Beto*", "Caro*", "Dani*", "Eva"]);
  });

  it("de un gerente sin gente: todos los demás por nombre", () => {
    expect(resumen(destinosPara(asignaciones, [5]))).toEqual(["Ana", "Beto", "Caro", "Dani"]);
  });

  it("de varios gerentes: todos (cada depósito puede ir a otro), con la gente de cualquiera de ellos primero", () => {
    expect(resumen(destinosPara(asignaciones, [3, 5]))).toEqual(["Dani*", "Ana", "Beto", "Caro", "Eva"]);
  });
});
