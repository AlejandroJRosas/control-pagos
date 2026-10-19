import { useRef, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { Copy, Download, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Aviso } from "@/components/Feedback";
import type { FilaDeposito, Resumen } from "@/domain/campanaView";
import { reportError } from "@/lib/reportError";
import { archivoBase } from "@/export/fileName";
import { copiarImagen, HojaEstadoCuenta, imagenDeHoja } from "./HojaEstadoCuenta";

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


/** Estado de cuenta del gerente en la campaña como imagen para compartir (copiar, guardar o mandar por WhatsApp). */
export function EstadoCuentaDialog({ open, onOpenChange, gerenteNombre, campanaNombre, fechaCorte, resumen, filas, numero, onWhatsApp }: Props) {
  const hoja = useRef<HTMLDivElement>(null);
  const [ocupado, setOcupado] = useState(false);

  const imagen = () => imagenDeHoja(hoja.current);

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Estado de cuenta</DialogTitle>
          <DialogDescription>Cópialo como imagen para pegarlo en un chat, guárdalo o envíalo directo por WhatsApp.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-auto rounded-md border bg-neutral-100 p-3">
          <HojaEstadoCuenta ref={hoja} gerenteNombre={gerenteNombre} campanaNombre={campanaNombre} fechaCorte={fechaCorte} resumen={resumen} filas={filas} />
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
