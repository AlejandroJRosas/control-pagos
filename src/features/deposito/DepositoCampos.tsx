import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { FechaInput } from "@/components/FechaInput";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Aviso } from "@/components/Feedback";
import { Field } from "@/components/Field";
import { DestinoGerente } from "@/components/DestinoGerente";
import { BuscadorTexto } from "@/components/BuscadorTexto";
import type { AsignacionDetalle } from "@/db/repos/asignaciones";
import type { Gerente } from "@/db/repos/gerentes";
import type { CampanaData } from "@/db/queries/campanaData";
import { fechaDeTasa, formatFecha, isValidIsoDate, nombreDia } from "@/domain/dates";
import { useFeriados } from "@/hooks/useFeriados";
import { MontoInput } from "@/components/MontoInput";
import { formatBs, formatTasa, formatUsd, parseMonto, toInputVE } from "@/domain/money";
import { cn } from "@/lib/utils";
import { confClass } from "@/lib/confianza";
import { irA, SELECTOR_ERROR } from "@/lib/irAError";
import { TasaFormDialog } from "@/features/tasas/TasaFormDialog";
import type { DepositoForm } from "./useDepositoForm";
import { DuplicadoBloqueo, type AccionesDuplicado } from "./DuplicadoBloqueo";

type Props = {
  f: DepositoForm;
  data: CampanaData;
  /** Con asignación fija no se elige gerente. */
  asignacion: AsignacionDetalle | null;
  gerentes: Gerente[];
  bancos: string[];
  disabled: boolean;
  avisosExtra?: ReactNode;
  /** Avisa cuando se abre o cierra el diálogo de "Registrar tasa" (para no pegar imágenes detrás). */
  onTasaDialog?: (open: boolean) => void;
  /** Al registrar uno nuevo: un duplicado no se guarda, se actualiza el existente o se descarta. Sin esto (al editar), solo se avisa. */
  duplicado?: AccionesDuplicado;
};

