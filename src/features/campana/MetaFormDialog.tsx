import { useEffect, useState, type FormEvent } from "react";
import Decimal from "decimal.js";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/Field";
import { MontoInput } from "@/components/MontoInput";
import { FechaInput } from "@/components/FechaInput";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { getDb } from "@/db";
import { createMeta, deleteMeta, updateMeta } from "@/db/repos/metas";
import { parsePorcentaje, validateMeta, type Meta, type MetaDraft } from "@/domain/metas";
import { formatPct, formatUsd, parseMonto, toInputVE } from "@/domain/money";
import { invalidate } from "@/hooks/useData";
import { useDialogoSinGuardar } from "@/hooks/useAvisoSinGuardar";
import { reportError } from "@/lib/reportError";
import { cn } from "@/lib/utils";

type Props = {
  campanaId: number;
  /** null = cerrado; "nueva" = agregar; una meta = editarla. */
  meta: Meta | "nueva" | null;
  /** Saldo general de la campaña, para mostrar qué parte es la meta. */
  asignado: string;
  /** Fecha propuesta para una meta nueva (la final de la campaña, si tiene). */
  fechaSugerida: string;
  onOpenChange: (open: boolean) => void;
};

const VACIO: MetaDraft = { tipo: "monto", monto: "", porcentaje: "", fecha: "", nota: "" };

/** Agrega o edita una meta general de la campaña (monto pagado de toda la campaña para una fecha). */
export function MetaFormDialog({ campanaId, meta, asignado, fechaSugerida, onOpenChange }: Props) {
  const [draft, setDraft] = useState<MetaDraft>(VACIO);
  const [inicial, setInicial] = useState<MetaDraft>(VACIO);
  const [errors, setErrors] = useState<Partial<Record<keyof MetaDraft, string>>>({});
  const [saving, setSaving] = useState(false);
  const [borrar, setBorrar] = useState(false);
  const editando = meta !== null && meta !== "nueva" ? meta : null;
  const aviso = useDialogoSinGuardar(meta !== null && JSON.stringify(draft) !== JSON.stringify(inicial), onOpenChange);

  useEffect(() => {
    if (meta === null) return;
    const d: MetaDraft = editando
      ? {
          tipo: editando.porcentaje !== null ? "porcentaje" : "monto",
          monto: editando.montoUsd !== null ? toInputVE(editando.montoUsd) : "",
          porcentaje: editando.porcentaje?.replace(".", ",") ?? "",
          fecha: editando.fecha,
          nota: editando.nota ?? "",
        }
      : { ...VACIO, fecha: fechaSugerida };
    setDraft(d);
    setInicial(d);
    setErrors({});
  }, [meta]);

  const set = (k: keyof MetaDraft, v: string) => setDraft((d) => ({ ...d, [k]: v }));
  const monto = parseMonto(draft.monto);
  const parte = monto && new Decimal(asignado).gt(0) ? new Decimal(monto).div(asignado).times(100).toNumber() : null;
  const pct = parsePorcentaje(draft.porcentaje);
  const equivalente = pct ? new Decimal(asignado).times(pct).div(100).toDecimalPlaces(2).toFixed(2) : null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const r = validateMeta(draft);
    if (!r.ok) return setErrors(r.errors);
    setSaving(true);
    try {
      const db = await getDb();
      if (editando) await updateMeta(db, editando.id, r.value);
      else await createMeta(db, campanaId, r.value);
      toast.success(editando ? "Meta actualizada" : "Meta agregada");
      invalidate();
      onOpenChange(false);
    } catch (err) {
      reportError(err);
    } finally {
      setSaving(false);
    }
  }

  async function eliminar() {
    if (!editando) return;
    try {
      await deleteMeta(await getDb(), editando.id);
      toast.success("Meta eliminada");
      invalidate();
      setBorrar(false);
      onOpenChange(false);
    } catch (err) {
      reportError(err);
    }
  }

  return (
    <Dialog open={meta !== null} onOpenChange={aviso.onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar meta" : "Nueva meta"}</DialogTitle>
            <DialogDescription>
              Lo pagado de toda la campaña al que se quiere llegar para una fecha: un monto en USD o un porcentaje del saldo. Una meta por
              porcentaje se mide también en cada gerente sobre su propio saldo.
            </DialogDescription>
          </DialogHeader>
          <div role="group" aria-label="Tipo de meta" className="flex gap-2">
            {(["monto", "porcentaje"] as const).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={draft.tipo === t}
                onClick={() => set("tipo", t)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors hover:bg-fila-hover",
                  draft.tipo === t && "border-primary-intenso bg-fila-hover font-medium",
                )}
              >
                {t === "monto" ? "Monto" : "Porcentaje"}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {draft.tipo === "monto" ? (
              <Field
                id="meta-monto"
                label="Monto a pagar (USD)"
                error={errors.monto}
                hint={parte !== null ? `${formatPct(parte)} del saldo general${parte > 100 ? " (lo supera)" : ""}` : "Ej. 5.000,00"}
              >
                <MontoInput id="meta-monto" autoFocus className="text-right tabular-nums" value={draft.monto} onChange={(v) => set("monto", v)} />
              </Field>
            ) : (
              <Field
                id="meta-porcentaje"
                label="Porcentaje a pagar (%)"
                error={errors.porcentaje}
                hint={equivalente !== null ? `${formatUsd(equivalente)} del saldo general` : "Ej. 60"}
              >
                <Input
                  id="meta-porcentaje"
                  autoFocus
                  inputMode="decimal"
                  autoComplete="off"
                  className="text-right tabular-nums"
                  value={draft.porcentaje}
                  onChange={(e) => set("porcentaje", e.target.value.replace(/[^\d.,]/g, ""))}
                />
              </Field>
            )}
            <Field id="meta-fecha" label="Para el" error={errors.fecha}>
              <FechaInput id="meta-fecha" value={draft.fecha} onChange={(v) => set("fecha", v)} />
            </Field>
          </div>
          <Field id="meta-nota" label="Nota (opcional)">
            <Input id="meta-nota" value={draft.nota} onChange={(e) => set("nota", e.target.value)} placeholder="Ej. primer corte" />
          </Field>
          <DialogFooter>
            {editando && (
              <Button type="button" variant="outline" className="mr-auto text-destructive" onClick={() => setBorrar(true)}>
                <Trash2 />
                Eliminar
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => aviso.onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
        <ConfirmDialog
          open={borrar}
          onOpenChange={setBorrar}
          title="Eliminar meta"
          description="La meta deja de mostrarse en la barra de avance. Lo pagado no cambia."
          confirmLabel="Eliminar"
          destructive
          onConfirm={eliminar}
        />
        {aviso.dialogo}
      </DialogContent>
    </Dialog>
  );
}
