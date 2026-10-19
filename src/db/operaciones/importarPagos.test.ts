import { beforeEach, describe, expect, it } from "vitest";
import type { SqlDriver } from "../driver";
import { createTestDb } from "../testing/sqljsDriver";
import { depositoBase, seedBasico } from "../testing/fixtures";
import { createGerente, listGerentes } from "../repos/gerentes";
import { createTasa, listTasas } from "../repos/tasas";
import { createDeposito } from "../repos/depositos";
import { getAsignacion } from "../repos/asignaciones";
import { loadCampanaData } from "../queries/campanaData";
import { buildCampanaView } from "@/domain/campanaView";
import type { CuadroPagos, FilaCuadro } from "@/import/cuadroPagos";
import { importarPagos, planificarImportacion } from "./importarPagos";
import { createFeriado } from "../repos/feriados";

let db: SqlDriver;
let s: Awaited<ReturnType<typeof seedBasico>>;
beforeEach(async () => {
  db = await createTestDb();
  s = await seedBasico(db); // Ana en "Marzo" con saldo 100; tasa 2026-03-02 = 36.5
});

const fila = (o: Partial<FilaCuadro> = {}): FilaCuadro => ({
  fila: 23,
  fecha: "2026-03-02",
  banco: "Venezuela",
  referencia: "111",
  cuentaDestino: "Inv. JD",
  montoBs: "730",
  tasa: "36.5",
  observaciones: null,
  problemas: [],
  ...o,
});
const cuadro = (o: Partial<CuadroPagos> = {}): CuadroPagos => ({ hoja: "CUADRO DE PAGOS", gerenteNombre: "Beto", saldoInicial: "5180", filas: [], ...o });
const contar = async (tabla: string) => (await db.select<{ n: number }>(`SELECT COUNT(*) AS n FROM ${tabla}`))[0].n;

