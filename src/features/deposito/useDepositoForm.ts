import { useEffect, useMemo, useState } from "react";
import Decimal from "decimal.js";
import { getDb } from "@/db";
import type { AsignacionDetalle } from "@/db/repos/asignaciones";
import { findDuplicados, findPosiblesRepetidos, type Duplicado } from "@/db/repos/depositos";
import { getTasaParaFecha, type Tasa } from "@/db/repos/tasas";
import type { CampanaData } from "@/db/queries/campanaData";
import { buildCampanaView } from "@/domain/campanaView";
import { isValidIsoDate } from "@/domain/dates";
import { parseMonto, toUsd } from "@/domain/money";
import { validateDeposito, validateDestino, type DepositoDraft, type DepositoValido, type Destino, type DestinoDraft } from "@/domain/validation";
import { aplicarExtraccion, marcarTocado, type Autollenado } from "@/extraction/autollenado";
import type { CampoPropuesto, CamposDeposito } from "@/extraction/extractor";
import { reportError } from "@/lib/reportError";

export type DepositoFormState = { draft: DepositoDraft; auto: Autollenado<CamposDeposito>; destino: DestinoDraft };

export const SIN_DESTINO: DestinoDraft = { sel: "", nombre: "", saldo: "" };

export const depositoVacio = (fecha: string): DepositoDraft => ({
  fecha,
  banco: "",
  referencia: "",
  cuentaDestino: "",
  montoBs: "",
  tasaId: null,
  observaciones: "",
});

export const CAMPOS_OCR: CamposDeposito[] = ["fecha", "banco", "referencia", "cuentaDestino", "montoBs"];
export const camposOcr = (d: DepositoDraft): Record<CamposDeposito, string> =>
  Object.fromEntries(CAMPOS_OCR.map((k) => [k, d[k]])) as Record<CamposDeposito, string>;

/** Aplica lo leído del comprobante (o limpia, con `{}`) sobre el estado actual del formulario. */
export function conExtraccion(f: DepositoFormState, propuestos: Partial<Record<CamposDeposito, CampoPropuesto>>, fechaInicial: string): DepositoFormState {
  const r = aplicarExtraccion(camposOcr(f.draft), f.auto, propuestos, camposOcr(depositoVacio(fechaInicial)));
  return { ...f, draft: { ...f.draft, ...r.valores }, auto: r.auto };
}

type Opciones = {
  inicial: () => DepositoFormState;
  data: CampanaData;
  /** null al registrar desde la campaña o la revisión: el gerente se elige en el formulario. */
  asignacion: AsignacionDetalle | null;
  depositoId?: number;
};

/** Estado y reglas del formulario de depósito: tasa del día, duplicados, saldos en vivo y validación. */
export function useDepositoForm({ inicial, data, asignacion, depositoId }: Opciones) {
  const [form, setForm] = useState<DepositoFormState>(inicial);
  const [tasa, setTasaState] = useState<Tasa | null | undefined>(undefined); // undefined = buscando
  const [errors, setErrors] = useState<Partial<Record<keyof DepositoDraft, string>>>({});
  const [destinoErrors, setDestinoErrors] = useState<Partial<Record<keyof DestinoDraft, string>>>({});
  const [duplicados, setDuplicados] = useState<Duplicado[]>([]);
  const [posiblesRepetidos, setPosiblesRepetidos] = useState<Duplicado[]>([]);
  // Cuenta los intentos de guardar con errores: cada uno lleva la vista al primer campo con error.
  const [intentosFallidos, setIntentosFallidos] = useState(0);
  const draft = form.draft;

  // La tasa siempre es la de la fecha del depósito (sábado y domingo: la del lunes).
  useEffect(() => {
    let alive = true;
    setTasaState(undefined);
    if (!isValidIsoDate(draft.fecha)) {
      setTasaState(null);
      setForm((f) => ({ ...f, draft: { ...f.draft, tasaId: null } }));
      return;
    }
    getDb()
      .then((db) => getTasaParaFecha(db, draft.fecha))
      .then((t) => {
        if (!alive) return;
        setTasaState(t);
        setForm((f) => ({ ...f, draft: { ...f.draft, tasaId: t?.id ?? null } }));
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
        .then((db) => findDuplicados(db, banco, ref, depositoId))
        .then((r) => {
          if (alive) setDuplicados(r);
        })
        .catch(reportError);
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [draft.banco, draft.referencia, depositoId]);

  // Aviso de posible repetido (Provincial: misma cédula, fecha y monto). No bloquea.
  useEffect(() => {
    const banco = draft.banco.trim();
    const referencia = draft.referencia.trim();
    const montoBs = parseMonto(draft.montoBs);
    if (!banco || !referencia || !draft.fecha || !montoBs) {
      setPosiblesRepetidos([]);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      getDb()
        .then((db) => findPosiblesRepetidos(db, { banco, referencia, fecha: draft.fecha, montoBs }, depositoId))
        .then((r) => {
          if (alive) setPosiblesRepetidos(r);
        })
        .catch(reportError);
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [draft.banco, draft.referencia, draft.fecha, draft.montoBs, depositoId]);

  // Cálculos en vivo, excluyendo este mismo depósito si se está editando.
  const view = useMemo(() => buildCampanaView(data.asignaciones, data.depositos.filter((d) => d.id !== depositoId)), [data, depositoId]);
  const destino = form.destino;
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
    setForm((f) => ({
      ...f,
      draft: { ...f.draft, [k]: v },
      auto: (CAMPOS_OCR as string[]).includes(k) ? marcarTocado(f.auto, k as CamposDeposito) : f.auto,
    }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  }

  function setDestino(v: DestinoDraft) {
    setForm((f) => ({ ...f, destino: v }));
    setDestinoErrors({});
  }

  function setTasa(t: Tasa) {
    setTasaState(t);
    set("tasaId", t.id);
  }

  /** Valida y devuelve lo que se guarda; con errores los muestra y devuelve null. `destino` es null si el gerente viene fijo. */
  function validar(): { deposito: DepositoValido; destino: Destino | null } | null {
    const r = validateDeposito(draft);
    const rd = asignacion || depositoId ? null : validateDestino(destino);
    if (!r.ok || (rd && !rd.ok)) {
      if (!r.ok) setErrors(r.errors);
      if (rd && !rd.ok) setDestinoErrors(rd.errors);
      setIntentosFallidos((n) => n + 1);
      return null;
    }
    return { deposito: r.value, destino: rd?.ok ? rd.value : null };
  }

  function reiniciar(f: DepositoFormState) {
    setForm(f);
    setDuplicados([]);
    setPosiblesRepetidos([]);
  }

  return {
    form,
    setForm,
    set,
    setDestino,
    tasa,
    setTasa,
    errors,
    destinoErrors,
    duplicados,
    posiblesRepetidos,
    intentosFallidos,
    validar,
    reiniciar,
    calculo: { usd, restanteGerente, restanteGeneral },
  };
}

export type DepositoForm = ReturnType<typeof useDepositoForm>;
