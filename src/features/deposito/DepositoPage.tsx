import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import Decimal from "decimal.js";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { Aviso, Cargando } from "@/components/Feedback";
import { Field } from "@/components/Field";
import { ImageDrop } from "@/components/ImageDrop";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { getDb } from "@/db";
import { getAsignacion, type AsignacionDetalle } from "@/db/repos/asignaciones";
import {
  createDeposito,
  deleteDeposito,
  findDuplicados,
  getDeposito,
  listBancosUsados,
  updateDeposito,
  type Deposito,
  type Duplicado,
} from "@/db/repos/depositos";
import { getTasaByFecha, type Tasa } from "@/db/repos/tasas";
import { loadCampanaData, type CampanaData } from "@/db/queries/campanaData";
import { buildCampanaView } from "@/domain/campanaView";
import { formatFecha, isValidIsoDate, todayIso } from "@/domain/dates";
import { DomainError } from "@/domain/errors";
import { formatBs, formatTasa, formatUsd, parseMonto, toInputVE, toUsd } from "@/domain/money";
import { validateDeposito, type DepositoDraft } from "@/domain/validation";
import { extractor, type ExtractableField, type ExtractedField, type ExtractionResult } from "@/extraction/extractor";
import { persistImagen, type ImagenValue } from "@/platform/images";
import { invalidate, useData } from "@/hooks/useData";
import { reportError } from "@/lib/reportError";
import { cn } from "@/lib/utils";
import { TasaFormDialog } from "@/features/tasas/TasaFormDialog";
import { sugerenciasBancos } from "./bancos";

type Ctx = { deposito: Deposito | null; asignacion: AsignacionDetalle; data: CampanaData; bancos: string[] };

const vacio = (fecha: string): DepositoDraft => ({
  fecha,
  banco: "",
  referencia: "",
  cuentaDestino: "",
  montoBs: "",
  tasaId: null,
  observaciones: "",
});

export function DepositoPage() {
  const { depositoId, asignacionId } = useParams();
  const { data: ctx, error } = useData<Ctx>(
    async (db) => {
      const deposito = depositoId ? await getDeposito(db, Number(depositoId)) : null;
      if (depositoId && !deposito) throw new DomainError("NO_ENCONTRADO", "El depósito no existe");
      const asignacion = await getAsignacion(db, deposito?.asignacionId ?? Number(asignacionId));
      if (!asignacion) throw new DomainError("NO_ENCONTRADO", "El gerente no está en esta campaña");
      const data = await loadCampanaData(db, asignacion.campanaId);
      return { deposito, asignacion, data, bancos: sugerenciasBancos(await listBancosUsados(db)) };
    },
    [depositoId, asignacionId],
  );

  if (!ctx) return <Cargando error={error} />;
  return <DepositoForm key={`${depositoId ?? "nuevo"}-${asignacionId ?? ""}`} {...ctx} />;
}

function confClass(c: number | undefined): string {
  if (c === undefined) return "";
  if (c >= 0.9) return "border-green-500";
  if (c >= 0.6) return "border-amber-500 bg-amber-50";
  return "border-red-500 bg-red-50";
}