describe("planificarImportacion", () => {
  it("sugiere el gerente de la campaña con el mismo nombre (sin mayúsculas ni acentos)", async () => {
    const p = await planificarImportacion(db, s.campanaId, cuadro({ gerenteNombre: "ÁNA" }));
    expect(p.destino).toEqual({ sel: `a:${s.asignacionId}`, nombre: "", saldo: "" });
  });

  it("sugiere agregar a la campaña un gerente existente con el saldo inicial del Excel", async () => {
    const beto = await createGerente(db, { nombre: "Beto", telefono: null });
    const p = await planificarImportacion(db, s.campanaId, cuadro());
    expect(p.destino).toEqual({ sel: `g:${beto}`, nombre: "", saldo: "5.180,00" });
  });

  it("sugiere crear el gerente si no existe", async () => {
    const p = await planificarImportacion(db, s.campanaId, cuadro({ gerenteNombre: "Rosmary Madero", saldoInicial: null }));
    expect(p.destino).toEqual({ sel: "nuevo", nombre: "Rosmary Madero", saldo: "" });
  });

  it("clasifica tasas, duplicados y problemas, y desmarca lo dudoso", async () => {
    await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { banco: "VENEZUELA ", referencia: "999" }));
    const p = await planificarImportacion(
      db,
      s.campanaId,
      cuadro({
        filas: [
          fila({ fila: 23 }), // tasa existente igual
          fila({ fila: 24, fecha: "2026-03-03", tasa: "37", referencia: "222" }), // tasa nueva
          fila({ fila: 25, tasa: "40", referencia: "333" }), // tasa distinta a la registrada
          fila({ fila: 26, fecha: "2026-03-03", tasa: "38", referencia: "444" }), // distinta a la nueva de la fila 24
          fila({ fila: 27, referencia: "999" }), // duplicado en BD
          fila({ fila: 28, referencia: "111" }), // repetida en el archivo
          fila({ fila: 29, referencia: "", problemas: ["Falta la referencia"] }),
        ],
      }),
    );
    const r = (n: number) => p.filas.find((f) => f.fila === n)!;
    expect(r(23)).toMatchObject({ estadoTasa: "existente", tasaAplicada: "36.5", usd: "20.00", importable: true, marcada: true });
    expect(r(24)).toMatchObject({ estadoTasa: "nueva", tasaAplicada: "37", marcada: true });
    expect(r(25)).toMatchObject({ estadoTasa: "distinta", tasaAplicada: "36.5", usd: "20.00", importable: true, marcada: false });
    expect(r(26)).toMatchObject({ estadoTasa: "distinta", tasaAplicada: "37", marcada: false });
    expect(r(27).duplicados).toHaveLength(1);
    expect(r(27).marcada).toBe(false);
    expect(r(28)).toMatchObject({ repetidaEnArchivo: 23, marcada: false });
    expect(r(29)).toMatchObject({ importable: false, marcada: false, usd: "20.00" });
  });

  it("los sábados y domingos se comparan con la tasa del viernes", async () => {
    await createTasa(db, { fecha: "2026-03-06", valor: "40", notas: null, imagenPath: null });
    const p = await planificarImportacion(
      db,
      s.campanaId,
      cuadro({
        filas: [
          fila({ fila: 23, fecha: "2026-03-07", tasa: "40", montoBs: "400" }), // sábado: la del viernes registrada
          fila({ fila: 24, fecha: "2026-03-14", tasa: "41", referencia: "2" }), // sábado sin viernes: nueva
          fila({ fila: 25, fecha: "2026-03-15", tasa: "42", referencia: "3" }), // domingo: distinta a la de la fila 24
        ],
      }),
    );
    expect(p.filas.map((f) => [f.estadoTasa, f.tasaAplicada])).toEqual([
      ["existente", "40"],
      ["nueva", "41"],
      ["distinta", "41"],
    ]);
  });

  it("si el Excel no trae la tasa, usa la registrada en la app", async () => {
    const p = await planificarImportacion(
      db,
      s.campanaId,
      cuadro({
        filas: [
          fila({ fila: 23, tasa: null, problemas: ["Falta la tasa"] }),
          fila({ fila: 24, tasa: null, referencia: "2", problemas: ["Tasa inválida"] }),
        ],
      }),
    );
    for (const f of p.filas) {
      expect(f).toMatchObject({ estadoTasa: "registrada", tasaAplicada: "36.5", usd: "20.00", problemas: [], importable: true, marcada: true });
      expect(f.editables).toEqual([]);
    }
  });

  it("sin tasa en el Excel ni en la app, usa la de otra fila del mismo día o deja escribirla", async () => {
    const p = await planificarImportacion(
      db,
      s.campanaId,
      cuadro({
        filas: [
          fila({ fila: 23, fecha: "2026-03-03", tasa: "37" }),
          fila({ fila: 24, fecha: "2026-03-03", tasa: null, referencia: "2", problemas: ["Falta la tasa"] }),
          fila({ fila: 25, fecha: "2026-03-04", tasa: null, referencia: "3", problemas: ["Falta la tasa"] }),
        ],
      }),
    );
    const r = (n: number) => p.filas.find((f) => f.fila === n)!;
    expect(r(24)).toMatchObject({ estadoTasa: "nueva", tasaAplicada: "37", importable: true, editables: ["tasa"] });
    expect(r(25)).toMatchObject({ estadoTasa: null, tasaAplicada: null, importable: false, marcada: false, editables: ["tasa"] });
  });

  it("aplica lo que el usuario completó y vuelve a revisar la fila", async () => {
    const incompleta = fila({ fila: 23, fecha: null, banco: "", tasa: null, problemas: ["Fecha inválida", "Falta el banco", "Falta la tasa"] });
    const sin = await planificarImportacion(db, s.campanaId, cuadro({ filas: [incompleta] }));
    expect(sin.filas[0]).toMatchObject({ importable: false, editada: false, editables: ["fecha", "banco", "tasa"] });

    const ediciones = new Map([[23, { fecha: "2026-03-02", banco: "Venezuela" }]]);
    const con = await planificarImportacion(db, s.campanaId, cuadro({ filas: [incompleta] }), ediciones);
    expect(con.filas[0]).toMatchObject({
      fecha: "2026-03-02",
      banco: "Venezuela",
      estadoTasa: "registrada",
      tasaAplicada: "36.5",
      problemas: [],
      importable: true,
      marcada: true,
      editada: true,
      editables: ["fecha", "banco"],
    });

    const nueva = await planificarImportacion(db, s.campanaId, cuadro({ filas: [incompleta] }), new Map([[23, { fecha: "2026-03-04", banco: "V", tasa: "38,5" }]]));
    expect(nueva.filas[0]).toMatchObject({ estadoTasa: "nueva", tasaAplicada: "38.5", importable: true, editables: ["fecha", "banco", "tasa"] });
  });
});

