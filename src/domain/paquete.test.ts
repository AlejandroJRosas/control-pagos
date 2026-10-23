import { describe, expect, it } from "vitest";
import { armarPaquete, leerPaquete, nombreArchivoPaquete, type DatosEnvio } from "./paquete";

const meta = { appVersion: "0.4.16", creadoEn: "2026-10-23T10:00:00.000Z", origen: "PC-OFICINA" };
const MSG_INVALIDO = "El archivo no es un paquete de Control de Pagos válido";

function datos(ultimoA: string | null = null, ultimoB: string | null = null): DatosEnvio {
  const dep = (n: string, asig: number, asigUuid: string, actualizadoEn: string, imagenPath: string | null = null) => ({
    uuid: `d-${n}`, asignacionUuid: asigUuid, asignacionId: asig, fecha: "2026-09-30", banco: "Venezuela", referencia: n, cuentaDestino: "0102",
    montoBs: "1000.50", observaciones: null, tasaFecha: "2026-09-30", tasaValor: "36.5", creadoEn: "2026-09-30T08:00:00.000Z", actualizadoEn, imagenPath,
  });
  return {
    campana: { id: 1, uuid: "c-1", nombre: "Marzo 2026" },
    asignaciones: [
      { id: 10, uuid: "a-A", gerenteId: 1, gerenteUuid: "g-A", gerenteNombre: "Ana", saldoUsd: "500", ultimoEnvio: ultimoA },
      { id: 20, uuid: "a-B", gerenteId: 2, gerenteUuid: "g-B", gerenteNombre: "Beto", saldoUsd: "300.25", ultimoEnvio: ultimoB },
    ],
    depositos: [
      dep("1", 10, "a-A", "2026-10-01T00:00:00.000Z", "imagenes/ab.jpg"),
      dep("2", 10, "a-A", "2026-10-10T00:00:00.000Z"),
      dep("3", 20, "a-B", "2026-10-01T00:00:00.000Z"),
    ],
    eliminaciones: [{ uuid: "e-1", asignacionUuid: "a-A", eliminadoEn: "2026-10-05T00:00:00.000Z" }],
  };
}

describe("armarPaquete", () => {
  it("incluye solo las asignaciones elegidas", () => {
    const { paquete } = armarPaquete(datos(), { asignacionIds: [10], soloCambios: false }, meta);
    expect(paquete.asignaciones.map((a) => a.uuid)).toEqual(["a-A"]);
    expect(paquete.depositos.every((d) => d.asignacionUuid === "a-A")).toBe(true);
    expect(paquete.eliminaciones.every((e) => e.asignacionUuid === "a-A")).toBe(true);
    expect(paquete.depositos).toHaveLength(2);
  });

  it("no deja depósitos ni eliminaciones de B al elegir solo A", () => {
    const d = datos();
    d.eliminaciones.push({ uuid: "e-2", asignacionUuid: "a-B", eliminadoEn: "2026-10-06T00:00:00.000Z" });
    const { paquete } = armarPaquete(d, { asignacionIds: [10], soloCambios: false }, meta);
    expect(paquete.eliminaciones.map((e) => e.uuid)).toEqual(["e-1"]);
  });

  it("sin soloCambios manda todo y desde=null", () => {
    const { paquete } = armarPaquete(datos("2026-10-05T00:00:00.000Z"), { asignacionIds: [10, 20], soloCambios: false }, meta);
    expect(paquete.depositos).toHaveLength(3);
    expect(paquete.eliminaciones).toHaveLength(1);
    expect(paquete.asignaciones.map((a) => a.desde)).toEqual([null, null]);
  });

  it("con soloCambios manda lo posterior al último envío de cada gerente", () => {
    const { paquete } = armarPaquete(datos("2026-10-05T00:00:00.000Z", null), { asignacionIds: [10, 20], soloCambios: true }, meta);
    expect(paquete.depositos.map((d) => d.uuid)).toEqual(["d-2", "d-3"]);
    expect(paquete.eliminaciones).toEqual([]);
    expect(paquete.asignaciones.map((a) => a.desde)).toEqual(["2026-10-05T00:00:00.000Z", null]);
  });

  it("tasas: una por tasaFecha usada, con su valor", () => {
    const { paquete } = armarPaquete(datos(), { asignacionIds: [10, 20], soloCambios: false }, meta);
    expect(paquete.tasas).toEqual([{ fecha: "2026-09-30", valor: "36.5" }]);
  });

  it("imagen es el nombre del archivo y imagenes las rutas", () => {
    const { paquete, imagenes } = armarPaquete(datos(), { asignacionIds: [10], soloCambios: false }, meta);
    expect(paquete.depositos[0].imagen).toBe("ab.jpg");
    expect(paquete.depositos[1].imagen).toBeNull();
    expect(imagenes).toEqual(["imagenes/ab.jpg"]);
  });

  it("porAsignacion cuenta los depósitos que viajan", () => {
    const { porAsignacion } = armarPaquete(datos("2026-10-05T00:00:00.000Z"), { asignacionIds: [10, 20], soloCambios: true }, meta);
    expect(porAsignacion.get(10)).toBe(1);
    expect(porAsignacion.get(20)).toBe(1);
  });
});

describe("leerPaquete", () => {
  it("acepta lo que arma armarPaquete", () => {
    const { paquete } = armarPaquete(datos(), { asignacionIds: [10, 20], soloCambios: false }, meta);
    expect(leerPaquete(JSON.stringify(paquete))).toEqual(paquete);
  });

  const base = () => armarPaquete(datos(), { asignacionIds: [10, 20], soloCambios: false }, meta).paquete;

  it("rechaza texto que no es JSON", () => {
    expect(() => leerPaquete("hola")).toThrow(MSG_INVALIDO);
  });

  it("rechaza un formato más nuevo", () => {
    const p = { ...base(), formato: 2 };
    expect(() => leerPaquete(JSON.stringify(p))).toThrow("El archivo es de una versión más nueva de Control de Pagos: actualiza la app para abrirlo");
  });

  it("rechaza montos, fechas e imágenes inválidos", () => {
    const monto = base();
    monto.depositos[0].montoBs = "1.234,5";
    expect(() => leerPaquete(JSON.stringify(monto))).toThrow(MSG_INVALIDO);
    const fecha = base();
    fecha.depositos[0].fecha = "2026-13-01";
    expect(() => leerPaquete(JSON.stringify(fecha))).toThrow(MSG_INVALIDO);
    const img = base();
    img.depositos[0].imagen = "../x.jpg";
    expect(() => leerPaquete(JSON.stringify(img))).toThrow(MSG_INVALIDO);
  });
});

describe("nombreArchivoPaquete", () => {
  it("arma el nombre", () => {
    expect(nombreArchivoPaquete("Marzo 2026", "PC-OFICINA", "2026-10-23")).toBe("consolidar-marzo-2026-pc-oficina-2026-10-23.cpagos");
  });
});
