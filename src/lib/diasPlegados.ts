import { useState } from "react";

/** Días plegados de una tabla de depósitos agrupada por día (fechas YYYY-MM-DD); se recuerda por tabla en localStorage. */
export const alternarDia = (plegados: readonly string[], fecha: string): string[] =>
  plegados.includes(fecha) ? plegados.filter((f) => f !== fecha) : [...plegados, fecha];

/** Pliega o despliega `fechas` (los días que se ven); los demás guardados no se tocan. */
export const plegarDias = (plegados: readonly string[], fechas: readonly string[], plegar: boolean): string[] =>
  plegar ? [...new Set([...plegados, ...fechas])] : plegados.filter((f) => !fechas.includes(f));

export const normalizarPlegados = (guardado: unknown): string[] =>
  Array.isArray(guardado) ? [...new Set(guardado.filter((f): f is string => typeof f === "string" && /^\d{4}-\d{2}-\d{2}$/.test(f)))] : [];

const prefijo = "control-pagos:dias-plegados:";

function leer(clave: string): string[] {
  try {
    const crudo = localStorage.getItem(prefijo + clave);
    return normalizarPlegados(crudo ? JSON.parse(crudo) : null);
  } catch {
    return [];
  }
}

function guardar(clave: string, dias: string[]): void {
  try {
    if (dias.length > 0) localStorage.setItem(prefijo + clave, JSON.stringify(dias));
    else localStorage.removeItem(prefijo + clave);
  } catch {
    // sin almacenamiento solo se pierde la comodidad de recordarlos
  }
}

/** Por defecto todo desplegado. Si cambia `clave` (otra campaña o gerente en la misma pantalla) se lee lo suyo. */
export function useDiasPlegados(clave: string) {
  const [estado, setEstado] = useState(() => ({ clave, dias: leer(clave) }));
  const dias = estado.clave === clave ? estado.dias : leer(clave);
  const cambiar = (f: (dias: string[]) => string[]) =>
    setEstado((e) => {
      const n = f(e.clave === clave ? e.dias : leer(clave));
      guardar(clave, n);
      return { clave, dias: n };
    });
  return {
    plegados: new Set(dias),
    alternar: (fecha: string) => cambiar((d) => alternarDia(d, fecha)),
    plegar: (fechas: string[], plegar: boolean) => cambiar((d) => plegarDias(d, fechas, plegar)),
  };
}
