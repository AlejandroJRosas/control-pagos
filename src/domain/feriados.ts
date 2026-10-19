import { sumarDias } from "./dates";

const pad = (n: number) => String(n).padStart(2, "0");

/** Domingo de Pascua (calendario gregoriano, algoritmo anónimo de Meeus/Jones/Butcher). */
export function pascua(anio: number): string {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${anio}-${pad(mes)}-${pad(dia)}`;
}

/** Feriados nacionales de Venezuela de un año. Los bancarios adicionales (SUDEBAN) se agregan a mano. */
export function feriadosNacionales(anio: number): { fecha: string; nombre: string }[] {
  const p = pascua(anio);
  const fijo = (mes: number, dia: number, nombre: string) => ({ fecha: `${anio}-${pad(mes)}-${pad(dia)}`, nombre });
  return [
    fijo(1, 1, "Año Nuevo"),
    { fecha: sumarDias(p, -48), nombre: "Lunes de Carnaval" },
    { fecha: sumarDias(p, -47), nombre: "Martes de Carnaval" },
    { fecha: sumarDias(p, -3), nombre: "Jueves Santo" },
    { fecha: sumarDias(p, -2), nombre: "Viernes Santo" },
    fijo(4, 19, "Declaración de la Independencia"),
    fijo(5, 1, "Día del Trabajador"),
    fijo(6, 24, "Batalla de Carabobo"),
    fijo(7, 5, "Día de la Independencia"),
    fijo(7, 24, "Natalicio de Simón Bolívar"),
    fijo(10, 12, "Día de la Resistencia Indígena"),
    fijo(12, 24, "Nochebuena"),
    fijo(12, 25, "Navidad"),
    fijo(12, 31, "Fin de año"),
  ];
}
