import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { cn } from "cn";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EtiquetaChip, NOMBRE_COLOR, puntoColor } from "@/components/EtiquetaChip";
import { getDb } from "@/db";
import { createEtiqueta, deleteEtiqueta, listEtiquetas, updateEtiqueta, type EtiquetaConUso } from "@/db/repos/etiquetas";
import { COLORES_ETIQUETA, MAX_NOMBRE_ETIQUETA, validateEtiqueta, type ColorEtiqueta, type EtiquetaDraft } from "@/domain/etiquetas";
import { invalidate, useData } from "@/hooks/useData";
import { reportError } from "@/lib/reportError";

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

const VACIO: EtiquetaDraft = { nombre: "", color: "azul" };

/** Elegir color con muestras (radio). */
export function SelectorColor({ value, onChange }: { value: string; onChange: (c: ColorEtiqueta) => void }) {
  return (
    <div role="radiogroup" aria-label="Color" className="flex flex-wrap gap-1.5">
      {COLORES_ETIQUETA.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={NOMBRE_COLOR[c]}
          title={NOMBRE_COLOR[c]}
          onClick={() => onChange(c)}
          className={cn(
            "size-6 cursor-pointer rounded-full ring-offset-2 ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            puntoColor(c),
            value === c && "ring-2 ring-foreground",
          )}
        />
      ))}
    </div>
  );
}

/** Crear, renombrar, cambiar de color y eliminar etiquetas de gerentes. */
export function EtiquetasDialog({ open, onOpenChange }: Props) {
  const { data } = useData((db) => listEtiquetas(db), []);
  const [editando, setEditando] = useState<number | null>(null);
  const [draft, setDraft] = useState<EtiquetaDraft>(VACIO);
  const [errors, setErrors] = useState<Partial<Record<keyof EtiquetaDraft, string>>>({});
  const [saving, setSaving] = useState(false);
  const [borrar, setBorrar] = useState<EtiquetaConUso | null>(null);

  useEffect(() => {
    if (open) cancelar();
  }, [open]);

  function cancelar() {
    setEditando(null);
    setDraft(VACIO);
    setErrors({});
  }

  function editar(e: EtiquetaConUso) {
    setEditando(e.id);
    setDraft({ nombre: e.nombre, color: e.color });
    setErrors({});
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    ev.stopPropagation();
    const r = validateEtiqueta(draft);
    if (!r.ok) return setErrors(r.errors);
    setSaving(true);
    try {
      const db = await getDb();
      if (editando) await updateEtiqueta(db, editando, r.value);
      else await createEtiqueta(db, r.value);
      toast.success(editando ? "Etiqueta actualizada" : "Etiqueta creada");
      invalidate();
      cancelar();
    } catch (e) {
      reportError(e);
    } finally {
      setSaving(false);
    }
  }

  async function confirmarBorrar() {
    if (!borrar) return;
    try {
      await deleteEtiqueta(await getDb(), borrar.id);
      toast.success("Etiqueta eliminada");
      if (editando === borrar.id) cancelar();
      invalidate();
    } catch (e) {
      reportError(e);
    } finally {
      setBorrar(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Etiquetas</DialogTitle>
          <DialogDescription>Sirven para agrupar gerentes y filtrar la lista.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-3 rounded-lg border p-3">
          <div className="grid gap-1.5">
            <Label htmlFor="et-nombre">{editando ? "Editar etiqueta" : "Nueva etiqueta"}</Label>
            <Input
              id="et-nombre"
              value={draft.nombre}
              maxLength={MAX_NOMBRE_ETIQUETA}
              placeholder="Ej.: Zona centro, VIP…"
              onChange={(e) => setDraft({ ...draft, nombre: e.target.value })}
            />
            {errors.nombre && <p className="text-sm text-destructive">{errors.nombre}</p>}
          </div>
          <SelectorColor value={draft.color} onChange={(color) => setDraft({ ...draft, color })} />
          {errors.color && <p className="text-sm text-destructive">{errors.color}</p>}
          <div className="flex items-center justify-between gap-2">
            {draft.nombre.trim() && validateEtiqueta(draft).ok ? (
              <EtiquetaChip nombre={draft.nombre.trim()} color={draft.color as ColorEtiqueta} />
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              {editando && (
                <Button type="button" variant="outline" size="sm" onClick={cancelar}>
                  Cancelar
                </Button>
              )}
              <Button type="submit" size="sm" disabled={saving}>
                {editando ? "Guardar" : "Crear"}
              </Button>
            </div>
          </div>
        </form>
        <div className="-mx-1 max-h-72 overflow-y-auto px-1">
          {data?.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Todavía no hay etiquetas.</p>}
          <ul className="divide-y">
            {data?.map((e) => (
              <li key={e.id} className={cn("flex items-center gap-2 py-1.5", editando === e.id && "opacity-50")}>
                <EtiquetaChip nombre={e.nombre} color={e.color} />
                <span className="text-xs text-muted-foreground">{e.gerentes === 1 ? "1 gerente" : `${e.gerentes} gerentes`}</span>
                <Button className="ml-auto" size="icon-sm" variant="ghost" aria-label={`Editar ${e.nombre}`} onClick={() => editar(e)}>
                  <Pencil />
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label={`Eliminar ${e.nombre}`} onClick={() => setBorrar(e)}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </DialogContent>
      <ConfirmDialog
        open={borrar !== null}
        onOpenChange={(o) => !o && setBorrar(null)}
        title="Eliminar etiqueta"
        description={
          borrar
            ? `Se quitará "${borrar.nombre}"${borrar.gerentes > 0 ? ` de ${borrar.gerentes} gerente(s)` : ""}. Los gerentes no se eliminan.`
            : ""
        }
        confirmLabel="Eliminar"
        destructive
        onConfirm={confirmarBorrar}
      />
    </Dialog>
  );
}
