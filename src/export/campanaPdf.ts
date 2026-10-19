import Decimal from "decimal.js";
import type { Content, ContentCanvas, ContextPageSize, CustomTableLayout, TableCell, TDocumentDefinitions } from "pdfmake/interfaces";
import type { Campana } from "@/db/repos/campanas";
import type { CampanaView, DepositoCalculado, GerenteResumen, Resumen } from "@/domain/campanaView";
import { formatFecha, formatPeriodo, todayIso } from "@/domain/dates";
import { formatNumberVE, formatPct, formatTasa, formatUsd } from "@/domain/money";
import { COLOR, anchoBarra, colorBarra, hex, textoRestante } from "./estilo";

/** Ancho útil de una hoja carta (612 pt) con márgenes de 40 pt. */
const ANCHO = 532;
const ANCHO_BARRA_TABLA = 90;

const negativo = (v: string) => new Decimal(v).isNegative() && !new Decimal(v).isZero();
const monto = (v: string, extra: Record<string, unknown> = {}): TableCell => ({
  text: formatNumberVE(v),
  alignment: "right",
  ...(negativo(v) ? { color: hex(COLOR.textoRojo) } : {}),
  ...extra,
});
const enc = (text: string, derecha = false): TableCell => ({ text, style: "encabezado", ...(derecha ? { alignment: "right" } : {}) });

function barra(ancho: number, alto: number, r: Resumen, color: string): ContentCanvas {
  return {
    canvas: [
      { type: "rect", x: 0, y: 0, w: ancho, h: alto, r: alto / 2, color: hex(COLOR.grisBarra) },
      { type: "rect", x: 0, y: 0, w: ancho * anchoBarra(r), h: alto, r: alto / 2, color: hex(color) },
    ],
  };
}

/** Líneas horizontales finas, encabezado subrayado en azul y línea marcada sobre el total. */
function layoutTabla(conTotal: boolean): CustomTableLayout {
  return {
    hLineWidth: (i, node) => {
      const filas = node.table.body.length;
      if (i === 0) return 0;
      if (i === 1) return 1.5;
      if (conTotal && i === filas - 1) return 1;
      return i === filas ? 0 : 0.5;
    },
    hLineColor: (i, node) => {
      if (i === 1) return hex(COLOR.azul);
      return conTotal && i === node.table.body.length - 1 ? "#333333" : hex(COLOR.linea);
    },
    vLineWidth: () => 0,
    paddingLeft: () => 4,
    paddingRight: () => 4,
    paddingTop: () => 3,
    paddingBottom: () => 3,
  };
}

/** "$ X pagado / de $ Y" + barra + "Faltan $ Z · NN,N %…". */
function avance(r: Resumen, deTexto: string, color: string, cola: string): Content[] {
  const restante = textoRestante(r);
  return [
    {
      columns: [
        { text: `${formatUsd(r.pagado)} pagado`, bold: true, fontSize: 11 },
        { text: `de ${formatUsd(r.asignado)}${deTexto}`, alignment: "right", color: hex(COLOR.gris) },
      ],
      margin: [0, 10, 0, 3],
    },
    barra(ANCHO, 8, r, color),
    {
      text: [
        { text: restante.etiqueta },
        " ",
        { text: restante.monto, bold: true, color: hex(restante.excedido ? COLOR.textoRojo : COLOR.textoAmbar) },
        ` · ${cola}`,
      ],
      color: hex(COLOR.gris),
      margin: [0, 3, 0, 0],
    },
  ];
}

function franja(campana: Campana, corte: string): Content {
  const estado = campana.estado === "activa" ? "Activa" : "Cerrada";
  return {
    table: {
      widths: ["*"],
      body: [
        [
          {
            fillColor: hex(COLOR.azul),
            color: "#ffffff",
            margin: [10, 8, 10, 8],
            stack: [
              { text: `REPORTE DE CAMPAÑA · CORTE ${corte}`, fontSize: 7, color: "#c9d6e8", characterSpacing: 0.5 },
              { text: campana.nombre, fontSize: 18, bold: true },
              { text: `${formatPeriodo(campana.fechaInicio, campana.fechaFin)} · ${estado}`, color: "#c9d6e8" },
            ],
          },
        ],
      ],
    },
    layout: "noBorders",
  };
}

