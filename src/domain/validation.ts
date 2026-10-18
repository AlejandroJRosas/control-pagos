import Decimal from "decimal.js";
import { parseMonto } from "./money";
import { isValidIsoDate } from "./dates";

export type Result<T, K extends string> = { ok: true; value: T } | { ok: false; errors: Partial<Record<K, string>> };

type Errors<K extends string> = Partial<Record<K, string>>;

function finish<T, K extends string>(errors: Errors<K>, build: () => T): Result<T, K> {
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value: build() };
}

function positivo(raw: string): string | null {
  const v = parseMonto(raw);
  return v !== null && new Decimal(v).gt(0) ? v : null;
}

const opcional = (s: string): string | null => s.trim() || null;

export type DepositoDraft = {
  fecha: string;
  banco: string;
  referencia: string;
  cuentaDestino: string;
  montoBs: string;
  tasaId: number | null;
  observaciones: string;
};

export type DepositoValido = {
  fecha: string;
  banco: string;
  referencia: string;
  cuentaDestino: string;
  montoBs: string;
  tasaId: number;
  observaciones: string | null;
};

export function validateDeposito(d: DepositoDraft): Result<DepositoValido, keyof DepositoDraft> {
  const errors: Errors<keyof DepositoDraft> = {};
  if (!isValidIsoDate(d.fecha)) errors.fecha = "Fecha inválida";
  if (!d.banco.trim()) errors.banco = "Indica el banco de origen";
  if (!d.referencia.trim()) errors.referencia = "Indica la referencia bancaria";
  if (!d.cuentaDestino.trim()) errors.cuentaDestino = "Indica la cuenta destino";
  const monto = positivo(d.montoBs);
  if (!monto) errors.montoBs = "Monto inválido (ej. 1.234.567,89)";
  if (d.tasaId == null) errors.tasaId = "Falta la tasa del día";
  return finish(errors, () => ({
    fecha: d.fecha,
    banco: d.banco.trim(),
    referencia: d.referencia.trim(),
    cuentaDestino: d.cuentaDestino.trim(),
    montoBs: monto as string,
    tasaId: d.tasaId as number,
    observaciones: opcional(d.observaciones),
  }));
}

export type TasaDraft = { fecha: string; valor: string; notas: string };
export type TasaValida = { fecha: string; valor: string; notas: string | null };

export function validateTasa(d: TasaDraft): Result<TasaValida, keyof TasaDraft> {
  const errors: Errors<keyof TasaDraft> = {};
  if (!isValidIsoDate(d.fecha)) errors.fecha = "Fecha inválida";
  const valor = positivo(d.valor);
  if (!valor) errors.valor = "Tasa inválida (ej. 36,50)";
  return finish(errors, () => ({ fecha: d.fecha, valor: valor as string, notas: opcional(d.notas) }));
}

export function validateSaldo(raw: string): Result<string, "saldoUsd"> {
  const v = positivo(raw);
  return v ? { ok: true, value: v } : { ok: false, errors: { saldoUsd: "Saldo inválido (debe ser mayor que 0)" } };
}

export type CampanaDraft = { nombre: string; fechaInicio: string; fechaFin: string; notas: string };
export type CampanaValida = { nombre: string; fechaInicio: string; fechaFin: string | null; notas: string | null };

export function validateCampana(d: CampanaDraft): Result<CampanaValida, keyof CampanaDraft> {
  const errors: Errors<keyof CampanaDraft> = {};
  if (!d.nombre.trim()) errors.nombre = "Indica el nombre";
  if (!isValidIsoDate(d.fechaInicio)) errors.fechaInicio = "Fecha inválida";
  if (d.fechaFin) {
    if (!isValidIsoDate(d.fechaFin)) errors.fechaFin = "Fecha inválida";
    else if (d.fechaFin < d.fechaInicio) errors.fechaFin = "Debe ser igual o posterior al inicio";
  }
  return finish(errors, () => ({
    nombre: d.nombre.trim(),
    fechaInicio: d.fechaInicio,
    fechaFin: d.fechaFin || null,
    notas: opcional(d.notas),
  }));
}

export type GerenteDraft = { nombre: string; telefono: string };
export type GerenteValido = { nombre: string; telefono: string | null };

export function validateGerente(d: GerenteDraft): Result<GerenteValido, keyof GerenteDraft> {
  const errors: Errors<keyof GerenteDraft> = {};
  if (!d.nombre.trim()) errors.nombre = "Indica el nombre";
  return finish(errors, () => ({ nombre: d.nombre.trim(), telefono: opcional(d.telefono) }));
}
