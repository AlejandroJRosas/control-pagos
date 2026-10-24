import { describe, expect, it } from "vitest";
import {
  agruparJefes, clasificar, decisionesIniciales, emparejarCampana, emparejarGerentes, gerentesRepetidos, idProvisional, jefesFinales, motivoPendiente,
  type AsignacionLocal, type DepositoLocal, type GerenteEmparejado, type LocalConsolidar, type PlanConsolidacion,
} from "./consolidar";
import { MOTIVO_CERRADA } from "./motivos";
import type { AsignacionPaquete, DepositoPaquete, JefePaquete, Paquete } from "./paquete";

const remota = (uuid: string, gerenteUuid: string, nombre: string): AsignacionPaquete => ({ uuid, gerente: { uuid: gerenteUuid, nombre }, saldoUsd: "0", desde: null });
const local = (id: number, gerenteId: number, gerenteNombre: string): AsignacionLocal => ({
  id, uuid: `l${id}`, gerenteId, gerenteUuid: `g${gerenteId}`, gerenteNombre, saldoUsd: "0", ultimoEnvio: null, ultimoRecibo: null, jefeId: null,
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
    const r = emparejarGerentes([remota("a1", "g1", "Otro nombre")], [local(10, 5, "Jose Perez")], new Map([["g1", 5]]), []);
    expect(r.a1).toEqual({ asignacionId: 10, estado: "recordado" });
  });
  it("gerente por nombre", () => {
    const r = emparejarGerentes([remota("a1", "g1", "Jose Perez")], [local(10, 5, "José Pérez")], new Map(), []);
    expect(r.a1).toEqual({ asignacionId: 10, estado: "nombre" });
  });
  it("un gerente que no está en la campaña se propone agregar (nuevo, o el local del mismo nombre)", () => {
    const remotas = [
      remota("a1", "g1", "Nadie"), remota("a2", "g2", "Luis Díaz"), remota("a3", "g3", "Otro"), remota("a4", "g4", "Beto"), remota("a5", "g5", "Rosa"),
    ];
    const fuera = [
      { id: 7, uuid: "x7", nombre: "luis diaz" }, { id: 8, uuid: "g3", nombre: "Distinto" }, { id: 9, uuid: "x9", nombre: "Recordada" },
      { id: 20, uuid: "x20", nombre: "Rosa" }, { id: 21, uuid: "x21", nombre: "rosa" },
    ];
    const r = emparejarGerentes(remotas, [local(10, 5, "José Pérez")], new Map([["g4", 9]]), fuera);
    expect(r.a1).toEqual({ asignacionId: -1, estado: "ninguno", agregar: { gerenteId: null } });
    expect(r.a2).toEqual({ asignacionId: -2, estado: "ninguno", agregar: { gerenteId: 7 } }); // por nombre
    expect(r.a3).toEqual({ asignacionId: -3, estado: "ninguno", agregar: { gerenteId: 8 } }); // por uuid
    expect(r.a4).toEqual({ asignacionId: -4, estado: "ninguno", agregar: { gerenteId: 9 } }); // recordado
    expect(r.a5).toEqual({ asignacionId: undefined, estado: "varios" }); // dos con el nombre: que elija el usuario
    expect(idProvisional(paq([]), "rb")).toBe(-2);
  });
  it("emparejar por el uuid de la asignación lo da por recordado", () => {
    const r = emparejarGerentes([remota("l10", "g1", "Otro nombre")], [local(11, 6, "Otro nombre"), local(10, 5, "Ana")], new Map(), []);
    expect(r.l10).toEqual({ asignacionId: 10, estado: "recordado" });
  });
  it("dos del archivo no pueden agregarse al mismo gerente local", () => {
    const g = (gerenteId: number | null, id: number): GerenteEmparejado => ({ asignacionId: id, estado: "elegido", agregar: { gerenteId } });
    expect(gerentesRepetidos({ a: g(7, -1), b: g(7, -2) })).toEqual(["a", "b"]);
    expect(gerentesRepetidos({ a: g(null, -1), b: g(null, -2) })).toBeNull();
    expect(gerentesRepetidos({ a: g(7, -1), b: g(8, -2) })).toBeNull();
  });
  it("dos gerentes locales con el mismo nombre piden decidir", () => {
    const r = emparejarGerentes([remota("a1", "g1", "José Pérez")], [local(10, 5, "José Pérez"), local(11, 6, "jose perez")], new Map(), []);
    expect(r.a1).toEqual({ asignacionId: undefined, estado: "varios" });
  });
  it("dos remotos no caen en la misma asignación", () => {
    const r = emparejarGerentes([remota("a1", "g1", "José Pérez"), remota("a2", "g2", "jose perez")], [local(10, 5, "José Pérez")], new Map(), []);
    expect(r.a1).toEqual({ asignacionId: 10, estado: "nombre" });
    expect(r.a2).toEqual({ asignacionId: undefined, estado: "varios" });
  });
});

// ---------- Clasificar ----------