function tablaResumen(view: CampanaView): Content {
  const celdaAvance = (r: Resumen, color: string): TableCell => ({
    columns: [
      { width: ANCHO_BARRA_TABLA, ...barra(ANCHO_BARRA_TABLA, 5, r, color), margin: [0, 3, 0, 0] },
      { width: "*", text: formatPct(r.pct), alignment: "right" },
    ],
    columnGap: 6,
  });
  const body: TableCell[][] = [[enc("Gerente"), enc("Asignado", true), enc("Pagado", true), enc("Restante", true), enc("Avance")]];
  if (view.gerentes.length === 0) {
    body.push([{ text: "Sin gerentes asignados", colSpan: 5, alignment: "center", color: hex(COLOR.gris), margin: [0, 6, 0, 6] }, "", "", "", ""]);
  } else {
    for (const g of view.gerentes) {
      body.push([g.gerenteNombre, monto(g.asignado), monto(g.pagado), monto(g.restante), celdaAvance(g, colorBarra(g))]);
    }
    const t = view.total;
    body.push([
      { text: "Total", bold: true },
      monto(t.asignado, { bold: true }),
      monto(t.pagado, { bold: true }),
      monto(t.restante, { bold: true }),
      { text: formatPct(t.pct), bold: true, alignment: "right" },
    ]);
  }
  return {
    table: { headerRows: 1, widths: ["*", 70, 70, 70, 130], body },
    layout: layoutTabla(view.gerentes.length > 0),
  };
}

function tablaDepositos(g: GerenteResumen, deps: DepositoCalculado[]): Content {
  const body: TableCell[][] = [
    [enc("Fecha"), enc("Banco"), enc("Referencia"), enc("Cuenta destino"), enc("Monto Bs", true), enc("Tasa", true), enc("USD", true), enc("Saldo", true)],
  ];
  if (deps.length === 0) {
    body.push([
      { text: "Sin depósitos registrados", colSpan: 8, alignment: "center", color: hex(COLOR.gris), margin: [0, 6, 0, 6] },
      "", "", "", "", "", "", "",
    ]);
  } else {
    for (const d of deps) {
      body.push([
        formatFecha(d.fecha),
        d.banco,
        d.referencia,
        d.cuentaDestino,
        monto(d.montoBs),
        { text: formatTasa(d.tasaValor), alignment: "right" },
        monto(d.usd),
        monto(d.saldoGerenteRestante),
      ]);
    }
    const totalBs = deps.reduce((acc, d) => acc.plus(d.montoBs), new Decimal(0)).toFixed(2);
    body.push([
      { text: `Total (${deps.length} ${deps.length === 1 ? "depósito" : "depósitos"})`, colSpan: 4, bold: true },
      "", "", "",
      monto(totalBs, { bold: true }),
      "",
      monto(g.pagado, { bold: true }),
      monto(g.restante, { bold: true }),
    ]);
  }
  return {
    table: { headerRows: 1, widths: [46, 55, 52, "*", 62, 40, 50, 52], body },
    layout: layoutTabla(deps.length > 0),
    fontSize: 8,
    margin: [0, 14, 0, 0],
  };
}

function paginaGerente(g: GerenteResumen, deps: DepositoCalculado[]): Content {
  const n = `${g.cantidad} ${g.cantidad === 1 ? "depósito" : "depósitos"}`;
  return {
    pageBreak: "before",
    stack: [
      { text: g.gerenteNombre, fontSize: 16, bold: true },
      ...avance(g, " asignado", colorBarra(g), `${formatPct(g.pct)} · ${n}`),
      tablaDepositos(g, deps),
    ],
  };
}

/** Reporte de la campaña para compartir: resumen por gerente y una página de depósitos por gerente. */
export function buildCampanaPdf(campana: Campana, view: CampanaView, generadoEn: Date = new Date()): TDocumentDefinitions {
  const corte = formatFecha(todayIso(generadoEn));
  return {
    info: { title: `Campaña ${campana.nombre}`, creator: "Control de Pagos" },
    pageSize: "LETTER",
    pageOrientation: "portrait",
    pageMargins: [40, 50, 40, 40],
    defaultStyle: { font: "Roboto", fontSize: 9, color: "#1a1a1a" },
    styles: { encabezado: { bold: true, color: hex(COLOR.azul) } },
    header: (pagina: number, total: number, _size: ContextPageSize): Content | null =>
      pagina === 1
        ? null
        : {
            margin: [40, 22, 40, 0],
            stack: [
              {
                columns: [
                  { text: campana.nombre },
                  { text: `Corte ${corte} · Pág. ${pagina} de ${total}`, alignment: "right" },
                ],
                fontSize: 8,
                color: hex(COLOR.azul),
              },
              { canvas: [{ type: "line", x1: 0, y1: 3, x2: ANCHO, y2: 3, lineWidth: 0.5, lineColor: hex(COLOR.azul) }] },
            ],
          },
    footer: (pagina: number, total: number): Content | null =>
      pagina === 1 ? { text: `Pág. 1 de ${total}`, alignment: "center", fontSize: 8, color: hex(COLOR.gris), margin: [0, 12, 0, 0] } : null,
    content: [
      franja(campana, corte),
      ...avance(view.total, "", COLOR.barraAzul, `${formatPct(view.total.pct)} de avance`),
      { text: "Resumen por gerente", bold: true, fontSize: 11, margin: [0, 16, 0, 6] },
      tablaResumen(view),
      ...view.gerentes.map((g) =>
        paginaGerente(
          g,
          view.depositos.filter((d) => d.asignacionId === g.asignacionId),
        ),
      ),
    ],
  };
}
