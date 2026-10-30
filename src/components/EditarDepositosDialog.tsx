import { useEffect, useMemo, useState, type FormEvent } from "react";
import Decimal from "decimal.js";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/Field";
import { BuscadorTexto } from "@/components/BuscadorTexto";
import { FechaInput } from "@/components/FechaInput";
import { BotonConMotivo } from "@/components/BotonConMotivo";
import { getDb } from "@/db";
import { editarDepositos } from "@/db/operaciones/editarDepositos";
import { listBancosUsados, listCuentasDestinoUsadas } from "@/db/repos/depositos";
import { getTasaParaFecha } from "@/db/repos/tasas";
import { sugerenciasBancos } from "@/domain/bancos";
import { totalUsdConTasa, type DepositoCalculado } from "@/domain/campanaView";
import { formatFecha, isValidIsoDate } from "@/domain/dates";
import { formatUsd } from "@/domain/money";
import { invalidate, useData } from "@/hooks/useData";
import { useDialogoSinGuardar } from "@/hooks/useAvisoSinGuardar";
import { avisarDepositosEditados } from "@/lib/deshacer";
import { reportError } from "@/lib/reportError";
import { cn } from "@/lib/utils";

type Props = {
  /** Los depósitos a editar; null = cerrado. */
  depositos: DepositoCalculado[] | null;
  onOpenChange: (open: boolean) => void;
};

/** Cambia la cuenta destino, el banco o la fecha de varios depósitos a la vez, o les agrega una nota. Solo cambia lo que se llena. */
export function EditarDepositosDialog({ depositos, onOpenChange }: Props) {
  const [cuenta, setCuenta] = useState("");
  const [banco, setBanco] = useState("");
  const [fecha, setFecha] = useState("");
  const [nota, setNota] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setCuenta("");
    setBanco("");
    setFecha("");
    setNota("");
  }, [depositos]);
  const sucio = depositos !== null && [cuenta, banco, fecha, nota].some((v) => v.trim() !== "");
  const aviso = useDialogoSinGuardar(sucio, onOpenChange);
  const abierto = depositos !== null;
  const { data: sugerencias } = useData(
    async (db) => (abierto ? { bancos: sugerenciasBancos(await listBancosUsados(db)), cuentas: (await listCuentasDestinoUsadas(db)).filter(Boolean) } : null),
    [abierto],
  );
  const fechaOk = isValidIsoDate(fecha);
  const { data: tasa, loading: cargandoTasa } = useData(async (db) => (fechaOk ? getTasaParaFecha(db, fecha) : null), [fechaOk, fecha]);
  const usd = useMemo(() => {
    if (!depositos || !tasa) return null;
    const antes = depositos.reduce((acc, d) => acc.plus(d.usd), new Decimal(0)).toFixed(2);
    return { antes, despues: totalUsdConTasa(depositos, tasa.valor) };
  }, [depositos, tasa]);
  const sinTasa = fechaOk && !cargandoTasa && !tasa;
  const n = depositos?.length ?? 0;
  const motivo = !sucio
    ? "Escribe al menos un cambio"
    : fecha && !fechaOk
      ? "La fecha no es válida"
      : sinTasa
        ? `No hay tasa para el ${formatFecha(fecha)}`
        : undefined;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!depositos || motivo) return;
    setSaving(true);
    try {
      const editados = await editarDepositos(
        await getDb(),
        depositos.map((d) => d.id),
        { cuentaDestino: cuenta, banco, fecha, nota },
      );
      avisarDepositosEditados(editados);
      invalidate();
      onOpenChange(false);
    } catch (err) {
      reportError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={aviso.onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{n === 1 ? "Editar el depósito" : `Editar ${n} depósitos`}</DialogTitle>
            <DialogDescription>Solo cambia lo que llenes; lo demás queda como está. Podrás deshacerlo desde el aviso.</DialogDescription>
          </DialogHeader>
          <Field id="lote-cuenta" label="Cuenta destino">
            <BuscadorTexto id="lote-cuenta" value={cuenta} onChange={setCuenta} sugerencias={sugerencias?.cuentas ?? []} placeholder="Sin cambios" />
          </Field>
          <Field id="lote-banco" label="Banco" hint="Si es un banco conocido, la app recuerda el nombre viejo como ese banco (también en próximas importaciones).">
            <BuscadorTexto id="lote-banco" value={banco} onChange={setBanco} sugerencias={sugerencias?.bancos ?? []} placeholder="Sin cambios" />
          </Field>
          <Field id="lote-fecha" label="Fecha" hint="Toma la tasa de la nueva fecha: cambian los USD y los saldos.">
            <FechaInput id="lote-fecha" value={fecha} onChange={setFecha} />
          </Field>
          {fechaOk && (
            <p className={cn("-mt-2 text-sm", sinTasa ? "text-destructive" : "text-muted-foreground")} role="status">
              {sinTasa
                ? `No hay tasa para el ${formatFecha(fecha)}: cárgala primero en Tasas.`
                : usd && `Total en USD de los marcados: ${formatUsd(usd.antes)} → ${formatUsd(usd.despues)}`}
            </p>
          )}
          <Field id="lote-nota" label="Agregar a las observaciones" hint="Se agrega en una línea nueva; no borra lo que ya tengan.">
            <Textarea id="lote-nota" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => aviso.onOpenChange(false)}>
              Cancelar
            </Button>
            <BotonConMotivo motivo={saving ? undefined : motivo}>
              <Button type="submit" disabled={saving || !!motivo}>
                {saving ? "Guardando…" : n === 1 ? "Guardar" : `Guardar en ${n}`}
              </Button>
            </BotonConMotivo>
          </DialogFooter>
        </form>
        {aviso.dialogo}
      </DialogContent>
    </Dialog>
  );
}
