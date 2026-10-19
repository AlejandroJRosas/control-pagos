import { useRef, useState } from "react";
import Decimal from "decimal.js";
import { toBlob } from "html-to-image";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { Copy, Download, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Aviso } from "@/components/Feedback";
import type { FilaDeposito, Resumen } from "@/domain/campanaView";
import { formatFecha } from "@/domain/dates";
import { formatNumberVE, formatPct, formatTasa, formatUsd } from "@/domain/money";
import { reportError } from "@/lib/reportError";
import { archivoBase } from "@/export/fileName";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gerenteNombre: string;
  campanaNombre: string;
  fechaCorte: string;
  resumen: Resumen;
  filas: FilaDeposito[];
  /** Número para wa.me; null si el gerente no tiene un teléfono válido. */
  numero: string | null;
  onWhatsApp: () => Promise<void>;
};

async function copiarImagen(blob: Blob): Promise<void> {
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

/** Estado de cuenta del gerente en la campaña como imagen para compartir (copiar, guardar o mandar por WhatsApp). */
export function EstadoCuentaDialog({ open, onOpenChange, gerenteNombre, campanaNombre, fechaCorte, resumen, filas, numero, onWhatsApp }: Props) {
  const hoja = useRef<HTMLDivElement>(null);
  const [ocupado, setOcupado] = useState(false);

  async function imagen(): Promise<Blob> {
    if (!hoja.current) throw new Error("La vista previa no está lista");
    // Las fuentes web no se incrustan: la hoja usa fuentes del sistema para que la imagen salga igual.
    const blob = await toBlob(hoja.current, { pixelRatio: 2, backgroundColor: "#ffffff", skipFonts: true });
    if (!blob) throw new Error("No se pudo generar la imagen");
    return blob;
  }

  async function conImagen(accion: (b: Blob) => Promise<void>, contexto: string) {
    setOcupado(true);
    try {
      await accion(await imagen());
    } catch (e) {
      reportError(e, contexto);
    } finally {
      setOcupado(false);
    }
  }

  const copiar = () =>
    conImagen(async (b) => {
      await copiarImagen(b);
      toast.success("Imagen copiada: pégala con Ctrl+V");
    }, "Copiar imagen");

  const guardar = () =>
    conImagen(async (b) => {
      const path = await save({
        defaultPath: `estado-de-cuenta-${archivoBase(gerenteNombre)}-${archivoBase(campanaNombre)}-${fechaCorte}.png`,
        filters: [{ name: "Imagen PNG", extensions: ["png"] }],
      });
      if (!path) return;
      await writeFile(path, new Uint8Array(await b.arrayBuffer()));
      toast.success("Imagen guardada");
    }, "Guardar imagen");

  const whatsapp = () =>
    conImagen(async (b) => {
      await copiarImagen(b);
      await onWhatsApp();
      toast.success("Imagen copiada: pégala en el chat con Ctrl+V");
    }, "WhatsApp");

  const restante = new Decimal(resumen.restante);
  const excedido = restante.isNegative() && !restante.isZero();
  const th = "border-b border-neutral-300 px-2 py-1.5 text-left font-semibold";
  const td = "border-b border-neutral-200 px-2 py-1";
  const num = "text-right tabular-nums";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Estado de cuenta</DialogTitle>
          <DialogDescription>Cópialo como imagen para pegarlo en un chat, guárdalo o envíalo directo por WhatsApp.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-auto rounded-md border bg-neutral-100 p-3">
          <div
            ref={hoja}
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
        </div>
        {!numero && <Aviso>Para enviarlo por WhatsApp, agrega el teléfono del gerente con «Agregar teléfono…».</Aviso>}
        <DialogFooter>
          <Button variant="outline" disabled={ocupado} onClick={() => void guardar()}>
            <Download />
            Guardar imagen…
          </Button>
          <Button variant="outline" disabled={ocupado} onClick={() => void copiar()}>
            <Copy />
            Copiar imagen
          </Button>
          <Button disabled={ocupado || !numero} onClick={() => void whatsapp()}>
            <MessageCircle />
            Copiar y abrir WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
