import { useRef, useState } from "react";
import { Copy, Download, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Aviso } from "@/components/Feedback";
import { BotonConMotivo } from "@/components/BotonConMotivo";
import type { Campana } from "@/db/repos/campanas";
import type { CampanaView, FilaDeposito, Resumen } from "@/domain/campanaView";
import { ETIQUETA_FORMATO, useFormatoEnvio } from "@/lib/formatoEnvio";
import { reportError } from "@/lib/reportError";
import { copiarEstadoCuenta, guardarEstadoCuenta } from "./envioEstadoCuenta";
import { FormatoEnvioSelector } from "./FormatoEnvioSelector";
import { HojaEstadoCuenta } from "./HojaEstadoCuenta";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gerenteNombre: string;
  campana: Campana;
  view: CampanaView;
  asignacionId: number;
  /** Con un depósito suyo duplicado, el PDF y el Excel no salen (como Exportar): los totales saldrían inflados. */
  duplicado: boolean;
  fechaCorte: string;
  resumen: Resumen;
  filas: FilaDeposito[];
  /** Número para wa.me; null si el gerente no tiene un teléfono válido. */
  numero: string | null;
  onWhatsApp: () => Promise<void>;
};

/** Estado de cuenta del gerente en la campaña como imagen, PDF o Excel para compartir (copiar, guardar o mandar por WhatsApp). */
export function EstadoCuentaDialog({ open, onOpenChange, gerenteNombre, campana, view, asignacionId, duplicado, fechaCorte, resumen, filas, numero, onWhatsApp }: Props) {
  const hoja = useRef<HTMLDivElement>(null);
  const [ocupado, setOcupado] = useState(false);
  const [formato, setFormato] = useFormatoEnvio();
  const fuente = () => ({ hoja: hoja.current, campana, view, asignacionId, gerenteNombre, fechaCorte });
  const nombre = ETIQUETA_FORMATO[formato].toLowerCase();
  const motivo = duplicado && formato !== "imagen" ? `Resuelve los depósitos duplicados de la campaña para enviar el ${nombre}` : undefined;

  async function trabajar(accion: () => Promise<void>, contexto: string) {
    setOcupado(true);
    try {
      await accion();
    } catch (e) {
      reportError(e, contexto);
    } finally {
      setOcupado(false);
    }
  }

  const copiar = () =>
    trabajar(async () => {
      toast.success(`${await copiarEstadoCuenta(formato, fuente())}: pégalo con Ctrl+V`);
    }, "Copiar");

  const guardar = () =>
    trabajar(async () => {
      if (await guardarEstadoCuenta(formato, fuente())) toast.success("Estado de cuenta guardado");
    }, "Guardar");

  const whatsapp = () =>
    trabajar(async () => {
      const aviso = await copiarEstadoCuenta(formato, fuente());
      await onWhatsApp();
      toast.success(`${aviso}: pégalo en el chat con Ctrl+V`);
    }, "WhatsApp");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Estado de cuenta</DialogTitle>
          <DialogDescription>
            Cópialo para pegarlo en un chat, guárdalo o envíalo directo por WhatsApp: se abre el chat con el mensaje listo y pegas el {nombre} con Ctrl+V.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-auto rounded-md border bg-neutral-100 p-3">
          <HojaEstadoCuenta ref={hoja} gerenteNombre={gerenteNombre} campanaNombre={campana.nombre} fechaCorte={fechaCorte} resumen={resumen} filas={filas} />
        </div>
        {!numero && <Aviso>Para enviarlo por WhatsApp, agrega el teléfono del gerente con «Agregar teléfono…».</Aviso>}
        <DialogFooter className="sm:justify-between">
          <FormatoEnvioSelector formato={formato} onChange={setFormato} />
          <div className="flex flex-wrap justify-end gap-2">
            <BotonConMotivo motivo={motivo}>
              <Button variant="outline" disabled={ocupado || !!motivo} onClick={() => void guardar()}>
                <Download />
                Guardar {nombre}…
              </Button>
            </BotonConMotivo>
            <BotonConMotivo motivo={motivo}>
              <Button variant="outline" disabled={ocupado || !!motivo} onClick={() => void copiar()}>
                <Copy />
                Copiar {nombre}
              </Button>
            </BotonConMotivo>
            <BotonConMotivo motivo={motivo}>
              <Button disabled={ocupado || !numero || !!motivo} onClick={() => void whatsapp()}>
                <MessageCircle />
                Copiar y abrir WhatsApp
              </Button>
            </BotonConMotivo>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
