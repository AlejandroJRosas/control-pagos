import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { aplicarEdicion, camposFaltantes, nombreDesdeArchivo, parseCuadroPagos, parseLibro } from "./cuadroPagos";
import { buildCampanaWorkbook, buildGerenteWorkbook } from "@/export/campanaWorkbook";
import { buildCampanaView, type DepositoData } from "@/domain/campanaView";
import type { Campana } from "@/db/repos/campanas";

/** Imita la hoja "CUADRO DE PAGOS " de las facturas por gerente (celdas combinadas, fórmulas con resultado). */
function libro(filas: (ExcelJS.CellValue | undefined)[][] = []): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("FACT").getCell("C7").value = "OTRA COSA";
  const ws = wb.addWorksheet("CUADRO DE PAGOS ");
  ws.getCell("B12").value = "NOMBRE Y APELLIDO:";
  ws.getCell("C12").value = "ROSMARY MADERO ";
  ws.mergeCells("C12:I12");
  ws.getCell("B18").value = "SALDO INICIAL ";
  ws.mergeCells("B18:J18");
  ws.getCell("K18").value = { formula: "FACT!E92", result: 5179.999999999999 };
  ws.getRow(22).values = [
    undefined,
    "NOMBRE GERENTE ",
    "FECHA DEPOSITO",
    "NOMBRE DEL  BANCO DESTINO/ DIVISAS / ZELLE",
    "REFERENCIA BANCARIA",
    "CUENTA DESTINO VALIDA",
    "Bs.",
    "TASA DEL DIA   VIGENTE",
    "$",
    "SALDO ",
    "OBSERVACION ",
  ];
  filas.forEach((f, i) => {
    ws.getRow(23 + i).values = [undefined, 0, ...f];
  });
  return wb;
}

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("parseCuadroPagos", () => {
  it("lee gerente, saldo inicial y depósitos", () => {
    const r = parseCuadroPagos(
      libro([
        [d("2026-10-06"), "VENEZUELA", 59131679150, "INV. HERMANOS JD", 30533.65, 872.39, { formula: "G23/H23", result: 35 }, 5145, " ok "],
        [d("2026-10-14"), "VENEZUELA", 59130700019, "MA COLECCIONES 2006", 50918.2, 877.9],
        [undefined, undefined, undefined, undefined, undefined, undefined, { formula: "G25/H25", result: "0" }, 5087],
      ]),
    );
    expect(r).toMatchObject({ hoja: "CUADRO DE PAGOS ", gerenteNombre: "ROSMARY MADERO", saldoInicial: "5180" });
    expect(r.filas).toEqual([
      {
        fila: 23,
        fecha: "2026-10-06",
        banco: "VENEZUELA",
        referencia: "59131679150",
        cuentaDestino: "INV. HERMANOS JD",
        montoBs: "30533.65",
        tasa: "872.39",
        observaciones: "ok",
        problemas: [],
      },
      {
        fila: 24,
        fecha: "2026-10-14",
        banco: "VENEZUELA",
        referencia: "59130700019",
        cuentaDestino: "MA COLECCIONES 2006",
        montoBs: "50918.2",
        tasa: "877.9",
        observaciones: null,
        problemas: [],
      },
    ]);
  });

  it("acepta montos, tasas y fechas escritos como texto en formato venezolano", () => {
    const r = parseCuadroPagos(libro([["06/10/2026", "Banesco", "0012", "Cta", "1.234,50", "36.500", undefined, undefined, undefined]]));
    expect(r.filas[0]).toMatchObject({ fecha: "2026-10-06", referencia: "0012", montoBs: "1234.5", tasa: "36.5", problemas: [] });
  });

  it("acepta fechas como número de serie de Excel", () => {
    const r = parseCuadroPagos(libro([[46301, "B", "1", "C", 10, 2]]));
    expect(r.filas[0].fecha).toBe("2026-10-06");
  });

  it("marca los problemas de cada fila sin descartarla", () => {
    const r = parseCuadroPagos(libro([["31/02/2026", "", "", "", "abc", undefined]]));
    expect(r.filas[0].problemas).toEqual([
      "Fecha inválida",
      "Falta el banco",
      "Falta la referencia",
      "Falta la cuenta destino",
      "Monto en Bs inválido",
      "Falta la tasa",
    ]);
  });

  it("ignora filas de totales", () => {
    const r = parseCuadroPagos(libro([[undefined, "TOTAL", undefined, undefined, 1000, undefined]]));
    expect(r.filas).toEqual([]);
  });

  it("falla con un mensaje claro si no encuentra el cuadro", () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Hoja1").getCell("A1").value = "nada";
    expect(() => parseCuadroPagos(wb)).toThrow(/CUADRO DE PAGOS/);
  });

  it("sin nombre en la hoja, lo toma del nombre del archivo", () => {
    const wb = libro();
    wb.getWorksheet("CUADRO DE PAGOS ")!.getCell("C12").value = null;
    expect(parseCuadroPagos(wb, "FACTURA C3 - 2026 - ROSMARY MADERO.xlsx").gerenteNombre).toBe("ROSMARY MADERO");
  });
});

