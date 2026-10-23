import { describe, expect, it } from "vitest";
import { emparejarCampana, emparejarGerentes, type AsignacionLocal } from "./consolidar";
import type { AsignacionPaquete } from "./paquete";

const remota = (uuid: string, gerenteUuid: string, nombre: string): AsignacionPaquete => ({ uuid, gerente: { uuid: gerenteUuid, nombre }, saldoUsd: "0", desde: null });
const local = (id: number, gerenteId: number, gerenteNombre: string): AsignacionLocal => ({
  id, uuid: `l${id}`, gerenteId, gerenteNombre, saldoUsd: "0", ultimoEnvio: null, ultimoRecibo: null,
});

describe("emparejarCampana", () => {
  const camp = { uuid: "c", nombre: "MARZO " };
  it("campaña recordada gana al nombre", () => {
    const r = emparejarCampana(camp, [{ id: 1, nombre: "Marzo" }, { id: 2, nombre: "Otra" }], 2);
    expect(r).toEqual({ campanaId: 2, estado: "recordado" });
  });
  it("campaña por nombre sin acentos ni mayúsculas", () => {
    expect(emparejarCampana(camp, [{ id: 1, nombre: "Marzo" }], undefined)).toEqual({ campanaId: 1, estado: "nombre" });
  });
  it("campaña con dos coincidencias pide elegir", () => {
    const r = emparejarCampana(camp, [{ id: 1, nombre: "Marzo" }, { id: 2, nombre: "marzo" }], undefined);
    expect(r).toEqual({ campanaId: null, estado: "varios" });
  });
  it("campaña sin coincidencia", () => {
    expect(emparejarCampana(camp, [{ id: 1, nombre: "Abril" }], undefined)).toEqual({ campanaId: null, estado: "ninguno" });
  });
});

describe("emparejarGerentes", () => {
  it("gerente recordado", () => {
    const r = emparejarGerentes([remota("a1", "g1", "Otro nombre")], [local(10, 5, "Jose Perez")], new Map([["g1", 5]]));
    expect(r.a1).toEqual({ asignacionId: 10, estado: "recordado" });
  });
  it("gerente por nombre", () => {
    const r = emparejarGerentes([remota("a1", "g1", "Jose Perez")], [local(10, 5, "José Pérez")], new Map());
    expect(r.a1).toEqual({ asignacionId: 10, estado: "nombre" });
  });
  it("gerente sin coincidencia queda en No incluir sin bloquear", () => {
    const r = emparejarGerentes([remota("a1", "g1", "Nadie")], [local(10, 5, "José Pérez")], new Map());
    expect(r.a1).toEqual({ asignacionId: null, estado: "ninguno" });
  });
  it("dos gerentes locales con el mismo nombre piden decidir", () => {
    const r = emparejarGerentes([remota("a1", "g1", "José Pérez")], [local(10, 5, "José Pérez"), local(11, 6, "jose perez")], new Map());
    expect(r.a1).toEqual({ asignacionId: undefined, estado: "varios" });
  });
  it("dos remotos no caen en la misma asignación", () => {
    const r = emparejarGerentes([remota("a1", "g1", "José Pérez"), remota("a2", "g2", "jose perez")], [local(10, 5, "José Pérez")], new Map());
    expect(r.a1).toEqual({ asignacionId: 10, estado: "nombre" });
    expect(r.a2).toEqual({ asignacionId: undefined, estado: "varios" });
  });
});
