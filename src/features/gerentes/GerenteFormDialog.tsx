import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/Field";
import { EtiquetaChip } from "@/components/EtiquetaChip";
import { getDb } from "@/db";
import { createGerente, updateGerente, type Gerente } from "@/db/repos/gerentes";
import { etiquetasDeGerente, listEtiquetas, setEtiquetasGerente } from "@/db/repos/etiquetas";
import { validateGerente, type GerenteDraft } from "@/domain/validation";
import { invalidate, useData } from "@/hooks/useData";
import { reportError } from "@/lib/reportError";

type Props = { gerente: Gerente | null; open: boolean; onOpenChange: (open: boolean) => void };

export function GerenteFormDialog({ gerente, open, onOpenChange }: Props) {
  const [draft, setDraft] = useState<GerenteDraft>({ nombre: "", telefono: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof GerenteDraft, string>>>({});
  const [saving, setSaving] = useState(false);
  const [etiquetas, setEtiquetas] = useState<number[]>([]);
  const { data: todas } = useData((db) => listEtiquetas(db), []);

  useEffect(() => {
    if (!open) return;
    setDraft({ nombre: gerente?.nombre ?? "", telefono: gerente?.telefono ?? "" });
    setErrors({});
    setEtiquetas([]);
    if (!gerente) return;
    let vigente = true;
    getDb()
      .then((db) => etiquetasDeGerente(db, gerente.id))
      .then((ids) => vigente && setEtiquetas(ids))
      .catch(reportError);
    return () => {
      vigente = false;
    };
  }, [open, gerente]);

  const alternar = (id: number) => setEtiquetas((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const r = validateGerente(draft);
    if (!r.ok) return setErrors(r.errors);
    setSaving(true);
    try {
      const db = await getDb();
      let id = gerente?.id;
      if (id) await updateGerente(db, id, r.value);
      else id = await createGerente(db, r.value);
      await setEtiquetasGerente(db, id, etiquetas);
      toast.success(gerente ? "Gerente actualizado" : "Gerente creado");
      invalidate();
      onOpenChange(false);
    } catch (err) {
      reportError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{gerente ? "Editar gerente" : "Nuevo gerente"}</DialogTitle>
          </DialogHeader>
          <Field id="g-nombre" label="Nombre" error={errors.nombre}>
            <Input id="g-nombre" autoFocus value={draft.nombre} onChange={(e) => setDraft({ ...draft, nombre: e.target.value })} />
          </Field>
          <Field id="g-tel" label="Teléfono (opcional)">
            <Input id="g-tel" value={draft.telefono} onChange={(e) => setDraft({ ...draft, telefono: e.target.value })} />
          </Field>
          {todas && todas.length > 0 && (
            <div className="grid gap-1.5">
              <Label>Etiquetas</Label>
              <div className="flex flex-wrap gap-1.5">
                {todas.map((e) => (
                  <EtiquetaChip key={e.id} nombre={e.nombre} color={e.color} activo={etiquetas.includes(e.id)} onClick={() => alternar(e.id)} />
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