/** Campos del depósito, saldos en vivo y avisos; compartido por el registro individual y la revisión en lote. */
export function DepositoCampos({ f, data, asignacion, gerentes, bancos, disabled, avisosExtra, onTasaDialog, duplicado }: Props) {
  const [tasaDialog, setTasaDialogState] = useState(false);
  const setTasaDialog = (open: boolean) => {
    setTasaDialogState(open);
    onTasaDialog?.(open);
  };
  const { form, set, tasa, errors, duplicados } = f;
  const draft = form.draft;
  const { usd, restanteGerente, restanteGeneral } = f.calculo;
  const fechaValida = isValidIsoDate(draft.fecha);
  const feriados = useFeriados();
  // Día cuya tasa rige: sábado, domingo y feriados usan la del siguiente día hábil.
  const fechaTasa = fechaValida ? fechaDeTasa(draft.fecha, feriados) : draft.fecha;
  const motivo = feriados.has(draft.fecha) ? "Feriado: " : "";
  // En pantallas chicas el campo con error puede quedar fuera de la vista: al intentar guardar se va a él.
  const camposRef = useRef<HTMLFieldSetElement>(null);
  useEffect(() => {
    if (f.intentosFallidos > 0) irA(camposRef.current, SELECTOR_ERROR);
  }, [f.intentosFallidos]);

  return (
    <>
      {duplicado && duplicados.length > 0 && <DuplicadoBloqueo duplicados={duplicados} acciones={duplicado} />}
      <fieldset ref={camposRef} disabled={disabled} className="grid gap-4">
        {!asignacion && (
          <DestinoGerente id="d-destino" asignaciones={data.asignaciones} gerentes={gerentes} value={form.destino} errors={f.destinoErrors} onChange={f.setDestino} />
        )}
        <div className="grid grid-cols-2 gap-4">
          <Field id="d-fecha" label="Fecha" error={errors.fecha}>
            <FechaInput id="d-fecha" className={confClass(form.auto.confianza.fecha)} value={draft.fecha} onChange={(v) => set("fecha", v)} />
          </Field>
          <Field id="d-tasa" label="Tasa del día" error={errors.tasaId}>
            <div id="d-tasa" className="flex h-8 items-center gap-2 text-sm">
              {tasa === undefined ? (
                <span className="text-muted-foreground">Buscando…</span>
              ) : tasa ? (
                <span className="font-medium tabular-nums">
                  {formatTasa(tasa.valor)} Bs/USD
                  {tasa.fecha !== draft.fecha && (
                    <span className="ml-1 font-normal text-muted-foreground">
                      ({motivo}la del {nombreDia(tasa.fecha)} {formatFecha(tasa.fecha)})
                    </span>
                  )}
                </span>
              ) : (
                <>
                  <span className="text-amber-700 dark:text-amber-400">
                    {!fechaValida
                      ? "Elige una fecha"
                      : fechaTasa !== draft.fecha
                        ? `${motivo ? "Feriado: sin" : "Sin"} tasa del ${nombreDia(fechaTasa)} ${formatFecha(fechaTasa)}`
                        : `Sin tasa para el ${formatFecha(draft.fecha)}`}
                  </span>
                  <Button type="button" size="sm" variant="outline" disabled={!fechaValida} onClick={() => setTasaDialog(true)}>
                    Registrar tasa
                  </Button>
                </>
              )}
            </div>
          </Field>
        </div>
        <Field id="d-banco" label="Banco de origen" error={errors.banco}>
          <BuscadorTexto
            id="d-banco"
            className={confClass(form.auto.confianza.banco)}
            value={draft.banco}
            onChange={(v) => set("banco", v)}
            sugerencias={bancos}
            disabled={disabled}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field id="d-ref" label="Referencia bancaria" error={errors.referencia}>
            <Input
              id="d-ref"
              className={cn("font-mono", confClass(form.auto.confianza.referencia))}
              value={draft.referencia}
              onChange={(e) => set("referencia", e.target.value)}
            />
          </Field>
          <Field id="d-monto" label="Monto en Bs" error={errors.montoBs} hint="Ej. 1.234.567,89">
            <MontoInput
              id="d-monto"
              className={cn("text-right tabular-nums", confClass(form.auto.confianza.montoBs))}
              value={draft.montoBs}
              onChange={(v) => set("montoBs", v)}
              onBlur={() => {
                const m = parseMonto(draft.montoBs);
                if (m) f.setForm((s) => ({ ...s, draft: { ...s.draft, montoBs: toInputVE(m) } }));
              }}
            />
          </Field>
        </div>
        <Field id="d-cuenta" label="Cuenta destino" error={errors.cuentaDestino}>
          <Input
            id="d-cuenta"
            className={cn("font-mono", confClass(form.auto.confianza.cuentaDestino))}
            value={draft.cuentaDestino}
            onChange={(e) => set("cuentaDestino", e.target.value)}
          />
        </Field>
        <Field id="d-obs" label="Observaciones">
          <Textarea id="d-obs" rows={1} className="min-h-8" value={draft.observaciones} onChange={(e) => set("observaciones", e.target.value)} />
        </Field>

        <Card className="py-4">
          <CardContent className="grid grid-cols-3 gap-4 px-4 text-center text-sm">
            <div>
              <div className="text-muted-foreground">Dólares</div>
              <div className="text-lg font-semibold tabular-nums">{usd ? formatUsd(usd) : "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Saldo del gerente después</div>
              <div className={cn("text-lg font-semibold tabular-nums", restanteGerente?.isNegative() && "text-destructive")}>
                {restanteGerente ? formatUsd(restanteGerente) : "—"}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Saldo general después</div>
              <div className="text-lg font-semibold tabular-nums">{formatUsd(restanteGeneral)}</div>
            </div>
          </CardContent>
        </Card>

        {!duplicado && duplicados.length > 0 && (
          <Aviso tono="warning">
            Ya existe un depósito con este banco y esta referencia:
            <ul className="mt-1 list-disc pl-4">
              {duplicados.map((d) => (
                <li key={d.id}>
                  {formatFecha(d.fecha)} · {d.gerenteNombre} · {d.campanaNombre} · {formatBs(d.montoBs)}
                </li>
              ))}
            </ul>
          </Aviso>
        )}
        {avisosExtra}
        {usd && restanteGerente?.isNegative() && <Aviso tono="warning">Con este depósito el gerente pagaría {formatUsd(restanteGerente.abs())} de más.</Aviso>}
      </fieldset>

      <TasaFormDialog
        tasa={null}
        fechaFija={fechaTasa}
        open={tasaDialog}
        onOpenChange={setTasaDialog}
        onSaved={f.setTasa}
      />
    </>
  );
}