describe("importarPagos", () => {
  it("registra la tasa de un sábado o domingo en su viernes", async () => {
    const r = await importarPagos(db, s.campanaId, {
      destino: { kind: "asignacion", asignacionId: s.asignacionId },
      saldoUsd: null,
      filas: [fila({ fecha: "2026-03-14", tasa: "41" }), fila({ fecha: "2026-03-15", tasa: "41", referencia: "2" })],
    });
    expect(r).toMatchObject({ depositos: 2, tasasCreadas: 1 });
    expect((await listTasas(db)).map((t) => [t.fecha, t.valor, t.usos])).toEqual([
      ["2026-03-13", "41", 2],
      ["2026-03-02", "36.5", 0],
    ]);
  });

  it("crea gerente, asignación, tasas que falten y depósitos", async () => {
    const r = await importarPagos(db, s.campanaId, {
      destino: { kind: "nuevo", nombre: "Rosmary Madero", saldoUsd: "5180" },
      saldoUsd: null,
      filas: [fila(), fila({ fecha: "2026-03-03", tasa: "40", referencia: "222", montoBs: "400", observaciones: "x" })],
    });
    expect(r).toMatchObject({ depositos: 2, tasasCreadas: 1 });
    expect((await listTasas(db)).map((t) => [t.fecha, t.valor])).toEqual([
      ["2026-03-03", "40"],
      ["2026-03-02", "36.5"],
    ]);
    const d = await loadCampanaData(db, s.campanaId);
    const g = buildCampanaView(d.asignaciones, d.depositos).gerentes.find((x) => x.asignacionId === r.asignacionId)!;
    expect(g).toMatchObject({ gerenteNombre: "Rosmary Madero", asignado: "5180.00", pagado: "30.00", cantidad: 2 });
  });

  it("puede actualizar el saldo de un gerente que ya está en la campaña", async () => {
    await importarPagos(db, s.campanaId, { destino: { kind: "asignacion", asignacionId: s.asignacionId }, saldoUsd: "250", filas: [fila()] });
    expect((await getAsignacion(db, s.asignacionId))?.saldoUsd).toBe("250");
  });

  it("una fila sin tasa usa la registrada; si no hay, no importa nada", async () => {
    const r = await importarPagos(db, s.campanaId, {
      destino: { kind: "asignacion", asignacionId: s.asignacionId },
      saldoUsd: null,
      filas: [fila({ tasa: null })],
    });
    expect(r).toMatchObject({ depositos: 1, tasasCreadas: 0 });
    await expect(
      importarPagos(db, s.campanaId, {
        destino: { kind: "nuevo", nombre: "Beto", saldoUsd: "1" },
        saldoUsd: null,
        filas: [fila({ referencia: "2" }), fila({ fila: 31, fecha: "2026-03-04", tasa: null, referencia: "3" })],
      }),
    ).rejects.toMatchObject({ code: "VALIDACION", message: expect.stringContaining("31") });
    expect(await contar("depositos")).toBe(1);
    expect(await contar("gerentes")).toBe(1);
  });

  it("no importa filas con problemas", async () => {
    await expect(
      importarPagos(db, s.campanaId, {
        destino: { kind: "nuevo", nombre: "Beto", saldoUsd: "1" },
        saldoUsd: null,
        filas: [fila(), fila({ fila: 30, problemas: ["Falta la tasa"], tasa: null })],
      }),
    ).rejects.toMatchObject({ code: "VALIDACION", message: expect.stringContaining("30") });
    expect(await contar("gerentes")).toBe(1);
  });

  it("si algo falla a mitad, deshace todo lo creado", async () => {
    let inserts = 0;
    const falla: SqlDriver = {
      select: (sql, p) => db.select(sql, p),
      execute: async (sql, p) => {
        if (sql.includes("INSERT INTO depositos") && ++inserts === 2) throw new Error("disco lleno");
        return db.execute(sql, p);
      },
    };
    await expect(
      importarPagos(falla, s.campanaId, {
        destino: { kind: "nuevo", nombre: "Beto", saldoUsd: "1" },
        saldoUsd: null,
        filas: [fila({ fecha: "2026-03-05", tasa: "40" }), fila({ referencia: "2" })],
      }),
    ).rejects.toThrow("disco lleno");
    expect(await contar("depositos")).toBe(0);
    expect(await contar("tasas")).toBe(1);
    expect((await listGerentes(db)).map((g) => g.nombre)).toEqual(["Ana"]);
  });

  it("restaura el saldo si falla después de actualizarlo", async () => {
    await createTasa(db, { fecha: "2026-03-09", valor: "1", notas: null, imagenPath: null });
    const falla: SqlDriver = {
      select: (sql, p) => db.select(sql, p),
      execute: async (sql, p) => {
        if (sql.includes("INSERT INTO depositos")) throw new Error("disco lleno");
        return db.execute(sql, p);
      },
    };
    await expect(
      importarPagos(falla, s.campanaId, {
        destino: { kind: "asignacion", asignacionId: s.asignacionId },
        saldoUsd: "999",
        filas: [fila({ fecha: "2026-03-09", tasa: "1" })],
      }),
    ).rejects.toThrow("disco lleno");
    expect((await getAsignacion(db, s.asignacionId))?.saldoUsd).toBe("100");
    expect(await contar("tasas")).toBe(2);
  });
});

describe("importarPagos con feriados", () => {
  it("una fila de un feriado crea la tasa en el día hábil anterior", async () => {
    await createFeriado(db, { fecha: "2026-03-16", nombre: null }); // lunes
    const r = await importarPagos(db, s.campanaId, {
      destino: { kind: "asignacion", asignacionId: s.asignacionId },
      saldoUsd: null,
      filas: [fila({ fecha: "2026-03-16", tasa: "41" })],
    });
    expect(r).toMatchObject({ depositos: 1, tasasCreadas: 1 });
    expect((await listTasas(db)).map((t) => t.fecha)).toContain("2026-03-13");
  });
});
