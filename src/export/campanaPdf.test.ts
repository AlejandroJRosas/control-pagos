import { describe, expect, it } from "vitest";
import type { ContextPageSize, DynamicContent } from "pdfmake/interfaces";
import { buildCampanaPdf, buildGerentePdf } from "./campanaPdf";
import { buildCampanaView, type DepositoData } from "@/domain/campanaView";
import type { Campana } from "@/db/repos/campanas";

const campana: Campana = { id: 1, nombre: "Marzo", fechaInicio: "2026-03-01", fechaFin: null, estado: "activa", notas: null, creadoEn: "x" };
const dep = (id: number, asignacionId: number, fecha: string, montoBs: string): DepositoData => ({
  id,
  asignacionId,
  fecha,
  creadoEn: `2026-01-01T00:00:0${id}.000Z`,
  banco: "Banesco",
  referencia: `00${id}`,
  cuentaDestino: "0102",
  montoBs,
  tasaId: 1,
  tasaValor: "36.5",
  observaciones: "nota interna",
  imagenPath: null,
});

const generadoEn = new Date(2026, 9, 18, 12);
const view = buildCampanaView(
  [
    { id: 1, gerenteId: 10, gerenteNombre: "Ana Peña", saldoUsd: "100" },
    { id: 2, gerenteId: 20, gerenteNombre: "Luis", saldoUsd: "50" },
  ],
  [dep(1, 1, "2026-03-02", "3650"), dep(2, 1, "2026-03-05", "1095")],
);
const dd = buildCampanaPdf(campana, view, generadoEn);

/** Todos los textos de un nodo de pdfmake, recorriéndolo entero. */
function textos(nodo: unknown): string[] {
  if (typeof nodo === "string") return [nodo];
  if (Array.isArray(nodo)) return nodo.flatMap(textos);
  if (nodo && typeof nodo === "object") return Object.values(nodo).flatMap(textos);
  return [];
}

/** Nodos que tienen la propiedad `prop` con valor `valor`, en cualquier profundidad. */
function buscar(nodo: unknown, pred: (o: Record<string, unknown>) => boolean): Record<string, unknown>[] {
  if (Array.isArray(nodo)) return nodo.flatMap((n) => buscar(n, pred));
  if (nodo && typeof nodo === "object") {
    const o = nodo as Record<string, unknown>;
    return [...(pred(o) ? [o] : []), ...Object.values(o).flatMap((n) => buscar(n, pred))];
  }
  return [];
}

const bloquesGerente = (d: typeof dd) => (d.content as unknown as Record<string, unknown>[]).filter((n) => n.pageBreak === "before");
const pagina = {} as ContextPageSize;

