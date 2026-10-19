import type { Ref } from "react";
import Decimal from "decimal.js";
import { toBlob } from "html-to-image";
import type { FilaDeposito, Resumen } from "@/domain/campanaView";
import { formatFecha } from "@/domain/dates";
import { formatNumberVE, formatPct, formatTasa, formatUsd } from "@/domain/money";

export type HojaProps = {
  gerenteNombre: string;
  campanaNombre: string;
  fechaCorte: string;
  resumen: Resumen;
  filas: FilaDeposito[];
  ref?: Ref<HTMLDivElement>;
};

/** Imagen PNG de la hoja. Las fuentes web no se incrustan: la hoja usa fuentes del sistema para que salga igual. */
export async function imagenDeHoja(el: HTMLElement | null): Promise<Blob> {
  if (!el) throw new Error("La vista previa no está lista");
  const blob = await toBlob(el, { pixelRatio: 2, backgroundColor: "#ffffff", skipFonts: true });
  if (!blob) throw new Error("No se pudo generar la imagen");
  return blob;
}

export async function copiarImagen(blob: Blob): Promise<void> {
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

/** Hoja del estado de cuenta (lo que se convierte en imagen); la usan el diálogo individual y el envío en lote. */
export function HojaEstadoCuenta({ gerenteNombre, campanaNombre, fechaCorte, resumen, filas, ref }: HojaProps) {
  const restante = new Decimal(resumen.restante);
  const excedido = restante.isNegative() && !restante.isZero();
  const th = "border-b border-neutral-300 px-2 py-1.5 text-left font-semibold";
  const td = "border-b border-neutral-200 px-2 py-1";
  const num = "text-right tabular-nums";

  return (
    <div
      ref={ref}
      className="mx-auto w-[680px] bg-white p-6 text-[13px] text-neutral-900"
      style={{ fontFamily: '"Segoe UI", Arial, sans-serif' }}
    >
      <div className="flex items-start justify-between gap-4 border-b-2 border-neutral-800 pb-3">
        <div>
          <div className="text-xs tracking-wide text-neutral-500 uppercase">Estado de cuenta</div>
          <div className="text-xl font-bold">{gerenteNombre}</div>
          <div className="text-neutral-600">Campaña {campanaNombre}</div>
        </div>
        <div className="text-right text-neutral-600">
          <div className="text-xs">Fecha de corte</div>
          <div className="font-semibold text-neutral-900">{formatFecha(fechaCorte)}</div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2">
        {[
          ["Asignado", formatUsd(resumen.asignado), "text-neutral-900"],
          ["Pagado", formatUsd(resumen.pagado), "text-emerald-700"],
          [excedido ? "Pagado de más" : "Restante", formatUsd(restante.abs()), excedido ? "text-red-700" : "text-amber-700"],
          ["Avance", formatPct(resumen.pct), "text-neutral-900"],
        ].map(([label, valor, color]) => (
          <div key={label} className="rounded-md border border-neutral-200 px-3 py-2">
            <div className="text-xs text-neutral-500">{label}</div>
            <div className={`text-base font-bold tabular-nums ${color}`}>{valor}</div>
          </div>
        ))}
      </div>
      <table className="mt-4 w-full border-collapse text-[12px]">
        <thead>
          <tr className="bg-neutral-100">
            <th className={th}>Fecha</th>
            <th className={th}>Banco</th>
            <th className={th}>Referencia</th>
            <th className={`${th} ${num}`}>Monto Bs</th>
            <th className={`${th} ${num}`}>Tasa</th>
            <th className={`${th} ${num}`}>USD</th>
            <th className={`${th} ${num}`}>Saldo</th>
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 ? (
            <tr>
              <td colSpan={7} className={`${td} py-4 text-center text-neutral-500`}>
                Sin depósitos registrados
              </td>
            </tr>
          ) : (
            filas.map((d) => (
              <tr key={d.id}>
                <td className={td}>{formatFecha(d.fecha)}</td>
                <td className={td}>{d.banco}</td>
                <td className={`${td} font-mono`}>{d.referencia}</td>
                <td className={`${td} ${num}`}>{formatNumberVE(d.montoBs)}</td>
                <td className={`${td} ${num}`}>{formatTasa(d.tasaValor)}</td>
                <td className={`${td} ${num}`}>{formatUsd(d.usd)}</td>
                <td className={`${td} ${num} ${new Decimal(d.saldoMostrado).isNegative() ? "text-red-700" : ""}`}>{formatUsd(d.saldoMostrado)}</td>
              </tr>
            ))
          )}
        </tbody>
        {filas.length > 0 && (
          <tfoot>
            <tr className="font-semibold">
              <td className="px-2 py-1.5" colSpan={5}>
                Total ({resumen.cantidad} {resumen.cantidad === 1 ? "depósito" : "depósitos"})
              </td>
              <td className={`px-2 py-1.5 ${num}`}>{formatUsd(resumen.pagado)}</td>
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
