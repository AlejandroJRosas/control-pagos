import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/Field";
import { Aviso } from "@/components/Feedback";
import { cn } from "@/lib/utils";
import { ImageDrop } from "@/components/ImageDrop";
import { getDb } from "@/db";
import { createTasa, getTasa, updateTasa, type Tasa, type TasaConUsos } from "@/db/repos/tasas";
import { validateTasa, type TasaDraft } from "@/domain/validation";
import { formatTasa, parseTasa, toInputVE } from "@/domain/money";
import { formatFecha, todayIso } from "@/domain/dates";
import { persistImagen, type ImagenValue } from "@/platform/images";
import { invalidate } from "@/hooks/useData";
import { reportError } from "@/lib/reportError";
import { confClass } from "@/lib/confianza";
import { extractor, type CampoPropuesto, type CamposTasa } from "@/extraction/extractor";
import { aplicarExtraccion, autollenadoExistente, autollenadoNuevo, marcarTocado, tasaParaFecha, type Autollenado } from "@/extraction/autollenado";

type Props = {
  tasa: TasaConUsos | null;
  fechaFija?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (t: Tasa) => void;
};

export function TasaFormDialog({ tasa, fechaFija, open, onOpenChange, onSaved }: Props) {
  const [form, setForm] = useState<{ draft: TasaDraft; auto: Autollenado<CamposTasa> }>({
    draft: { fecha: "", valor: "", notas: "" },
    auto: autollenadoNuevo(),
  });
  const draft = form.draft;
  const [imagen, setImagen] = useState<ImagenValue>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [fechaImagen, setFechaImagen] = useState<string | null>(null);
  const fechaInicial = useRef("");
  const imagenVigente = useRef<Blob | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof TasaDraft, string>>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const inicial = { fecha: tasa?.fecha ?? fechaFija ?? todayIso(), valor: tasa ? toInputVE(tasa.valor) : "", notas: tasa?.notas ?? "" };
    // Con fecha fija o al editar, la fecha no la cambia el OCR (solo se avisa si la imagen es de otro día).
    const auto = tasa ? autollenadoExistente({ fecha: inicial.fecha, valor: inicial.valor }) : autollenadoNuevo<CamposTasa>();
    setForm({ draft: inicial, auto: fechaFija ? marcarTocado(auto, "fecha") : auto });
    fechaInicial.current = inicial.fecha;
    imagenVigente.current = null;
    setLeyendo(false);
    setFechaImagen(null);
    setImagen(tasa?.imagenPath ? { kind: "stored", path: tasa.imagenPath } : null);
    setErrors({});
  }, [open, tasa, fechaFija]);

  function set(k: keyof TasaDraft, v: string) {
    setForm((f) => ({ draft: { ...f.draft, [k]: v }, auto: k === "notas" ? f.auto : marcarTocado(f.auto, k) }));
  }

  function conExtraccion(propuestos: Partial<Record<CamposTasa, CampoPropuesto>>) {
    setForm((f) => {
      const ajustados = tasaParaFecha(propuestos, f.draft.fecha, f.auto.estado.fecha === "tocado");
      const r = aplicarExtraccion({ fecha: f.draft.fecha, valor: f.draft.valor }, f.auto, ajustados, { fecha: fechaInicial.current, valor: "" });
      return { draft: { ...f.draft, ...r.valores }, auto: r.auto };
    });
  }

  async function onImagen(v: ImagenValue) {
    setImagen(v);
    const file = v?.kind === "new" ? v.file : null;
    imagenVigente.current = file;
    setFechaImagen(null);
    // Lo que puso la imagen anterior se quita de inmediato, no al terminar de leer la nueva.
    conExtraccion({});
    if (!file) {
      setLeyendo(false);
      return;
    }
    setLeyendo(true);
    try {
      const r = await extractor.extraerTasa(file);
      if (imagenVigente.current !== file) return;
      conExtraccion(r.fields);
      setFechaImagen(r.fields.fecha?.value ?? null);
      if (r.formato === null) toast.info("No se reconoció el formato de la imagen de tasa; completa los datos a mano");
    } catch (e) {
      if (imagenVigente.current === file) reportError(e, "Lectura de la tasa");
    } finally {
      if (imagenVigente.current === file) setLeyendo(false);
    }
  }

  const nuevoValor = parseTasa(draft.valor);
  const afectados = tasa && nuevoValor !== null && nuevoValor !== tasa.valor ? tasa.usos : 0;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const r = validateTasa(draft);
    if (!r.ok) return setErrors(r.errors);
    setSaving(true);
    try {
      const db = await getDb();
      const imagenPath = await persistImagen(imagen);
      let id: number;
      if (tasa) {
        await updateTasa(db, tasa.id, { valor: r.value.valor, notas: r.value.notas, imagenPath });
        id = tasa.id;
      } else {
        id = await createTasa(db, { ...r.value, imagenPath });
      }
      const guardada = await getTasa(db, id);
      toast.success(tasa ? "Tasa actualizada" : "Tasa registrada");
      invalidate();
      onOpenChange(false);
      if (guardada) onSaved?.(guardada);
    } catch (err) {
      reportError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{tasa ? "Editar tasa" : "Registrar tasa del día"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <Field id="t-fecha" label="Fecha" error={errors.fecha}>
              <Input
                id="t-fecha"
                type="date"
                className={confClass(form.auto.confianza.fecha)}
                value={draft.fecha}
                disabled={tasa != null || fechaFija != null}
                onChange={(e) => set("fecha", e.target.value)}
              />
            </Field>
            <Field id="t-valor" label="Bs por USD" error={errors.valor} hint={nuevoValor ? `= ${formatTasa(nuevoValor)} Bs por USD` : "Ej. 36,50"}>
              <Input
                id="t-valor"
                autoFocus
                inputMode="decimal"
                className={cn("text-right tabular-nums", confClass(form.auto.confianza.valor))}
                value={draft.valor}
                onChange={(e) => set("valor", e.target.value)}
              />
            </Field>
          </div>
          {afectados > 0 && <Aviso tono="warning">Cambiar esta tasa recalcula {afectados} depósito(s).</Aviso>}
          <Field id="t-notas" label="Notas (opcional)">
            <Textarea id="t-notas" rows={2} value={draft.notas} onChange={(e) => set("notas", e.target.value)} />
          </Field>
          <ImageDrop label="Captura de la tasa (opcional)" value={imagen} onChange={onImagen} pasteEnabled={open} className="h-56" />
          {leyendo && <p className="text-sm text-muted-foreground">Leyendo imagen…</p>}
          {fechaImagen && fechaImagen !== draft.fecha && form.auto.estado.fecha === "tocado" && (
            <Aviso tono="warning">La imagen es del {formatFecha(fechaImagen)}.</Aviso>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {afectados > 0 ? `Guardar (afecta ${afectados})` : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