const ULTIMO = "2026-03-01T00:00:00.000Z";
const asigLocal = (id: number, gerenteNombre: string, saldoUsd: string): AsignacionLocal => ({
  id, uuid: `l${id}`, gerenteId: id, gerenteUuid: `g${id}`, gerenteNombre, saldoUsd, ultimoEnvio: null, ultimoRecibo: ULTIMO, jefeId: null,
});
const rem = (o: Partial<DepositoPaquete> = {}): DepositoPaquete => ({
  uuid: "r1", asignacionUuid: "ra", fecha: "2026-03-04", banco: "Banesco", referencia: "111", cuentaDestino: "0134", montoBs: "1000",
  observaciones: null, tasaFecha: "2026-03-04", creadoEn: "2026-03-04T10:00:00.000Z", actualizadoEn: "2026-03-04T10:00:00.000Z", imagen: null, equivalentes: [], ...o,
});
const loc = (o: Partial<DepositoLocal> = {}): DepositoLocal => ({
  id: 1, uuid: "r1", asignacionId: 10, campanaId: 1, campanaNombre: "Marzo", fecha: "2026-03-04", banco: "Banesco", referencia: "111",
  cuentaDestino: "0134", montoBs: "1000.00", observaciones: null, imagenPath: null, actualizadoEn: "2026-03-04T10:00:00.000Z", ...o,
});
const paq = (depositos: DepositoPaquete[], o: Partial<Paquete> = {}): Paquete => ({
  formato: 1, appVersion: "1.0.0", creadoEn: "2026-03-10T00:00:00.000Z", origen: "Oficina", campana: { uuid: "rc1", nombre: "Marzo" },
  asignaciones: [
    { uuid: "ra", gerente: { uuid: "gA", nombre: "José Pérez" }, saldoUsd: "100", desde: null },
    { uuid: "rb", gerente: { uuid: "gB", nombre: "Ana" }, saldoUsd: "50", desde: null },
    { uuid: "rc", gerente: { uuid: "gC", nombre: "Carlos" }, saldoUsd: "70", desde: null },
  ],
  depositos, tasas: [{ fecha: "2026-03-04", valor: "36.5" }], eliminaciones: [], ...o,
});
const base = (o: Partial<LocalConsolidar> = {}): LocalConsolidar => ({
  campana: { id: 1, uuid: "c1", nombre: "Marzo", estado: "activa" },
  asignaciones: [asigLocal(10, "José Pérez", "100"), asigLocal(11, "Ana", "50")],
  depositos: [], tasas: new Map([["2026-03-04", { id: 1, valor: "36.50", usos: 3 }]]), feriados: new Set(), eliminados: new Set(),
  equivalenciasDepositos: new Map(), gerentes: [], equivalenciasGerentes: new Map(), ...o,
});
const GER: Record<string, GerenteEmparejado> = {
  ra: { asignacionId: 10, estado: "nombre" }, rb: { asignacionId: 11, estado: "nombre" }, rc: { asignacionId: null, estado: "ninguno" },
};
const motivos = (plan: PlanConsolidacion) => plan.noIncluidos.map((n) => n.motivo);

