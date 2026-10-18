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
import { DestinoGerente } from "@/components/DestinoGerente";
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
import { listGerentes, type Gerente } from "@/db/repos/gerentes";
import { registrarDepositoEnCampana } from "@/db/operaciones/destino";
import { loadCampanaData, type CampanaData } from "@/db/queries/campanaData";
import { buildCampanaView } from "@/domain/campanaView";
import { formatFecha, isValidIsoDate, todayIso } from "@/domain/dates";
import { DomainError } from "@/domain/errors";
import { formatBs, formatTasa, formatUsd, parseMonto, toInputVE, toUsd } from "@/domain/money";
import { validateDeposito, validateDestino, type DepositoDraft, type DestinoDraft } from "@/domain/validation";
import { extractor, type CampoPropuesto, type CamposDeposito, type ExtractionResult } from "@/extraction/extractor";
import { persistImagen, type ImagenValue } from "@/platform/images";
import { invalidate, useData } from "@/hooks/useData";
import { reportError } from "@/lib/reportError";
import { cn } from "@/lib/utils";
import { TasaFormDialog } from "@/features/tasas/TasaFormDialog";
import { sugerenciasBancos } from "./bancos";

/** `asignacion` es null al registrar desde la campaña: el gerente se elige (o se crea) en el formulario. */
type Ctx = { deposito: Deposito | null; asignacion: AsignacionDetalle | null; data: CampanaData; bancos: string[]; gerentes: Gerente[] };

const SIN_DESTINO: DestinoDraft = { sel: "", nombre: "", saldo: "" };

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
  const { depositoId, asignacionId, campanaId } = useParams();
  const { data: ctx, error } = useData<Ctx>(
    async (db) => {
      if (campanaId) {
        const data = await loadCampanaData(db, Number(campanaId));
        return { deposito: null, asignacion: null, data, bancos: sugerenciasBancos(await listBancosUsados(db)), gerentes: await listGerentes(db) };
      }
      const deposito = depositoId ? await getDeposito(db, Number(depositoId)) : null;
      if (depositoId && !deposito) throw new DomainError("NO_ENCONTRADO", "El depósito no existe");
      const asignacion = await getAsignacion(db, deposito?.asignacionId ?? Number(asignacionId));
      if (!asignacion) throw new DomainError("NO_ENCONTRADO", "El gerente no está en esta campaña");
      const data = await loadCampanaData(db, asignacion.campanaId);
      return { deposito, asignacion, data, bancos: sugerenciasBancos(await listBancosUsados(db)), gerentes: [] };
    },
    [depositoId, asignacionId, campanaId],
  );

  if (!ctx) return <Cargando error={error} />;
  return <DepositoForm key={`${depositoId ?? "nuevo"}-${asignacionId ?? ""}-${campanaId ?? ""}`} {...ctx} />;
}

function confClass(c: number | undefined): string {
  if (c === undefined) return "";
  if (c >= 0.9) return "border-green-500";
  if (c >= 0.6) return "border-amber-500 bg-amber-50";
  return "border-red-500 bg-red-50";
}

