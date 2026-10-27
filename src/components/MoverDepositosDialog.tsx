import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/Field";
import { BuscadorSelect } from "@/components/BuscadorSelect";
import { getDb } from "@/db";
import { moverDepositos } from "@/db/operaciones/moverDepositos";
import { destinosPara } from "@/domain/moverDepositos";
import { invalidate } from "@/hooks/useData";
import { avisarDepositosMovidos } from "@/lib/deshacer";
import { reportError } from "@/lib/reportError";

export type AsignacionDestino = { id: number; gerenteNombre: string; jefeId: number | null };

type Props = {
  /** Los depósitos a mover y de qué gerentes (asignaciones) vienen; null = cerrado. */
  mover: { ids: number[]; origenes: number[] } | null;
  /** Los gerentes de la campaña, con su jefe. */
  asignaciones: AsignacionDestino[];
  onOpenChange: (open: boolean) => void;
  onMovidos?: (ids: number[]) => void;
};

/** Pasa depósitos a otro gerente de la misma campaña: primero aparece la gente de la estructura de quien los tenía. */
export function MoverDepositosDialog({ mover, asignaciones, onOpenChange, onMovidos }: Props) {
  const [destino, setDestino] = useState("");
  const [saving, setSaving] = useState(false);
  const opciones = useMemo(
    () =>
      mover
        ? destinosPara(asignaciones, mover.origenes).map((d) => ({ value: String(d.id), label: d.gerenteNombre, detalle: d.equipo ? "De su equipo" : undefined }))
        : [],
    [mover, asignaciones],
  );
  useEffect(() => setDestino(""), [mover]);
  const n = mover?.ids.length ?? 0;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!mover || !destino) return;
    setSaving(true);
    try {
      const movidos = await moverDepositos(await getDb(), mover.ids, Number(destino));
      avisarDepositosMovidos(movidos, opciones.find((o) => o.value === destino)?.label ?? "");
      onMovidos?.(mover.ids);
      invalidate();
      onOpenChange(false);
    } catch (err) {
      reportError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={mover !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{n === 1 ? "Mover el depósito a otro gerente" : `Mover ${n} depósitos a otro gerente`}</DialogTitle>
            <DialogDescription>Se pasan a otro gerente de esta campaña y los saldos se recalculan. Podrás deshacerlo desde el aviso.</DialogDescription>
          </DialogHeader>
          <Field id="mover-destino" label="Gerente">
            <BuscadorSelect id="mover-destino" value={destino} onChange={setDestino} opciones={opciones} placeholder="Buscar gerente…" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !destino}>
              {saving ? "Moviendo…" : "Mover"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