describe("clasificar", () => {
  it("nuevo con tasa existente", () => {
    const plan = clasificar(paq([rem()]), base(), GER);
    expect(plan.nuevos).toEqual([{ remoto: rem(), asignacionId: 10, tasa: { fecha: "2026-03-04", accion: "existente" } }]);
    expect(plan.tasasNuevas).toEqual([]);
    expect(plan.tasasDistintas).toEqual([]);
  });

  it("nuevo crea la tasa que falta", () => {
    const plan = clasificar(paq([rem(), rem({ uuid: "r2", referencia: "222" })]), base({ tasas: new Map() }), GER);
    expect(plan.nuevos.map((n) => n.tasa)).toEqual([{ fecha: "2026-03-04", accion: "crear" }, { fecha: "2026-03-04", accion: "crear" }]);
    expect(plan.tasasNuevas).toEqual([{ fecha: "2026-03-04", valor: "36.5" }]);
  });

  it("feriado local sin tasa no se incluye", () => {
    const d = rem({ fecha: "2026-03-02", tasaFecha: "2026-03-02" });
    const plan = clasificar(paq([d], { tasas: [{ fecha: "2026-03-02", valor: "36" }] }), base({ feriados: new Set(["2026-03-02"]) }), GER);
    expect(plan.nuevos).toEqual([]);
    expect(plan.noIncluidos).toEqual([{ remoto: d, gerenteNombre: "José Pérez", motivo: "Falta la tasa del 03/03/2026" }]);
  });

  it("feriado local usa la tasa del siguiente hábil que trae el archivo", () => {
    const d = rem({ fecha: "2026-03-02", tasaFecha: "2026-03-02" });
    const tasas = [{ fecha: "2026-03-02", valor: "36" }, { fecha: "2026-03-03", valor: "37" }];
    const plan = clasificar(paq([d], { tasas }), base({ feriados: new Set(["2026-03-02"]) }), GER);
    expect(plan.nuevos[0].tasa).toEqual({ fecha: "2026-03-03", accion: "crear" });
    expect(plan.tasasNuevas).toEqual([{ fecha: "2026-03-03", valor: "37" }]);
  });

  it("tasa del depósito que el archivo no trae: existente si la tengo, si no falta", () => {
    const d = rem({ tasaFecha: "2026-03-04" });
    expect(clasificar(paq([d], { tasas: [] }), base(), GER).nuevos[0].tasa).toEqual({ fecha: "2026-03-04", accion: "existente" });
    expect(motivos(clasificar(paq([d], { tasas: [] }), base({ tasas: new Map() }), GER))).toEqual(["Falta la tasa del 04/03/2026"]);
  });

  it("la tasa del archivo se compara en la fecha que rige aquí (con otros feriados)", () => {
    // Para el archivo el 02/03 es hábil (tasa 36); aquí es feriado y rige la del 03/03, que el archivo trae igual a la mía.
    const d = rem({ fecha: "2026-03-02", tasaFecha: "2026-03-02" });
    const tasasLocales = new Map([["2026-03-03", { id: 2, valor: "37.00", usos: 1 }]]);
    const local = base({ feriados: new Set(["2026-03-02"]), tasas: tasasLocales });
    const igual = clasificar(paq([d], { tasas: [{ fecha: "2026-03-02", valor: "36" }, { fecha: "2026-03-03", valor: "37" }] }), local, GER);
    expect(igual.nuevos[0].tasa).toEqual({ fecha: "2026-03-03", accion: "existente" });
    expect(igual.tasasDistintas).toEqual([]);
    // Si el archivo no trae la tasa del día que rige aquí, queda la mía.
    const sinRige = clasificar(paq([d], { tasas: [{ fecha: "2026-03-02", valor: "36" }] }), local, GER);
    expect(sinRige.nuevos[0].tasa).toEqual({ fecha: "2026-03-03", accion: "existente" });
    expect(sinRige.tasasDistintas).toEqual([]);
    const distinta = clasificar(paq([d], { tasas: [{ fecha: "2026-03-03", valor: "38" }] }), local, GER);
    expect(distinta.tasasDistintas).toEqual([{ fecha: "2026-03-03", local: "37.00", archivo: "38", usos: 1 }]);
  });

  it("tasa distinta se lista una vez por fecha", () => {
    const plan = clasificar(paq([rem(), rem({ uuid: "r2", referencia: "222" })], { tasas: [{ fecha: "2026-03-04", valor: "36.6" }] }), base(), GER);
    expect(plan.nuevos.map((n) => n.tasa.accion)).toEqual(["distinta", "distinta"]);
    expect(plan.tasasDistintas).toEqual([{ fecha: "2026-03-04", local: "36.50", archivo: "36.6", usos: 3 }]);
  });

  it("los depósitos de un agregado salen como nuevos con el id provisional", () => {
    const d = rem({ uuid: "c1", referencia: "555", asignacionUuid: "rc" });
    const ger = { ...GER, rc: { asignacionId: -3, estado: "ninguno" as const, agregar: { gerenteId: null } } };
    const plan = clasificar(paq([d]), base(), ger);
    expect(plan.nuevos).toEqual([{ remoto: d, asignacionId: -3, tasa: { fecha: "2026-03-04", accion: "existente" } }]);
    expect(plan.agregadas).toEqual([{ remotaUuid: "rc", asignacionId: -3, gerenteId: null, gerenteNombre: "Carlos", saldoUsd: "70" }]);
    expect([plan.saldos, plan.noIncluidos]).toEqual([[], []]);
    expect(motivoPendiente(clasificar(paq([]), base(), ger), ger, decisionesIniciales(plan))).toBeNull();
    // con un gerente local que no estaba en la campaña, su nombre
    const conLocal = { ...GER, rc: { asignacionId: -3, estado: "elegido" as const, agregar: { gerenteId: 40 } } };
    const otro = clasificar(paq([d]), base({ gerentes: [{ id: 40, uuid: "x40", nombre: "Carlos Ruiz" }] }), conLocal);
    expect(otro.agregadas[0]).toMatchObject({ gerenteId: 40, gerenteNombre: "Carlos Ruiz" });
  });

  it("gerente no emparejado o excluido no se incluye", () => {
    const d1 = rem({ asignacionUuid: "rc" });
    const d2 = rem({ uuid: "r2", referencia: "222", asignacionUuid: "rb" });
    const d3 = rem({ uuid: "r3", referencia: "333", asignacionUuid: "zz" });
    const ger = { ...GER, rb: { asignacionId: null, estado: "elegido" as const } };
    expect(motivos(clasificar(paq([d1, d2, d3]), base(), ger))).toEqual([
      "Carlos no está en tu campaña", "Elegiste no incluir a Ana", "(desconocido) no está en tu campaña",
    ]);
  });

  it("corrección cuando el remoto es más nuevo y el local no se tocó", () => {
    const d = rem({ montoBs: "1500", observaciones: "corregido", asignacionUuid: "rb", actualizadoEn: "2026-03-05T10:00:00.000Z" });
    const l = loc({ actualizadoEn: "2026-02-28T10:00:00.000Z" });
    const plan = clasificar(paq([d]), base({ depositos: [l] }), GER);
    expect(plan.correcciones).toEqual([{
      remoto: d, local: l, asignacionId: 11, tasa: { fecha: "2026-03-04", accion: "existente" },
      cambios: [
        { campo: "montoBs", antes: "1000.00", despues: "1500" },
        { campo: "observaciones", antes: null, despues: "corregido" },
        { campo: "gerente", antes: "José Pérez", despues: "Ana" },
      ],
    }]);
    expect(plan.conflictos).toEqual([]);
  });

  it("sin diferencias en los campos es sin cambios aunque cambie actualizadoEn (monto con otra escritura)", () => {
    for (const actualizadoEn of ["2026-03-05T10:00:00.000Z", "2026-02-01T10:00:00.000Z"]) {
      const plan = clasificar(paq([rem({ actualizadoEn })]), base({ depositos: [loc({ actualizadoEn: "2026-02-28T10:00:00.000Z" })] }), GER);
      expect(plan.sinCambios).toBe(1);
      expect([plan.correcciones, plan.masNuevasAqui, plan.conflictos]).toEqual([[], [], []]);
    }
  });

  it("volver a aplicar un depósito vinculado es sin cambios", () => {
    const d = rem({ uuid: "r9", referencia: "00111", actualizadoEn: "2026-03-05T10:00:00.000Z" });
    const l = loc({ id: 7, uuid: "mio", referencia: "00111", actualizadoEn: "2026-03-02T10:00:00.000Z" });
    const plan = clasificar(paq([d]), base({ depositos: [l], equivalenciasDepositos: new Map([["r9", 7]]) }), GER);
    expect(plan.sinCambios).toBe(1);
    expect([plan.vinculos, plan.conflictos, plan.correcciones]).toEqual([[], [], []]);
  });

  it("después de quedarme con mi versión en un conflicto, el mismo archivo vuelve a ser conflicto", () => {
    const T = "2026-03-06T10:00:00.000Z"; // aplicar con "mia" deja actualizado_en = ultimo_recibo = T
    const asignaciones = [{ ...asigLocal(10, "José Pérez", "100"), ultimoRecibo: T }];
    const l = loc({ actualizadoEn: T });
    const nuevo = clasificar(paq([rem({ montoBs: "1500", actualizadoEn: "2026-03-07T10:00:00.000Z" })]), base({ asignaciones, depositos: [l] }), GER);
    expect(nuevo.conflictos.map((c) => c.tipo)).toEqual(["editadoEnAmbas"]);
    expect(nuevo.correcciones).toEqual([]);
    const viejo = clasificar(paq([rem({ montoBs: "1500", actualizadoEn: "2026-03-05T10:00:00.000Z" })]), base({ asignaciones, depositos: [l] }), GER);
    expect(viejo.masNuevasAqui).toHaveLength(1);
    expect([viejo.correcciones, viejo.conflictos]).toEqual([[], []]);
  });

  it("la tasa de una corrección solo cuenta si cambia la fecha", () => {
    const tasas = [{ fecha: "2026-03-04", valor: "40" }, { fecha: "2026-03-05", valor: "41" }];
    const l = loc({ actualizadoEn: "2026-02-28T10:00:00.000Z" });
    const misma = clasificar(paq([rem({ montoBs: "2", actualizadoEn: "2026-03-05T10:00:00.000Z" })], { tasas }), base({ depositos: [l] }), GER);
    expect(misma.correcciones[0].tasa).toEqual({ fecha: "2026-03-04", accion: "existente" });
    expect([misma.tasasDistintas, misma.tasasNuevas]).toEqual([[], []]);
    const d = rem({ fecha: "2026-03-05", tasaFecha: "2026-03-05", actualizadoEn: "2026-03-05T10:00:00.000Z" });
    const otra = clasificar(paq([d], { tasas }), base({ depositos: [l] }), GER);
    expect(otra.correcciones[0].tasa).toEqual({ fecha: "2026-03-05", accion: "crear" });
    expect(otra.tasasNuevas).toEqual([{ fecha: "2026-03-05", valor: "41" }]);
  });

  it("conflicto editadoEnAmbas", () => {
    const d = rem({ montoBs: "1500", actualizadoEn: "2026-03-05T10:00:00.000Z" });
    const l = loc({ actualizadoEn: "2026-03-02T10:00:00.000Z" }); // después del último envío
    const plan = clasificar(paq([d]), base({ depositos: [l] }), GER);
    expect(plan.correcciones).toEqual([]);
    expect(plan.conflictos).toEqual([{
      tipo: "editadoEnAmbas", remoto: d, local: l, asignacionId: 10, tasa: { fecha: "2026-03-04", accion: "existente" },
      cambios: [{ campo: "montoBs", antes: "1000.00", despues: "1500" }],
    }]);
  });

  it("sin recibo previo cuenta como editado", () => {
    const d = rem({ montoBs: "1500", actualizadoEn: "2026-03-05T10:00:00.000Z" });
    const asignaciones = [{ ...asigLocal(10, "José Pérez", "100"), ultimoEnvio: "2026-03-03T00:00:00.000Z", ultimoRecibo: null }];
    const plan = clasificar(paq([d]), base({ asignaciones, depositos: [loc({ actualizadoEn: "2026-02-01T10:00:00.000Z" })] }), GER);
    expect(plan.conflictos.map((c) => c.tipo)).toEqual(["editadoEnAmbas"]);
  });

  it("solo cuenta el último recibo: una edición mía ya enviada pero posterior al recibo es conflicto", () => {
    const d = rem({ montoBs: "1500", actualizadoEn: "2026-03-09T10:00:00.000Z" });
    const asignaciones = [{ ...asigLocal(10, "José Pérez", "100"), ultimoRecibo: "2026-03-01T00:00:00.000Z", ultimoEnvio: "2026-03-03T00:00:00.000Z" }];
    const editada = clasificar(paq([d]), base({ asignaciones, depositos: [loc({ actualizadoEn: "2026-03-02T10:00:00.000Z" })] }), GER);
    expect(editada.conflictos.map((c) => c.tipo)).toEqual(["editadoEnAmbas"]);
    expect(editada.correcciones).toEqual([]);
    const intacta = clasificar(paq([d]), base({ asignaciones, depositos: [loc({ actualizadoEn: "2026-02-20T10:00:00.000Z" })] }), GER);
    expect(intacta.correcciones).toHaveLength(1);
  });

  it("mi versión más nueva no se toca", () => {
    const d = rem({ montoBs: "1500", actualizadoEn: "2026-03-04T10:00:00.000Z" });
    const l = loc({ actualizadoEn: "2026-03-06T10:00:00.000Z" });
    const plan = clasificar(paq([d]), base({ depositos: [l] }), GER);
    expect(plan.masNuevasAqui).toHaveLength(1);
    expect(plan.masNuevasAqui[0]).toMatchObject({ remoto: d, local: l, cambios: [{ campo: "montoBs", antes: "1000.00", despues: "1500" }] });
    expect([plan.correcciones, plan.conflictos, plan.nuevos]).toEqual([[], [], []]);
  });

  it("mismo actualizadoEn = sin cambios", () => {
    const plan = clasificar(paq([rem()]), base({ depositos: [loc()] }), GER);
    expect(plan.sinCambios).toBe(1);
    expect([plan.nuevos, plan.correcciones, plan.conflictos, plan.noIncluidos]).toEqual([[], [], [], []]);
  });

  it("corrección que quedaría duplicada de otro local no se incluye", () => {
    const d = rem({ referencia: "999", actualizadoEn: "2026-03-05T10:00:00.000Z" });
    const otro = loc({ id: 2, uuid: "x2", referencia: "0999" });
    const plan = clasificar(paq([d]), base({ depositos: [loc({ actualizadoEn: "2026-02-28T10:00:00.000Z" }), otro] }), GER);
    expect(motivos(plan)).toEqual(["Quedaría duplicado de Banesco 999"]);
    expect(plan.correcciones).toEqual([]);
  });

  it("corrección que quedaría duplicada de un nuevo anterior del archivo no se incluye", () => {
    const nuevo = rem({ uuid: "r5", referencia: "999" });
    const correccion = rem({ referencia: "999", actualizadoEn: "2026-03-05T10:00:00.000Z" });
    const plan = clasificar(paq([nuevo, correccion]), base({ depositos: [loc({ actualizadoEn: "2026-02-28T10:00:00.000Z" })] }), GER);
    expect(plan.nuevos.map((n) => n.remoto.uuid)).toEqual(["r5"]);
    expect(plan.correcciones).toEqual([]);
    expect(motivos(plan)).toEqual(["Quedaría duplicado de Banesco 999"]);
  });

  it("duplicado igual se vincula", () => {
    const d = rem({ uuid: "r9", banco: "Banesco", referencia: "00111" });
    const l = loc({ uuid: "otro", referencia: "00111" });
    const plan = clasificar(paq([d]), base({ depositos: [l] }), GER);
    expect(plan.vinculos).toEqual([{ remoto: d, local: l }]);
    expect([plan.nuevos, plan.conflictos]).toEqual([[], []]);
  });

  it("duplicado distinto es conflicto", () => {
    const d = rem({ uuid: "r9", referencia: "111", fecha: "2026-03-05", tasaFecha: "2026-03-05" });
    const l = loc({ uuid: "otro" });
    const tasas = [{ fecha: "2026-03-05", valor: "37" }];
    const plan = clasificar(paq([d], { tasas }), base({ depositos: [l] }), GER);
    expect(plan.conflictos).toEqual([{
      tipo: "duplicado", remoto: d, local: l, asignacionId: 10, tasa: { fecha: "2026-03-05", accion: "crear" },
      cambios: [{ campo: "fecha", antes: "2026-03-04", despues: "2026-03-05" }],
    }]);
    expect(plan.vinculos).toEqual([]);
  });

  it("duplicado en otra campaña no se incluye", () => {
    const l = loc({ uuid: "otro", campanaId: 2, campanaNombre: "Febrero" });
    expect(motivos(clasificar(paq([rem()]), base({ depositos: [l] }), GER))).toEqual(["Ya existe en tu campaña Febrero"]);
  });

  it("repetido en el archivo", () => {
    const plan = clasificar(paq([rem(), rem({ uuid: "r2", referencia: "0111" })]), base(), GER);
    expect(plan.nuevos.map((n) => n.remoto.uuid)).toEqual(["r1"]);
    expect(motivos(plan)).toEqual(["Repetido en el archivo"]);
  });

  it("duplicado de un local que ya es de otro depósito del archivo es repetido", () => {
    const plan = clasificar(paq([rem({ uuid: "r2" }), rem()]), base({ depositos: [loc()] }), GER);
    expect(plan.sinCambios).toBe(1);
    expect(plan.vinculos).toEqual([]);
    expect(motivos(plan)).toEqual(["Repetido en el archivo"]);
  });

  it("uuid en otra campaña no se incluye", () => {
    const l = loc({ campanaId: 2, campanaNombre: "Febrero" });
    expect(motivos(clasificar(paq([rem()]), base({ depositos: [l] }), GER))).toEqual(["Está en tu campaña Febrero"]);
  });

  it("eliminado aquí no se recrea", () => {
    const plan = clasificar(paq([rem()]), base({ eliminados: new Set(["r1"]) }), GER);
    expect(plan.nuevos).toEqual([]);
    expect(motivos(plan)).toEqual(["Lo eliminaste en tu app"]);
  });

  it("depósito vinculado se reconoce por equivalencia", () => {
    const d = rem({ uuid: "r9", montoBs: "2000", actualizadoEn: "2026-03-05T10:00:00.000Z" });
    const l = loc({ id: 7, uuid: "mio", actualizadoEn: "2026-02-28T10:00:00.000Z" });
    const plan = clasificar(paq([d]), base({ depositos: [l], equivalenciasDepositos: new Map([["r9", 7]]) }), GER);
    expect(plan.correcciones.map((c) => c.local.id)).toEqual([7]);
  });

  it("se reconoce por sus equivalentes (el uuid mío o uno vinculado) y recuerda el vínculo", () => {
    const l = loc({ id: 7, uuid: "x", actualizadoEn: "2026-02-28T10:00:00.000Z" });
    const d = rem({ uuid: "y", montoBs: "2000", actualizadoEn: "2026-03-05T10:00:00.000Z", equivalentes: ["x"] });
    const plan = clasificar(paq([d]), base({ depositos: [l] }), GER);
    expect(plan.correcciones.map((c) => c.local.id)).toEqual([7]);
    expect([plan.nuevos, plan.conflictos, plan.vinculos]).toEqual([[], [], []]);
    expect(plan.equivalencias).toEqual([{ remotoUuid: "y", localId: 7 }]);
    // por una equivalencia que ya tenía con otro uuid de la otra app
    const z = rem({ uuid: "y", referencia: "222", equivalentes: ["z"] });
    const porZ = clasificar(paq([z]), base({ depositos: [loc({ id: 7, uuid: "x", referencia: "222" })], equivalenciasDepositos: new Map([["z", 7]]) }), GER);
    expect(porZ.sinCambios).toBe(1);
    expect(porZ.equivalencias).toEqual([{ remotoUuid: "y", localId: 7 }]);
    // el uuid propio gana y no hace falta recordar nada
    const propio = clasificar(paq([rem({ equivalentes: ["x"] })]), base({ depositos: [loc(), loc({ id: 7, uuid: "x", referencia: "999" })] }), GER);
    expect(propio.sinCambios).toBe(1);
    expect(propio.equivalencias).toEqual([]);
  });

  it("un equivalente que eliminé aquí no se recrea", () => {
    const d = rem({ uuid: "y", equivalentes: ["x"] });
    expect(motivos(clasificar(paq([d]), base({ eliminados: new Set(["x"]) }), GER))).toEqual(["Lo eliminaste en tu app"]);
    expect(motivos(clasificar(paq([d]), base({ equivalenciasDepositos: new Map([["x", 99]]) }), GER))).toEqual(["Lo eliminaste en tu app"]);
  });

  it("el reemplazo de un depósito que el archivo elimina entra como nuevo, no como duplicado", () => {
    // En la otra app se quedaron con x2 y borraron x (pantalla de duplicados); aquí está x.
    const x = loc({ id: 7, uuid: "x" });
    const x2 = rem({ uuid: "x2", montoBs: "1001" });
    const eliminaciones = [{ uuid: "x", asignacionUuid: "ra", eliminadoEn: "2026-03-05T00:00:00.000Z" }];
    const plan = clasificar(paq([x2], { eliminaciones }), base({ depositos: [x] }), GER);
    expect(plan.nuevos.map((n) => n.remoto.uuid)).toEqual(["x2"]);
    expect(plan.eliminaciones).toEqual([{ remotoUuid: "x", local: x }]);
    expect([plan.conflictos, plan.vinculos, plan.noIncluidos]).toEqual([[], [], []]);
    // igual para una corrección que toma su banco y referencia
    const otro = loc({ id: 8, uuid: "r8", referencia: "888", actualizadoEn: "2026-02-28T10:00:00.000Z" });
    const corr = rem({ uuid: "r8", referencia: "111", actualizadoEn: "2026-03-05T10:00:00.000Z" });
    const plan2 = clasificar(paq([corr], { eliminaciones }), base({ depositos: [x, otro] }), GER);
    expect(plan2.correcciones.map((c) => c.local.id)).toEqual([8]);
    expect(plan2.noIncluidos).toEqual([]);
    // una eliminación de un gerente no emparejado no libera nada
    const ajena = [{ uuid: "x", asignacionUuid: "rc", eliminadoEn: "2026-03-05T00:00:00.000Z" }];
    expect(clasificar(paq([x2], { eliminaciones: ajena }), base({ depositos: [x] }), GER).conflictos.map((c) => c.tipo)).toEqual(["duplicado"]);
  });

  it("eliminación remota se resuelve por equivalencia", () => {
    const l7 = loc({ id: 7, uuid: "mio" });
    const lOtra = loc({ id: 8, uuid: "r8", campanaId: 2, campanaNombre: "Febrero" });
    const eliminaciones = [
      { uuid: "r9", asignacionUuid: "ra", eliminadoEn: "2026-03-05T00:00:00.000Z" },
      { uuid: "r8", asignacionUuid: "ra", eliminadoEn: "2026-03-05T00:00:00.000Z" },
      { uuid: "nada", asignacionUuid: "ra", eliminadoEn: "2026-03-05T00:00:00.000Z" },
    ];
    const plan = clasificar(paq([], { eliminaciones }), base({ depositos: [l7, lOtra], equivalenciasDepositos: new Map([["r9", 7]]) }), GER);
    expect(plan.eliminaciones).toEqual([{ remotoUuid: "r9", local: l7 }]);
  });

  it("eliminación de un gerente no emparejado no se ofrece", () => {
    const l = loc({ uuid: "r7", referencia: "777" });
    const eliminaciones = ["rc", "zz"].map((asignacionUuid) => ({ uuid: "r7", asignacionUuid, eliminadoEn: "2026-03-05T00:00:00.000Z" }));
    const sinDecidir = { ...GER, rc: { asignacionId: undefined, estado: "varios" as const } };
    expect(clasificar(paq([], { eliminaciones }), base({ depositos: [l] }), GER).eliminaciones).toEqual([]);
    expect(clasificar(paq([], { eliminaciones }), base({ depositos: [l] }), sinDecidir).eliminaciones).toEqual([]);
  });

  it("saldo distinto", () => {
    const p = paq([]);
    p.asignaciones[0].saldoUsd = "120";
    p.asignaciones[1].saldoUsd = "50.00";
    expect(clasificar(p, base(), GER).saldos).toEqual([{ asignacionId: 10, gerenteNombre: "José Pérez", local: "100", archivo: "120" }]);
  });
});

