import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, type NavigateFunction } from "react-router";
import { Ban, Images } from "lucide-react";
import { toast } from "sonner";
import { getCampana } from "@/db/repos/campanas";
import { useData } from "@/hooks/useData";
import { hayDialogoAbierto } from "@/hooks/useAtajo";
import { useCampanaActual } from "@/lib/campanaActual";
import { entregarArchivos, receptorActual, type Receptor } from "@/lib/soltarArchivos";
import { ACCEPTED_IMAGE_TYPES } from "@/platform/images";
import { abrirPaqueteDeArchivo } from "@/platform/paquete";
import { avisoTasas, esTipoZip, separarRecibidos } from "@/lib/archivosRecibidos";
import { rutaConsolidar } from "@/lib/rutaConsolidar";
import { reportError } from "@/lib/reportError";
import { cn } from "@/lib/utils";

/** Estado de navegación de la subida en lote: gerente elegido de antemano (`a:<asignacionId>`). */
export type EstadoLote = { gerente?: string };

/** Una imagen abre el registro del depósito con ella; varias, la subida en lote. Con `asignacionId`, para ese gerente. */
export function receptorCampana(navigate: NavigateFunction, c: { id: number; nombre: string; asignacionId?: number }): Receptor {
  return {
    destino: (n) => (n === 1 ? `Suelta para registrar un depósito en ${c.nombre}` : `Suelta para subir ${n} comprobantes en lote a ${c.nombre}`),
    recibir: (files) => {
      const ruta =
        files.length > 1 ? `/campanas/${c.id}/lote` : c.asignacionId ? `/asignaciones/${c.asignacionId}/depositos/nuevo` : `/campanas/${c.id}/depositos/nuevo`;
      entregarArchivos(ruta, files);
      const state: EstadoLote | undefined = files.length > 1 && c.asignacionId ? { gerente: `a:${c.asignacionId}` } : undefined;
      navigate(ruta, { state });
    },
  };
}

export const receptorCerrada = (nombre: string): Receptor => ({ destino: () => `La campaña ${nombre} está cerrada: no se pueden agregar comprobantes`, recibir: null });

export const receptorLoteTasas = (navigate: NavigateFunction): Receptor => ({
  destino: (n) => (n === 1 ? "Suelta para subir la captura de tasa en lote" : `Suelta para subir ${n} capturas de tasa en lote`),
  recibir: (files) => {
    entregarArchivos("/tasas/lote", files);
    navigate("/tasas/lote");
  },
});

const conArchivos = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
const contarImagenes = (dt: DataTransfer | null) => Array.from(dt?.items ?? []).filter((i) => i.kind === "file" && ACCEPTED_IMAGE_TYPES.includes(i.type)).length;
// Mientras se arrastra no se puede leer un .zip: se sabe qué trae al soltarlo.
const contarZips = (dt: DataTransfer | null) => Array.from(dt?.items ?? []).filter((i) => i.kind === "file" && esTipoZip(i.type)).length;

/** Qué se muestra mientras se arrastra: `n` imágenes o, si solo hay .zip, que se abrirán al soltar. */
type Arrastre = { imagenes: number; zips: number };

/**
 * Imágenes soltadas en cualquier parte de la ventana. Las zonas propias (ImageDrop, ZonaLote) las atienden antes;
 * si no, va al receptor que registró la pantalla y, si no hay, a la campaña de la ruta o a la actual (en Tasas, al lote de tasas).
 */
export function SoltarImagenes() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const actualId = useCampanaActual();
  const enTasas = pathname.startsWith("/tasas");
  const deRuta = /^\/campanas\/(\d+)/.exec(pathname);
  const campanaId = enTasas ? null : deRuta ? Number(deRuta[1]) : actualId;
  const { data: campana } = useData(async (db) => (campanaId ? await getCampana(db, campanaId) : null), [campanaId]);
  const [arrastre, setArrastre] = useState<Arrastre | null>(null);

  const porDefecto: Receptor = enTasas
    ? receptorLoteTasas(navigate)
    : !campana
      ? { destino: () => "Abre una campaña para soltar ahí los comprobantes", recibir: null }
      : campana.estado === "cerrada"
        ? receptorCerrada(campana.nombre)
        : receptorCampana(navigate, campana);
  const receptor = () => receptorActual() ?? porDefecto;
  const receptorRef = useRef(receptor);
  receptorRef.current = receptor;
  // Un .cpagos va a Consolidar con la campaña de la ruta o la actual como sugerencia.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const campanaRef = useRef<number | null>(null);
  campanaRef.current = enTasas ? actualId : campanaId;

  useEffect(() => {
    let ocultar: ReturnType<typeof setTimeout> | undefined;
    // dragover llega seguido mientras se arrastra encima; si deja de llegar, se salió de la ventana.
    const onDragOver = (e: DragEvent) => {
      if (!conArchivos(e)) return;
      e.preventDefault();
      clearTimeout(ocultar);
      ocultar = setTimeout(() => setArrastre(null), 200);
      const imagenes = contarImagenes(e.dataTransfer);
      const zips = contarZips(e.dataTransfer);
      setArrastre(imagenes + zips > 0 && !hayDialogoAbierto() ? { imagenes, zips } : null);
    };
    const onDrop = (e: DragEvent) => {
      clearTimeout(ocultar);
      setArrastre(null);
      if (!conArchivos(e) || e.defaultPrevented) return;
      // Sin esto el WebView abriría el archivo en lugar de la app.
      e.preventDefault();
      if (hayDialogoAbierto()) return;
      separarRecibidos(Array.from(e.dataTransfer?.files ?? [])).then(({ imagenes, paquetes, tasas, rechazos }) => {
        // Un .cpagos (o su .zip de WhatsApp) va a Consolidar con la campaña de la ruta o la actual como sugerencia.
        const paquete = paquetes[0];
        if (paquete) {
          if (paquetes.length + tasas.length + imagenes.length + rechazos.length > 1) toast.warning(`Se abre solo "${paquete.name}": suelta un archivo a la vez`);
          abrirPaqueteDeArchivo(paquete).then((carpeta) => navigateRef.current(rutaConsolidar(carpeta, campanaRef.current)), (err: unknown) => reportError(err));
          return;
        }
        for (const f of tasas) toast.info(avisoTasas(f.name));
        for (const m of rechazos) toast.error(m);
        if (imagenes.length === 0) return;
        const r = receptorRef.current();
        if (r.recibir) r.recibir(imagenes);
        else toast.error(r.destino(imagenes.length));
      }, reportError);
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      clearTimeout(ocultar);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  if (arrastre === null) return null;
  const r = receptor();
  const soloZips = arrastre.imagenes === 0;
  const Icono = r.recibir || soloZips ? Images : Ban;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-background/60 p-4 backdrop-blur-[2px]">
      <div className={cn("absolute inset-3 rounded-2xl border-4 border-dashed", r.recibir || soloZips ? "border-primary" : "border-muted-foreground/50")} />
      <div className="relative flex max-w-md flex-col items-center gap-3 rounded-xl border bg-background px-8 py-6 text-center shadow-lg">
        <Icono className={cn("size-10", r.recibir || soloZips ? "text-primary" : "text-muted-foreground")} />
        <p className="text-base font-medium">{soloZips ? `Suelta para abrir ${arrastre.zips === 1 ? "el .zip" : `los ${arrastre.zips} .zip`}` : r.destino(arrastre.imagenes)}</p>
      </div>
    </div>
  );
}
