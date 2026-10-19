import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { AlertTriangle, CheckCircle2, Images, ListChecks, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tecla } from "@/components/AyudaAtajos";
import { useAtajo } from "@/hooks/useAtajo";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ACCEPTED_IMAGE_TYPES, separarImagenes } from "@/platform/images";
import { cn } from "@/lib/utils";
import type { FilaLote } from "./useLote";

/** Zona para soltar, pegar o elegir varias imágenes; avisa por cada archivo que no es imagen. */
export function ZonaLote({ onArchivos, disabled = false }: { onArchivos: (files: File[]) => void; disabled?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const onArchivosRef = useRef(onArchivos);
  onArchivosRef.current = onArchivos;

  const recibir = (files: File[]) => {
    const { aceptadas, rechazadas } = separarImagenes(files);
    for (const f of rechazadas) toast.error(`"${f.name}" no es una imagen PNG, JPG o WEBP`);
    if (aceptadas.length > 0) onArchivosRef.current(aceptadas);
  };
  const recibirRef = useRef(recibir);
  recibirRef.current = recibir;

  useEffect(() => {
    if (disabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length === 0) return;
      e.preventDefault();
      recibirRef.current(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [disabled]);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) recibir(Array.from(e.dataTransfer.files));
      }}
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground",
        over && "border-primary bg-primary/5",
        disabled && "opacity-50",
      )}
    >
      <Images className="size-8" />
      <div>
        Arrastra aquí varias imágenes o pégalas con Ctrl+V
        <br />
        (PNG, JPG o WEBP)
      </div>
      <Button type="button" variant="outline" disabled={disabled} onClick={() => inputRef.current?.click()}>
        Elegir archivos…
      </Button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        hidden
        onChange={(e) => {
          recibir(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </div>
  );
}

const ESTADOS: Record<FilaLote["estado"], { icono: typeof Loader2; texto: (f: FilaLote) => string; clase: string }> = {
  "en-cola": { icono: Loader2, texto: () => "En espera…", clase: "text-muted-foreground" },
  leyendo: { icono: Loader2, texto: () => "Leyendo…", clase: "text-muted-foreground" },
  leido: { icono: CheckCircle2, texto: (f) => `Leído (${f.formato})`, clase: "text-emerald-700 dark:text-emerald-400" },
  "no-reconocido": { icono: AlertTriangle, texto: () => "Formato no reconocido: se llena a mano", clase: "text-amber-700 dark:text-amber-400" },
  error: { icono: XCircle, texto: () => "Error: revisa el aviso", clase: "text-destructive" },
};

export function TablaLote({ filas }: { filas: FilaLote[] }) {
  if (filas.length === 0) return null;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Imagen</TableHead>
          <TableHead>Estado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filas.map((f) => {
          const e = ESTADOS[f.estado];
          const Icono = e.icono;
          return (
            <TableRow key={f.key}>
              <TableCell className="max-w-80 truncate">{f.nombre}</TableCell>
              <TableCell className={e.clase}>
                <span className="inline-flex items-center gap-1.5">
                  <Icono className={cn("size-4", f.estado === "leyendo" && "animate-spin")} />
                  {e.texto(f)}
                </span>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

const leyendo = (f: FilaLote) => f.estado === "en-cola" || f.estado === "leyendo";

/**
 * Barra fija abajo con "Ir a revisar" (Enter o Ctrl+Enter). Salir abandona las lecturas pendientes, así que
 * mientras se lee el botón espera a que termine y entonces abre la revisión ("Ir ya" no espera).
 */
export function BarraIrARevisar({ to, filas }: { to: string; filas: FilaLote[] }) {
  const navigate = useNavigate();
  const [esperando, setEsperando] = useState(false);
  const porLeer = filas.filter(leyendo).length;
  const listos = porLeer === 0;

  useEffect(() => {
    if (esperando && listos) navigate(to);
  }, [esperando, listos, navigate, to]);

  const ir = () => (listos ? navigate(to) : setEsperando((e) => !e));
  useAtajo("Enter", ir, { activo: filas.length > 0 });
  useAtajo("Enter", ir, { ctrl: true, activo: filas.length > 0 });
  if (filas.length === 0) return null;

  return (
    <div className="sticky bottom-0 z-10 -mx-6 -mb-6 flex flex-wrap items-center justify-end gap-3 border-t bg-background/95 px-6 py-3 backdrop-blur">
      <span className="mr-auto text-sm text-muted-foreground" aria-live="polite">
        {filas.length} subido(s)
        {porLeer > 0 && ` · leyendo ${porLeer}…`}
        {esperando && " · la revisión se abre al terminar"}
      </span>
      {esperando && (
        <Button variant="ghost" onClick={() => navigate(to)}>
          Ir ya
        </Button>
      )}
      <Button variant={esperando ? "outline" : "default"} onClick={ir}>
        {esperando ? <Loader2 className="animate-spin" /> : <ListChecks />}
        {esperando ? "Esperando la lectura (clic para cancelar)" : "Ir a revisar"}
        {!esperando && <Tecla className="border-primary-foreground/25 bg-primary-foreground/10 text-primary-foreground">Enter</Tecla>}
      </Button>
    </div>
  );
}