describe("decisiones y motivoPendiente", () => {
  const conPendientes = () => {
    const depositosArchivo = [
      rem({ uuid: "r9", montoBs: "5" }),
      rem({ uuid: "r2", referencia: "222", montoBs: "9", actualizadoEn: "2026-03-05T10:00:00.000Z" }),
      rem({ uuid: "r5", referencia: "555" }), // nuevo: trae la tasa distinta
    ];
    const p = paq(depositosArchivo, {
      tasas: [{ fecha: "2026-03-04", valor: "40" }],
      eliminaciones: [{ uuid: "r7", asignacionUuid: "ra", eliminadoEn: "2026-03-05T00:00:00.000Z" }],
    });
    p.asignaciones[0].saldoUsd = "120";
    const depositos = [
      loc({ uuid: "otro" }),
      loc({ id: 2, uuid: "r2", referencia: "222", actualizadoEn: "2026-03-02T10:00:00.000Z" }),
      loc({ id: 3, uuid: "r7", referencia: "777" }),
    ];
    return clasificar(p, base({ depositos }), GER);
  };

  it("decisionesIniciales", () => {
    const plan = conPendientes();
    expect(plan.conflictos.map((c) => c.tipo).sort()).toEqual(["duplicado", "editadoEnAmbas"]);
    const d = decisionesIniciales(plan);
    expect(d).toEqual({ tasas: {}, saldos: { 10: "mia" }, conflictos: { r9: "mia", r2: "archivo" }, eliminar: new Set(["r7"]), jefes: {} });
  });

  it("motivoPendiente en orden", () => {
    const plan = conPendientes();
    const d = decisionesIniciales(plan);
    const cerrada = { ...plan, campana: { ...plan.campana, estado: "cerrada" as const } };
    const sinDecidir = { ...GER, rc: { asignacionId: undefined, estado: "varios" as const } };
    expect(motivoPendiente(cerrada, sinDecidir, d)).toBe(MOTIVO_CERRADA);
    // el nombre sale de un depósito del archivo de ese gerente
    const conC = clasificar(paq([rem({ uuid: "c1", referencia: "555", asignacionUuid: "rc" })]), base(), sinDecidir);
    expect(motivoPendiente(conC, sinDecidir, decisionesIniciales(conC))).toBe("Indica quién es Carlos en tu campaña");
    // dos gerentes del archivo en el mismo de tu campaña (antes que la tasa)
    const repetido = { ...GER, rb: { asignacionId: 10, estado: "elegido" as const } };
    expect(motivoPendiente(plan, repetido, d, { ra: "José Pérez", rb: "Ana" })).toBe("José Pérez y Ana no pueden ser el mismo gerente de tu campaña");
    expect(motivoPendiente(plan, repetido, d)).toBe("Dos gerentes del archivo no pueden ser el mismo de tu campaña");
    expect(motivoPendiente(plan, GER, d)).toBe("Elige la tasa del 04/03/2026");
    expect(motivoPendiente(plan, GER, { ...d, tasas: { "2026-03-04": "mia" } })).toBeNull();
    const vacio = clasificar(paq([rem()]), base({ depositos: [loc()] }), GER);
    expect(motivoPendiente(vacio, GER, decisionesIniciales(vacio))).toBe("No hay nada nuevo para consolidar");
    const elim = [{ uuid: "r7", asignacionUuid: "ra", eliminadoEn: "2026-03-05T00:00:00.000Z" }];
    const soloEliminacion = clasificar(paq([], { eliminaciones: elim }), base({ depositos: [loc({ id: 3, uuid: "r7", referencia: "777" })] }), GER);
    const dElim = decisionesIniciales(soloEliminacion);
    expect(motivoPendiente(soloEliminacion, GER, dElim)).toBeNull();
    expect(motivoPendiente(soloEliminacion, GER, { ...dElim, eliminar: new Set() })).toBe("No hay nada nuevo para consolidar");
    const p = paq([]);
    p.asignaciones[0].saldoUsd = "120";
    const soloSaldo = clasificar(p, base(), GER);
    expect(motivoPendiente(soloSaldo, GER, decisionesIniciales(soloSaldo))).toBe("No hay nada nuevo para consolidar");
    expect(motivoPendiente(soloSaldo, GER, { ...decisionesIniciales(soloSaldo), saldos: { 10: "archivo" } })).toBeNull();
    // una tasa distinta elegida "archivo" es algo que consolidar
    const conTasa = clasificar(paq([rem()], { tasas: [{ fecha: "2026-03-04", valor: "40" }] }), base(), GER);
    expect(conTasa.tasasDistintas).toHaveLength(1);
    const sinNuevo = { ...conTasa, nuevos: [] };
    expect(motivoPendiente(sinNuevo, GER, { ...decisionesIniciales(sinNuevo), tasas: { "2026-03-04": "mia" } })).toBe("No hay nada nuevo para consolidar");
    expect(motivoPendiente(sinNuevo, GER, { ...decisionesIniciales(sinNuevo), tasas: { "2026-03-04": "archivo" } })).toBeNull();
  });

  it("no deja desmarcar la eliminación del depósito que otro del archivo reemplaza", () => {
    const eliminaciones = [{ uuid: "x", asignacionUuid: "ra", eliminadoEn: "2026-03-05T00:00:00.000Z" }];
    const plan = clasificar(paq([rem({ uuid: "x2" })], { eliminaciones }), base({ depositos: [loc({ id: 7, uuid: "x" })] }), GER);
    const d = decisionesIniciales(plan);
    expect(motivoPendiente(plan, GER, d)).toBeNull();
    expect(motivoPendiente(plan, GER, { ...d, eliminar: new Set() })).toBe(
      "Banesco 111 del archivo reemplaza a uno que el archivo elimina: marca esa eliminación para consolidar",
    );
  });
});