describe("buildCampanaPdf", () => {
  it("una página por gerente en el orden de la campaña", () => {
    const bloques = bloquesGerente(dd);
    expect(bloques).toHaveLength(2);
    expect(textos(bloques[0])).toContain("Ana Peña");
    expect(textos(bloques[1])).toContain("Luis");
  });

  it("resumen con cifras formateadas", () => {
    const t = textos(dd.content);
    for (const s of ["$ 130,00 pagado", "de $ 150,00", "Faltan", "$ 20,00", "REPORTE DE CAMPAÑA · CORTE 18/10/2026", "Ana Peña", "Total"]) {
      expect(t).toContain(s);
    }
  });

  it("gerente excedido: pagado de más y saldo en rojo", () => {
    const ana = bloquesGerente(dd)[0];
    expect(textos(ana)).toContain("Pagado de más");
    expect(textos(ana)).toContain("$ 30,00");
    expect(buscar(ana, (o) => o.text === "-30,00").every((o) => o.color === "#b91c1c")).toBe(true);
    expect(buscar(ana, (o) => o.text === "-30,00").length).toBeGreaterThan(0);
  });

  it("tabla de depósitos con cuenta destino y total, sin observaciones", () => {
    const t = textos(bloquesGerente(dd)[0]);
    for (const s of ["02/03/2026", "Banesco", "0102", "3.650,00", "36,50", "100,00", "Total (2 depósitos)", "4.745,00"]) {
      expect(t).toContain(s);
    }
    expect(textos(dd)).not.toContain("nota interna");
  });

  it("referencia y cuenta destino se parten si no caben; la cuenta va más pequeña", () => {
    const ana = bloquesGerente(dd)[0];
    const ref = buscar(ana, (o) => o.text === "001")[0];
    const cuenta = buscar(ana, (o) => o.text === "0102")[0];
    expect(ref.wordBreak).toBe("break-all");
    expect(cuenta.wordBreak).toBe("break-all");
    expect(cuenta.fontSize).toBe(7);
  });

  it("gerente al día: lo restante en verde", () => {
    const alDia = buildCampanaPdf(
      campana,
      buildCampanaView([{ id: 1, gerenteId: 10, gerenteNombre: "Ana", saldoUsd: "100" }], [dep(1, 1, "2026-03-02", "3650")]),
      generadoEn,
    );
    const montos = buscar(bloquesGerente(alDia)[0], (o) => o.text === "$ 0,00");
    expect(montos.length).toBeGreaterThan(0);
    expect(montos.every((o) => o.color === "#047857")).toBe(true);
  });

  it("gerente sin depósitos", () => {
    const t = textos(bloquesGerente(dd)[1]);
    expect(t).toContain("Sin depósitos registrados");
    expect(t.some((s) => s.startsWith("Total ("))).toBe(false);
  });

  it("campaña sin gerentes: una sola página con aviso", () => {
    const vacio = buildCampanaPdf(campana, buildCampanaView([], []), generadoEn);
    expect(bloquesGerente(vacio)).toHaveLength(0);
    expect(textos(vacio.content)).toContain("Sin gerentes asignados");
  });

  it("encabezado desde la página 2 y número de página al pie de la primera", () => {
    const header = dd.header as DynamicContent;
    const footer = dd.footer as DynamicContent;
    expect(textos(header(1, 3, pagina))).toEqual([]);
    const h2 = textos(header(2, 3, pagina));
    expect(h2).toContain("Marzo");
    expect(h2).toContain("Corte 18/10/2026 · Pág. 2 de 3");
    expect(textos(footer(1, 3, pagina))).toContain("Pág. 1 de 3");
    expect(textos(footer(2, 3, pagina))).toEqual([]);
  });

  it("filas alternadas con un fondo suave (sin tocar el encabezado ni el total)", () => {
    const tablas = buscar(dd.content, (o) => typeof o.table === "object" && typeof (o.layout as { fillColor?: unknown })?.fillColor === "function");
    const deps = tablas.find((t) => textos(t).includes("Referencia"))!;
    const body = (deps.table as { body: unknown[] }).body;
    const fill = (deps.layout as { fillColor: (i: number, node: unknown) => string | null }).fillColor;
    const node = { table: { body } };
    expect(body).toHaveLength(4); // encabezado, 2 depósitos, total
    expect([0, 1, 2, 3].map((i) => fill(i, node))).toEqual([null, null, "#f5f8fc", null]);
  });

  it("las barras nunca pasan de su fondo", () => {
    for (const c of buscar(dd.content, (o) => Array.isArray(o.canvas))) {
      const [fondo, ...resto] = c.canvas as { w: number }[];
      for (const r of resto) expect(r.w).toBeLessThanOrEqual(fondo.w);
    }
    expect(buscar(dd.content, (o) => Array.isArray(o.canvas)).length).toBeGreaterThan(0);
  });

  it("carta vertical", () => {
    expect(dd.pageSize).toBe("LETTER");
    expect(dd.pageOrientation).toBe("portrait");
  });
});

describe("buildGerentePdf", () => {
  const ana = buildGerentePdf(campana, view, 1, generadoEn);

  it("solo el gerente: su nombre, la campaña, su avance y sus depósitos, sin el resumen de la campaña", () => {
    const t = textos(ana.content);
    for (const s of ["ESTADO DE CUENTA · CORTE 18/10/2026", "Ana Peña", "Total (2 depósitos)", "4.745,00", "$ 130,00 pagado", "Pagado de más"]) {
      expect(t).toContain(s);
    }
    expect(t.some((s) => s.includes("Campaña Marzo"))).toBe(true);
    expect(t).not.toContain("Luis");
    expect(t).not.toContain("Resumen por gerente");
    expect(bloquesGerente(ana)).toHaveLength(0);
    expect(ana.info?.title).toBe("Ana Peña · Marzo");
  });

  it("encabezado desde la página 2 con el gerente y la campaña", () => {
    const h2 = textos((ana.header as DynamicContent)(2, 2, pagina));
    expect(h2).toContain("Ana Peña · Marzo");
  });

  it("gerente sin depósitos", () => {
    expect(textos(buildGerentePdf(campana, view, 2, generadoEn).content)).toContain("Sin depósitos registrados");
  });

  it("asignación fuera de la campaña lanza error", () => {
    expect(() => buildGerentePdf(campana, view, 99)).toThrow();
  });
});