describe("aplicarEdicion", () => {
  const incompleta = () => parseCuadroPagos(libro([["31/02/2026", "", "", "", "abc", "x"]])).filas[0];

  it("sin edición devuelve la fila tal cual", () => {
    const f = incompleta();
    expect(aplicarEdicion(f, undefined)).toBe(f);
  });

  it("completa los datos escritos y quita sus problemas", () => {
    const r = aplicarEdicion(incompleta(), {
      fecha: "2026-03-02",
      banco: " Venezuela ",
      referencia: "111",
      cuentaDestino: "Inv. JD",
      montoBs: "1.234,50",
      tasa: "36,5",
    });
    expect(r).toMatchObject({ fecha: "2026-03-02", banco: "Venezuela", referencia: "111", montoBs: "1234.5", tasa: "36.5", problemas: [] });
  });

  it("sigue marcando lo que no se corrigió o se escribió mal", () => {
    const r = aplicarEdicion(incompleta(), { banco: "Venezuela", montoBs: "0", tasa: "" });
    expect(r.problemas).toEqual(["Fecha inválida", "Falta la referencia", "Falta la cuenta destino", "Monto en Bs inválido", "Falta la tasa"]);
    expect(aplicarEdicion(incompleta(), {}).problemas).toContain("Tasa inválida");
  });
});

describe("camposFaltantes", () => {
  it("indica los campos que faltan o vienen mal", () => {
    const f = parseCuadroPagos(libro([[d("2026-03-02"), "Venezuela", "", "Inv. JD", 730, undefined]])).filas[0];
    expect(camposFaltantes(f)).toEqual(["referencia", "tasa"]);
  });
});

describe("nombreDesdeArchivo", () => {
  it("toma el último tramo separado por guiones", () => {
    expect(nombreDesdeArchivo("FACTURA C3 - 2026 - ROSMARY MADERO.xlsx")).toBe("ROSMARY MADERO");
    expect(nombreDesdeArchivo("pagos.xlsx")).toBeNull();
  });
});

describe("parseLibro con un Excel exportado por la app", () => {
  const campana: Campana = { id: 1, nombre: "Marzo", fechaInicio: "2026-03-01", fechaFin: null, estado: "activa", notas: null, creadoEn: "x" };
  const dep = (id: number, asignacionId: number, montoBs: string, observaciones: string | null = null): DepositoData => ({
    id,
    asignacionId,
    fecha: "2026-03-0" + id,
    creadoEn: `2026-01-01T00:00:0${id}.000Z`,
    banco: "Banesco",
    referencia: `00${id}`,
    cuentaDestino: "0102 Inv. JD",
    montoBs,
    tasaId: 1,
    tasaValor: "36.1234",
    observaciones,
    imagenPath: id === 1 ? "imagenes/abc.png" : null,
  });
  const view = buildCampanaView(
    [
      { id: 1, gerenteId: 1, gerenteNombre: "Ana Pérez", saldoUsd: "1234.56" },
      { id: 2, gerenteId: 2, gerenteNombre: "Luis Gómez de la Torre Hernández", saldoUsd: "50" },
      { id: 3, gerenteId: 3, gerenteNombre: "Sin Depósitos", saldoUsd: "10" },
    ],
    [dep(1, 1, "90000.543", "primer pago"), dep(2, 1, "1000"), dep(3, 2, "730.5")],
  );

  async function roundTrip(wb: ExcelJS.Workbook): Promise<ExcelJS.Workbook> {
    const out = new ExcelJS.Workbook();
    await out.xlsx.load(await wb.xlsx.writeBuffer());
    return out;
  }

  it("de la campaña: un cuadro por gerente con su asignado y todos sus depósitos", async () => {
    const r = parseLibro(await roundTrip(buildCampanaWorkbook(campana, view)), "marzo-2026-03-10.xlsx");
    expect(r.map((c) => [c.gerenteNombre, c.saldoInicial, c.filas.length])).toEqual([
      ["Ana Pérez", "1234.56", 2],
      ["Luis Gómez de la Torre Hernández", "50", 1],
      ["Sin Depósitos", "10", 0],
    ]);
    expect(r[0].filas[0]).toEqual({
      fila: 6,
      fecha: "2026-03-01",
      banco: "Banesco",
      referencia: "001",
      cuentaDestino: "0102 Inv. JD",
      montoBs: "90000.543",
      tasa: "36.1234",
      observaciones: "primer pago",
      problemas: [],
    });
  });

  it("de un solo gerente", async () => {
    const r = parseLibro(await roundTrip(buildGerenteWorkbook(campana, view, 2)), "luis-2026-03-10.xlsx");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ gerenteNombre: "Luis Gómez de la Torre Hernández", saldoInicial: "50" });
    expect(r[0].filas.map((f) => [f.referencia, f.montoBs, f.tasa])).toEqual([["003", "730.5", "36.1234"]]);
  });

  it("una factura con CUADRO DE PAGOS sigue dando un solo cuadro", () => {
    const r = parseLibro(libro([[d("2026-10-06"), "VENEZUELA", 1, "C", 10, 2]]));
    expect(r).toHaveLength(1);
    expect(r[0].gerenteNombre).toBe("ROSMARY MADERO");
  });
});
