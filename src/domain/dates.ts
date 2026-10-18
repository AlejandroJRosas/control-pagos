export function formatFecha(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function todayIso(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function formatPeriodo(inicio: string, fin: string | null): string {
  return `${formatFecha(inicio)} – ${fin ? formatFecha(fin) : "en curso"}`;
}

/** 0 = domingo … 6 = sábado. */
export function diaSemana(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function sumarDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}

export const esFinDeSemana = (iso: string): boolean => diaSemana(iso) === 0 || diaSemana(iso) === 6;

/** Fecha cuya tasa rige ese día: sábado y domingo usan la del viernes anterior. */
export function fechaDeTasa(iso: string): string {
  const dia = diaSemana(iso);
  return dia === 6 ? sumarDias(iso, -1) : dia === 0 ? sumarDias(iso, -2) : iso;
}
