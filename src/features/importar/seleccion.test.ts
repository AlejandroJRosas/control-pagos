import { expect, it } from "vitest";
import type { FilaPlan, PlanImportacion } from "@/db/operaciones/importarPagos";
import { ajustarMarcadas, marcadasPorDefecto } from "./seleccion";

const fila = (n: number, importable: boolean, marcada: boolean) => ({ fila: n, importable, marcada }) as FilaPlan;
const plan = (filas: FilaPlan[]) => ({ filas }) as PlanImportacion;

it("marcadasPorDefecto toma las que el plan sugiere", () => {
  expect(marcadasPorDefecto([fila(1, true, true), fila(2, true, false), fila(3, false, false)])).toEqual(new Set([1]));
});

it("ajustarMarcadas conserva la elección, quita lo que dejó de ser importable y sugiere lo que pasó a serlo", () => {
  const antes = plan([fila(1, true, true), fila(2, true, true), fila(3, false, false), fila(4, false, false)]);
  const despues = plan([fila(1, true, true), fila(2, false, false), fila(3, true, true), fila(4, true, false)]);
  // El usuario había desmarcado la 1 y dejado la 2.
  expect(ajustarMarcadas(antes, despues, new Set([2]))).toEqual(new Set([3]));
});

it("ajustarMarcadas desmarca la que pasó a no sugerirse (p. ej. un posible repetido), pero respeta la que el usuario marcó así", () => {
  const antes = plan([fila(1, true, true), fila(2, true, false)]);
  const despues = plan([fila(1, true, false), fila(2, true, false)]);
  // La 1 era sugerida y dejó de serlo; la 2 ya no se sugería y el usuario la marcó igual.
  expect(ajustarMarcadas(antes, despues, new Set([1, 2]))).toEqual(new Set([2]));
});
