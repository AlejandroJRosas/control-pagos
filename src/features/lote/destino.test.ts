import { expect, it } from "vitest";
import type { CampanaData } from "@/db/queries/campanaData";
import type { Gerente } from "@/db/repos/gerentes";
import { nombreDestino } from "./destino";

const data = { asignaciones: [{ id: 5, gerenteId: 1, gerenteNombre: "Ana", saldoUsd: "1" }] } as unknown as CampanaData;
const gerentes = [{ id: 2, nombre: "Beto" }] as Gerente[];
const d = (sel: string, nombre = "") => ({ sel, nombre, saldo: "" });

it("nombre del gerente elegido en un borrador", () => {
  expect(nombreDestino(d("a:5"), data, gerentes)).toBe("Ana");
  expect(nombreDestino(d("g:2"), data, gerentes)).toBe("Beto");
  expect(nombreDestino(d("nuevo", " Carla "), data, gerentes)).toBe("Carla");
  expect(nombreDestino(d("nuevo"), data, gerentes)).toBe("nuevo gerente");
  expect(nombreDestino(d("a:9"), data, gerentes)).toBe("sin gerente");
  expect(nombreDestino(d(""), data, gerentes)).toBe("sin gerente");
});