function DepositoForm({ deposito, asignacion, data, bancos, gerentes }: Ctx) {
  const navigate = useNavigate();
  const campana = data.campana;
  const cerrada = campana.estado === "cerrada";
  const [destino, setDestino] = useState<DestinoDraft>(SIN_DESTINO);
  const [destinoErrors, setDestinoErrors] = useState<Partial<Record<keyof DestinoDraft, string>>>({});
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
  const [confianza, setConfianza] = useState<Partial<Record<CamposDeposito, number>>>({});
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
  const selAsignacion = /^a:(\d+)$/.exec(destino.sel);
  const asignacionDestino = asignacion?.id ?? (selAsignacion ? Number(selAsignacion[1]) : null);
  const resumenGerente = view.gerentes.find((g) => g.asignacionId === asignacionDestino);
  // Un gerente que se agrega a la campaña con este depósito suma su saldo al general.
  const saldoNuevo = !asignacion && (destino.sel === "nuevo" || destino.sel.startsWith("g:")) ? parseMonto(destino.saldo) : null;
  const monto = parseMonto(draft.montoBs);
  const usd = monto && tasa && new Decimal(monto).gt(0) ? toUsd(monto, tasa.valor) : null;
  const baseGerente = resumenGerente?.restante ?? saldoNuevo;
  const restanteGerente = baseGerente != null ? new Decimal(baseGerente).minus(usd ?? 0) : null;
  const restanteGeneral = new Decimal(view.total.restante).plus(saldoNuevo ?? 0).minus(usd ?? 0);

  function set<K extends keyof DepositoDraft>(k: K, v: DepositoDraft[K]) {
    setDraft((d) => ({ ...d, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
    setConfianza((c) => {
      const next = { ...c };
      delete next[k as CamposDeposito];
      return next;
    });
  }

  function applyExtraction(r: ExtractionResult<CamposDeposito>) {
    const next = { ...draft };
    const conf: Partial<Record<CamposDeposito, number>> = {};
    for (const [k, f] of Object.entries(r.fields) as [CamposDeposito, CampoPropuesto | undefined][]) {
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
      applyExtraction(await extractor.extraerDeposito(v.file));
    } catch (e) {
      reportError(e, "Lectura del comprobante");
    }
  }

  async function guardar(yNuevo: boolean) {
    const r = validateDeposito(draft);
    const rd = asignacion || deposito ? null : validateDestino(destino);
    if (!r.ok || (rd && !rd.ok)) {
      if (!r.ok) setErrors(r.errors);
      if (rd && !rd.ok) setDestinoErrors(rd.errors);
      return;
    }
    const nuevoDestino = rd?.ok ? rd.value : null;
    setSaving(true);
    try {
      const db = await getDb();
      const v = { ...r.value, imagenPath: await persistImagen(imagen) };
      let asignacionId: number;
      if (deposito) {
        await updateDeposito(db, deposito.id, v);
        asignacionId = deposito.asignacionId;
      } else if (nuevoDestino) {
        asignacionId = await registrarDepositoEnCampana(db, campana.id, nuevoDestino, v);
      } else {
        await createDeposito(db, asignacion!.id, v);
        asignacionId = asignacion!.id;
      }
      toast.success(deposito ? "Depósito actualizado" : "Depósito registrado");
      if (yNuevo) {
        if (imagen?.kind === "new") URL.revokeObjectURL(imagen.previewUrl);
        setDraft((d) => ({ ...vacio(d.fecha), tasaId: d.tasaId }));
        setImagen(null);
        setConfianza({});
        setDuplicados([]);
        if (!asignacion) setDestino({ ...SIN_DESTINO, sel: `a:${asignacionId}` });
        invalidate();
      } else {
        navigate(asignacion ? `/asignaciones/${asignacionId}` : `/campanas/${campana.id}`);
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
      navigate(`/asignaciones/${deposito.asignacionId}`, { replace: true });
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
        back={asignacion ? { to: `/asignaciones/${asignacion.id}`, label: asignacion.gerenteNombre } : { to: `/campanas/${campana.id}`, label: campana.nombre }}
        title={deposito ? "Editar depósito" : "Registrar depósito"}
        subtitle={asignacion ? `${asignacion.gerenteNombre} · ${asignacion.campanaNombre}` : `Campaña ${campana.nombre}`}
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
            {!asignacion && (
              <DestinoGerente
                id="d-destino"
                asignaciones={data.asignaciones}
                gerentes={gerentes}
                value={destino}
                errors={destinoErrors}
                onChange={(v) => {
                  setDestino(v);
                  setDestinoErrors({});
                }}
              />
            )}
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
            {usd && restanteGerente?.isNegative() && (
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