function DepositoForm({ deposito, asignacion, data, bancos }: Ctx) {
  const navigate = useNavigate();
  const cerrada = asignacion.campanaEstado === "cerrada";
  const [draft, setDraft] = useState<DepositoDraft>(() =>
    deposito
      ? {
          fecha: deposito.fecha,
          banco: deposito.banco,
          referencia: deposito.referencia,
          cuentaDestino: deposito.cuentaDestino,
          montoBs: toInputVE(deposito.montoBs),
          tasaId: deposito.tasaId,
          observaciones: deposito.observaciones ?? "",
        }
      : vacio(todayIso()),
  );
  const [imagen, setImagen] = useState<ImagenValue>(deposito?.imagenPath ? { kind: "stored", path: deposito.imagenPath } : null);
  const [tasa, setTasa] = useState<Tasa | null | undefined>(undefined); // undefined = buscando
  const [tasaDialog, setTasaDialog] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof DepositoDraft, string>>>({});
  const [duplicados, setDuplicados] = useState<Duplicado[]>([]);
  const [confianza, setConfianza] = useState<Partial<Record<ExtractableField, number>>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // La tasa siempre es la de la fecha del depósito.
  useEffect(() => {
    let alive = true;
    setTasa(undefined);
    if (!isValidIsoDate(draft.fecha)) {
      setTasa(null);
      setDraft((d) => ({ ...d, tasaId: null }));
      return;
    }
    getDb()
      .then((db) => getTasaByFecha(db, draft.fecha))
      .then((t) => {
        if (!alive) return;
        setTasa(t);
        setDraft((d) => ({ ...d, tasaId: t?.id ?? null }));
      })
      .catch(reportError);
    return () => {
      alive = false;
    };
  }, [draft.fecha]);

  // Aviso de referencia duplicada.
  useEffect(() => {
    const banco = draft.banco.trim();
    const ref = draft.referencia.trim();
    if (!banco || !ref) {
      setDuplicados([]);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      getDb()
        .then((db) => findDuplicados(db, banco, ref, deposito?.id))
        .then((r) => {
          if (alive) setDuplicados(r);
        })
        .catch(reportError);
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [draft.banco, draft.referencia, deposito?.id]);

  // Cálculos en vivo, excluyendo este mismo depósito si se está editando.
  const view = useMemo(
    () => buildCampanaView(data.asignaciones, data.depositos.filter((d) => d.id !== deposito?.id)),
    [data, deposito?.id],
  );
  const resumenGerente = view.gerentes.find((g) => g.asignacionId === asignacion.id);
  const monto = parseMonto(draft.montoBs);
  const usd = monto && tasa && new Decimal(monto).gt(0) ? toUsd(monto, tasa.valor) : null;
  const restanteGerente = new Decimal(resumenGerente?.restante ?? 0).minus(usd ?? 0);
  const restanteGeneral = new Decimal(view.total.restante).minus(usd ?? 0);

  function set<K extends keyof DepositoDraft>(k: K, v: DepositoDraft[K]) {
    setDraft((d) => ({ ...d, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
    setConfianza((c) => {
      const next = { ...c };
      delete next[k as ExtractableField];
      return next;
    });
  }

  function applyExtraction(r: ExtractionResult) {
    const next = { ...draft };
    const conf: Partial<Record<ExtractableField, number>> = {};
    for (const [k, f] of Object.entries(r.fields) as [ExtractableField, ExtractedField | undefined][]) {
      if (f && !next[k].trim()) {
        next[k] = f.value;
        conf[k] = f.confidence;
      }
    }
    setDraft(next);
    setConfianza(conf);
  }

  async function onImagen(v: ImagenValue) {
    setImagen(v);
    if (v?.kind !== "new") return;
    try {
      applyExtraction(await extractor.extract(v.file));
    } catch (e) {
      reportError(e, "Lectura del comprobante");
    }
  }

  async function guardar(yNuevo: boolean) {
    const r = validateDeposito(draft);
    if (!r.ok) return setErrors(r.errors);
    setSaving(true);
    try {
      const db = await getDb();
      const v = { ...r.value, imagenPath: await persistImagen(imagen) };
      if (deposito) await updateDeposito(db, deposito.id, v);
      else await createDeposito(db, asignacion.id, v);
      toast.success(deposito ? "Depósito actualizado" : "Depósito registrado");
      if (yNuevo) {
        if (imagen?.kind === "new") URL.revokeObjectURL(imagen.previewUrl);
        setDraft((d) => ({ ...vacio(d.fecha), tasaId: d.tasaId }));
        setImagen(null);
        setConfianza({});
        setDuplicados([]);
        invalidate();
      } else {
        navigate(`/asignaciones/${asignacion.id}`);
        invalidate();
      }
    } catch (e) {
      reportError(e);
    } finally {
      setSaving(false);
    }
  }

  async function eliminar() {
    if (!deposito) return;
    try {
      await deleteDeposito(await getDb(), deposito.id);
      toast.success("Depósito eliminado");
      navigate(`/asignaciones/${asignacion.id}`, { replace: true });
      invalidate();
    } catch (e) {
      reportError(e);
      setConfirmDelete(false);
    }
  }

  const fechaValida = isValidIsoDate(draft.fecha);

  return (
    <div className="space-y-4">
      <PageHeader
        back={{ to: `/asignaciones/${asignacion.id}`, label: asignacion.gerenteNombre }}
        title={deposito ? "Editar depósito" : "Registrar depósito"}
        subtitle={`${asignacion.gerenteNombre} · ${asignacion.campanaNombre}`}
        actions={
          deposito && !cerrada ? (
            <Button variant="outline" className="text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 />
              Eliminar
            </Button>
          ) : null
        }
      />
      {cerrada && <Aviso>La campaña está cerrada: el depósito no se puede modificar.</Aviso>}

      <div className="grid grid-cols-2 gap-6">
        <ImageDrop
          label="Comprobante"
          value={imagen}
          onChange={onImagen}
          pasteEnabled={!tasaDialog}
          disabled={cerrada}
          className="h-[calc(100vh-11rem)] min-h-96"
        />

        <form
          className="grid content-start gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void guardar(false);
          }}
        >
          <fieldset disabled={cerrada || saving} className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <Field id="d-fecha" label="Fecha" error={errors.fecha}>
                <Input id="d-fecha" type="date" className={confClass(confianza.fecha)} value={draft.fecha} onChange={(e) => set("fecha", e.target.value)} />
              </Field>
              <Field id="d-tasa" label="Tasa del día" error={errors.tasaId}>
                <div id="d-tasa" className="flex h-8 items-center gap-2 text-sm">
                  {tasa === undefined ? (
                    <span className="text-muted-foreground">Buscando…</span>
                  ) : tasa ? (
                    <span className="font-medium tabular-nums">{formatTasa(tasa.valor)} Bs/USD</span>
                  ) : (
                    <>
                      <span className="text-amber-700">{fechaValida ? `Sin tasa para el ${formatFecha(draft.fecha)}` : "Elige una fecha"}</span>
                      <Button type="button" size="sm" variant="outline" disabled={!fechaValida} onClick={() => setTasaDialog(true)}>
                        Registrar tasa
                      </Button>
                    </>
                  )}
                </div>
              </Field>
            </div>
            <Field id="d-banco" label="Banco de origen" error={errors.banco}>
              <Input id="d-banco" list="bancos" className={confClass(confianza.banco)} value={draft.banco} onChange={(e) => set("banco", e.target.value)} />
              <datalist id="bancos">
                {bancos.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field id="d-ref" label="Referencia bancaria" error={errors.referencia}>
                <Input
                  id="d-ref"
                  className={cn("font-mono", confClass(confianza.referencia))}
                  value={draft.referencia}
                  onChange={(e) => set("referencia", e.target.value)}
                />
              </Field>
              <Field id="d-monto" label="Monto en Bs" error={errors.montoBs} hint="Ej. 1.234.567,89">
                <Input
                  id="d-monto"
                  inputMode="decimal"
                  className={cn("text-right tabular-nums", confClass(confianza.montoBs))}
                  value={draft.montoBs}
                  onChange={(e) => set("montoBs", e.target.value)}
                  onBlur={() => {
                    const m = parseMonto(draft.montoBs);
                    if (m) setDraft((d) => ({ ...d, montoBs: toInputVE(m) }));
                  }}
                />
              </Field>
            </div>
            <Field id="d-cuenta" label="Cuenta destino" error={errors.cuentaDestino}>
              <Input
                id="d-cuenta"
                className={cn("font-mono", confClass(confianza.cuentaDestino))}
                value={draft.cuentaDestino}
                onChange={(e) => set("cuentaDestino", e.target.value)}
              />
            </Field>
            <Field id="d-obs" label="Observaciones">
              <Textarea id="d-obs" rows={3} value={draft.observaciones} onChange={(e) => set("observaciones", e.target.value)} />
            </Field>

            <Card className="py-4">
              <CardContent className="grid grid-cols-3 gap-4 px-4 text-sm">
                <div>
                  <div className="text-muted-foreground">Dólares</div>
                  <div className="text-lg font-semibold tabular-nums">{usd ? formatUsd(usd) : "—"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Saldo del gerente después</div>
                  <div className={cn("text-lg font-semibold tabular-nums", restanteGerente.isNegative() && "text-destructive")}>
                    {formatUsd(restanteGerente)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Saldo general después</div>
                  <div className="text-lg font-semibold tabular-nums">{formatUsd(restanteGeneral)}</div>
                </div>
              </CardContent>
            </Card>

            {duplicados.length > 0 && (
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
            {usd && restanteGerente.isNegative() && (
              <Aviso tono="warning">Con este depósito el gerente pagaría {formatUsd(restanteGerente.abs())} de más.</Aviso>
            )}
          </fieldset>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => navigate(-1)}>
              Cancelar
            </Button>
            {!deposito && (
              <Button type="button" variant="secondary" disabled={cerrada || saving} onClick={() => void guardar(true)}>
                Guardar y nuevo
              </Button>
            )}
            <Button type="submit" disabled={cerrada || saving}>
              Guardar
            </Button>
          </div>
        </form>
      </div>

      <TasaFormDialog
        tasa={null}
        fechaFija={draft.fecha}
        open={tasaDialog}
        onOpenChange={setTasaDialog}
        onSaved={(t) => {
          setTasa(t);
          set("tasaId", t.id);
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Eliminar depósito"
        description="El depósito se eliminará y los saldos se recalcularán."
        confirmLabel="Eliminar"
        destructive
        onConfirm={eliminar}
      />
    </div>
  );
}