describe("jefes del archivo", () => {
  const asig = (id: number, nombre: string, jefeId: number | null = null): AsignacionLocal => ({ ...asigLocal(id, nombre, "0"), jefeId });
  const jefe = (asignacionUuid: string, gerenteUuid = `x-${asignacionUuid}`): JefePaquete => ({ asignacionUuid, gerente: { uuid: gerenteUuid, nombre: "?" } });
  const remA = (uuid: string, nombre: string, j?: JefePaquete | null): AsignacionPaquete => ({
    uuid, gerente: { uuid: `r-${uuid}`, nombre }, saldoUsd: "0", desde: null, ...(j === undefined ? {} : { jefe: j }),
  });
  const ger = (pares: [string, number][]): Record<string, GerenteEmparejado> =>
    Object.fromEntries(pares.map(([uuid, asignacionId]) => [uuid, { asignacionId, estado: "recordado" as const }]));
  const planDe = (remotas: AsignacionPaquete[], locales: AsignacionLocal[], g: Record<string, GerenteEmparejado>, o: Partial<LocalConsolidar> = {}) =>
    clasificar(paq([], { asignaciones: remotas }), base({ asignaciones: locales, ...o }), g);
  const fila = (asignacionId: number, gerenteNombre: string, local: number | null, archivo: number | null, automatico: boolean, o = {}) => ({
    asignacionId, gerenteNombre, local, archivo, automatico, bloqueo: null, debajo: 0, ...o,
  });

  it("sin jefe aquí toma el del archivo en automático; distinto va a Jefe distinto con 'mía' por defecto", () => {
    const locales = [asig(20, "Karla"), asig(21, "Juan"), asig(22, "Pedro"), asig(23, "María", 20)];
    const remotas = [remA("rK", "Karla", null), remA("rJ", "Juan", null), remA("rP", "Pedro", jefe("rJ")), remA("rM", "María", jefe("rJ"))];
    const g = ger([["rK", 20], ["rJ", 21], ["rP", 22], ["rM", 23]]);
    const plan = planDe(remotas, locales, g);
    expect(plan.jefes).toEqual([fila(22, "Pedro", null, 21, true), fila(23, "María", 20, 21, false)]);
    const d = decisionesIniciales(plan);
    expect(d.jefes).toEqual({ 23: "mia" });
    expect([...jefesFinales(plan, d)]).toEqual([[20, null], [21, null], [22, 21], [23, 20]]);
    expect(jefesFinales(plan, { ...d, jefes: { 23: "archivo" } }).get(23)).toBe(21);
    expect(motivoPendiente(plan, g, d)).toBeNull();
    // solo el distinto con "mía" no es nada que consolidar; con "archivo", sí
    const soloDistinto = planDe([remA("rM", "María", jefe("rJ")), remA("rJ", "Juan", null)], locales, g);
    expect(motivoPendiente(soloDistinto, g, decisionesIniciales(soloDistinto))).toBe("No hay nada nuevo para consolidar");
    expect(motivoPendiente(soloDistinto, g, { ...decisionesIniciales(soloDistinto), jefes: { 23: "archivo" } })).toBeNull();
  });

  it("archivo viejo (jefe undefined) no genera filas; archivo con jefe null y local con jefe sí", () => {
    const locales = [asig(20, "Karla"), asig(22, "Pedro", 20)];
    const g = ger([["rP", 22]]);
    expect(planDe([remA("rP", "Pedro")], locales, g).jefes).toEqual([]);
    expect(planDe([remA("rP", "Pedro", null)], locales, g).jefes).toEqual([fila(22, "Pedro", 20, null, false)]);
  });

  it("jefe fuera del archivo se resuelve por el gerente (uuid o equivalencia); si no se encuentra, no hay fila", () => {
    const locales = [asig(21, "Juan"), asig(22, "Pedro")];
    const g = ger([["rP", 22]]);
    const gerentes = [{ id: 21, uuid: "g21", nombre: "Juan" }, { id: 22, uuid: "g22", nombre: "Pedro" }, { id: 30, uuid: "g30", nombre: "Fuera" }];
    const o = { gerentes, equivalenciasGerentes: new Map([["remJ", 21]]) };
    const archivo = (j: JefePaquete) => planDe([remA("rP", "Pedro", j)], locales, g, o).jefes.map((f) => f.archivo);
    expect(archivo(jefe("l21"))).toEqual([21]); // la asignación local con ese uuid
    expect(archivo(jefe("zz", "g21"))).toEqual([21]); // el gerente con ese uuid
    expect(archivo(jefe("zz", "remJ"))).toEqual([21]); // el gerente recordado
    expect(archivo(jefe("zz", "nadie"))).toEqual([]);
    expect(archivo(jefe("zz", "g30"))).toEqual([]); // conocido, pero sin asignación en la campaña
  });

  it("un automático que cierra un ciclo pasa a Jefe distinto bloqueado", () => {
    // local: B bajo A; archivo: A bajo B
    const locales = [asig(30, "A"), asig(31, "B", 30)];
    const g = ger([["rA", 30], ["rB", 31]]);
    const plan = planDe([remA("rA", "A", jefe("rB")), remA("rB", "B", null)], locales, g);
    expect(plan.jefes).toEqual([
      fila(30, "A", null, 31, false, { bloqueo: "Quedaría debajo de sí mismo", debajo: 1 }),
      fila(31, "B", 30, null, false),
    ]);
    const d = decisionesIniciales(plan);
    expect(d.jefes).toEqual({ 30: "mia", 31: "mia" });
    expect(jefesFinales(plan, { ...d, jefes: { 30: "archivo" } }).get(30)).toBeNull();
    expect(motivoPendiente(plan, g, { ...d, jefes: { 30: "archivo", 31: "archivo" } })).toBeNull();
  });

  it("dos elecciones archivo que juntas forman ciclo bloquean con motivo", () => {
    // local: A bajo X, B bajo Y; archivo: A bajo B, B bajo A. Cada una sola es válida; las dos → motivoPendiente
    const locales = [asig(40, "X"), asig(41, "Y"), asig(42, "A", 40), asig(43, "B", 41)];
    const g = ger([["rA", 42], ["rB", 43]]);
    const plan = planDe([remA("rA", "A", jefe("rB")), remA("rB", "B", jefe("rA"))], locales, g);
    expect(plan.jefes.map((f) => [f.asignacionId, f.automatico, f.bloqueo])).toEqual([[42, false, null], [43, false, null]]);
    const d = decisionesIniciales(plan);
    expect(motivoPendiente(plan, g, { ...d, jefes: { 42: "archivo" } })).toBeNull();
    expect(motivoPendiente(plan, g, { ...d, jefes: { 43: "archivo" } })).toBeNull();
    expect(motivoPendiente(plan, g, { ...d, jefes: { 42: "archivo", 43: "archivo" } })).toMatch(/quedarían uno debajo del otro/);
    expect(motivoPendiente(plan, g, { ...d, jefes: { 42: "archivo", 43: "archivo" } })).toBe(
      "A y B quedarían uno debajo del otro: cambia la elección de su jefe",
    );
  });

  it("agruparJefes agrupa por (mío → archivo)", () => {
    const locales = [asig(20, "Karla"), asig(21, "Juan"), asig(22, "P1", 20), asig(23, "P2", 20), asig(24, "P3", 21)];
    const g = ger([["rJ", 21], ["rP1", 22], ["rP2", 23], ["rP3", 24]]);
    const remotas = [remA("rJ", "Juan", null), remA("rP1", "P1", jefe("rJ")), remA("rP3", "P3", null), remA("rP2", "P2", jefe("rJ"))];
    const plan = planDe(remotas, locales, g);
    const nombreDe = (id: number) => locales.find((a) => a.id === id)?.gerenteNombre ?? "";
    expect(agruparJefes(plan, nombreDe).map((x) => [x.desde, x.hacia, x.filas.length])).toEqual([["Karla", "Juan", 2], ["Juan", "sin jefe", 1]]);
  });
});
