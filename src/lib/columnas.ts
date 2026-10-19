import { useState } from "react";

/** Columnas de una tabla que el usuario puede ocultar y reordenar; se recuerda por tabla en localStorage. */
export type EstadoColumnas<K extends string> = { orden: K[]; ocultas: K[] };

/** Ajusta lo guardado a las columnas actuales: quita las que ya no existen y agrega las nuevas junto a su vecina original. */
export function normalizarColumnas<K extends string>(guardado: unknown, todas: readonly K[]): EstadoColumnas<K> {
  const g = (guardado ?? {}) as Partial<EstadoColumnas<string>>;
  const validas = (xs: unknown) => (Array.isArray(xs) ? xs.filter((x): x is K => todas.includes(x as K)) : []);
  const orden = [...new Set(validas(g.orden))];
  todas.forEach((k, i) => {
    if (orden.includes(k)) return;
    const anterior = todas
      .slice(0, i)
      .reverse()
      .find((p) => orden.includes(p));
    orden.splice(anterior ? orden.indexOf(anterior) + 1 : 0, 0, k);
  });
  const ocultas = [...new Set(validas(g.ocultas))];
  return { orden, ocultas: ocultas.length >= todas.length ? [] : ocultas };
}

export const columnasVisibles = <K extends string>(e: EstadoColumnas<K>): K[] => e.orden.filter((k) => !e.ocultas.includes(k));

/** Oculta o muestra; la última columna visible no se puede ocultar. */
export function alternarColumna<K extends string>(e: EstadoColumnas<K>, key: K): EstadoColumnas<K> {
  if (e.ocultas.includes(key)) return { ...e, ocultas: e.ocultas.filter((k) => k !== key) };
  if (columnasVisibles(e).length <= 1) return e;
  return { ...e, ocultas: [...e.ocultas, key] };
}

export function moverColumna<K extends string>(e: EstadoColumnas<K>, key: K, delta: -1 | 1): EstadoColumnas<K> {
  const i = e.orden.indexOf(key);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= e.orden.length) return e;
  const orden = [...e.orden];
  [orden[i], orden[j]] = [orden[j], orden[i]];
  return { ...e, orden };
}

export type CeldaPie<K extends string> = { tipo: "total"; col: K } | { tipo: "etiqueta" | "vacio"; span: number };

/** Celdas del pie de una tabla: las columnas sin total se juntan; la etiqueta ("Total…") va en el primer grupo. */
export function agruparPie<K extends string>(cols: readonly K[], conTotal: readonly K[]): CeldaPie<K>[] {
  const celdas: CeldaPie<K>[] = [];
  for (const col of cols) {
    const ultima = celdas[celdas.length - 1];
    if (conTotal.includes(col)) celdas.push({ tipo: "total", col });
    else if (ultima && ultima.tipo !== "total") ultima.span += 1;
    else
      celdas.push({
        tipo: celdas.some((c) => c.tipo === "etiqueta") ? "vacio" : "etiqueta",
        span: 1,
      });
  }
  return celdas;
}

const prefijo = "control-pagos:columnas:";

function leer<K extends string>(clave: string, todas: readonly K[]): EstadoColumnas<K> {
  try {
    const crudo = localStorage.getItem(prefijo + clave);
    return normalizarColumnas(crudo ? JSON.parse(crudo) : null, todas);
  } catch {
    return normalizarColumnas(null, todas);
  }
}

function guardar<K extends string>(clave: string, e: EstadoColumnas<K> | null): void {
  try {
    if (e) localStorage.setItem(prefijo + clave, JSON.stringify(e));
    else localStorage.removeItem(prefijo + clave);
  } catch {
    // sin almacenamiento solo se pierde la comodidad de recordarlas
  }
}

export function useColumnas<K extends string>(clave: string, todas: readonly K[]) {
  const [estado, setEstado] = useState(() => leer(clave, todas));
  // Actualización funcional: dos clics seguidos no se pisan con un estado viejo.
  const cambiar = (f: (e: EstadoColumnas<K>) => EstadoColumnas<K>) =>
    setEstado((e) => {
      const n = f(e);
      if (n !== e) guardar(clave, n);
      return n;
    });
  return {
    estado,
    visibles: columnasVisibles(estado),
    alternar: (k: K) => cambiar((e) => alternarColumna(e, k)),
    mover: (k: K, delta: -1 | 1) => cambiar((e) => moverColumna(e, k, delta)),
    restablecer: () => {
      guardar(clave, null);
      setEstado(normalizarColumnas(null, todas));
    },
  };
}
