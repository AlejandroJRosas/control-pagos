import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MontoInput } from "@/components/MontoInput";
import { Field } from "@/components/Field";
import { BuscadorSelect } from "@/components/BuscadorSelect";
import { getDb } from "@/db";
import { setJefeAsignacion, updateSaldoAsignacion } from "@/db/repos/asignaciones";
import { descendientes, type Jefes } from "@/domain/arbol";
import { validateSaldo } from "@/domain/validation";
import { toInputVE } from "@/domain/money";
import { invalidate } from "@/hooks/useData";
import { reportError } from "@/lib/reportError";
import { useDialogoSinGuardar } from "@/hooks/useAvisoSinGuardar";

export type AsignacionEditable = { id: number; gerenteNombre: string; saldoUsd: string; jefeId: number | null };

type Props = {
  asignacion: AsignacionEditable | null;
  /** Los gerentes de la campaña (asignación y nombre): de ahí sale el jefe. */
  companeros: { id: number; gerenteNombre: string }[];
  jefes: Jefes;
  onOpenChange: (open: boolean) => void;
};

/** Edita el saldo a pagar y el jefe de un gerente en la campaña (agregar gerentes: `AgregarGerentesDialog`). */
export function AsignacionFormDialog({ asignacion, companeros, jefes, onOpenChange }: Props) {
  const [saldo, setSaldo] = useState("");
  const [jefe, setJefe] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const jefeOriginal = asignacion?.jefeId == null ? "" : String(asignacion.jefeId);
  const aviso = useDialogoSinGuardar(asignacion !== null && (saldo !== toInputVE(asignacion.saldoUsd) || jefe !== jefeOriginal), onOpenChange);
  const opciones = useMemo(() => {
    if (!asignacion) return [];
    const excluidos = new Set([asignacion.id, ...descendientes(jefes, asignacion.id)]);
    return [
      { value: "", label: "Sin jefe" },
      ...companeros.filter((c) => !excluidos.has(c.id)).map((c) => ({ value: String(c.id), label: c.gerenteNombre })),
    ];
  }, [asignacion, companeros, jefes]);

  useEffect(() => {
    if (!asignacion) return;
    setSaldo(toInputVE(asignacion.saldoUsd));
    setJefe(asignacion.jefeId === null ? "" : String(asignacion.jefeId));
    setError(undefined);
  }, [asignacion]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!asignacion) return;
    const r = validateSaldo(saldo);
    if (!r.ok) return setError(r.errors.saldoUsd);
    setSaving(true);
    try {
      const db = await getDb();
      if (saldo !== toInputVE(asignacion.saldoUsd)) await updateSaldoAsignacion(db, asignacion.id, r.value);
      if (jefe !== jefeOriginal) await setJefeAsignacion(db, asignacion.id, jefe === "" ? null : Number(jefe));
      toast.success("Gerente actualizado");
      invalidate();
      onOpenChange(false);
    } catch (err) {
      reportError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={asignacion !== null} onOpenChange={aviso.onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Editar a {asignacion?.gerenteNombre} en la campaña</DialogTitle>
          </DialogHeader>
          <Field id="a-saldo" label="Saldo a pagar (USD)" error={error} hint="Ej. 1.500,00">
            <MontoInput
              id="a-saldo"
              autoFocus
              className="text-right tabular-nums"
              value={saldo}
              onChange={setSaldo}
            />
          </Field>
          <Field id="a-jefe" label="Jefe" hint="Quién responde por él en esta campaña">
            <BuscadorSelect id="a-jefe" value={jefe} onChange={setJefe} opciones={opciones} placeholder="Sin jefe" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => aviso.onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
        {aviso.dialogo}
      </DialogContent>
    </Dialog>
  );
}
