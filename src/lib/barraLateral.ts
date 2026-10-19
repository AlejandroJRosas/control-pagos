import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * Barra lateral: en "auto" se colapsa sola cuando la ventana es angosta; "cerrada" la deja colapsada
 * con cualquier ancho. Solo `pref` se recuerda; abrirla a mano en ventana angosta dura hasta que cambia el ancho.
 */
export type EstadoBarra = { pref: "auto" | "cerrada"; abiertaAMano: boolean };

export function barraColapsada({ pref, abiertaAMano }: EstadoBarra, angosta: boolean): boolean {
  return pref === "cerrada" || (angosta && !abiertaAMano);
}

export function alternarBarra(e: EstadoBarra, angosta: boolean): EstadoBarra {
  return barraColapsada(e, angosta) ? { pref: "auto", abiertaAMano: angosta } : { pref: "cerrada", abiertaAMano: false };
}

const KEY = "control-pagos:barra-lateral";
const ANGOSTA = "(max-width: 1100px)";

function leerPref(): EstadoBarra["pref"] {
  try {
    return localStorage.getItem(KEY) === "cerrada" ? "cerrada" : "auto";
  } catch {
    return "auto";
  }
}

function guardarPref(pref: EstadoBarra["pref"]): void {
  try {
    if (pref === "auto") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    // sin almacenamiento solo se pierde la comodidad de recordarla
  }
}

function useAngosta(): boolean {
  return useSyncExternalStore(
    (l) => {
      const mq = window.matchMedia(ANGOSTA);
      mq.addEventListener("change", l);
      return () => mq.removeEventListener("change", l);
    },
    () => window.matchMedia(ANGOSTA).matches,
  );
}

export function useBarraLateral() {
  const angosta = useAngosta();
  const [estado, setEstado] = useState<EstadoBarra>(() => ({ pref: leerPref(), abiertaAMano: false }));
  // Al cambiar el ancho vuelve a mandar el modo automático (salvo que el usuario la haya cerrado).
  useEffect(() => setEstado((e) => (e.abiertaAMano ? { ...e, abiertaAMano: false } : e)), [angosta]);

  function alternar() {
    const n = alternarBarra(estado, angosta);
    guardarPref(n.pref);
    setEstado(n);
  }

  return { colapsada: barraColapsada(estado, angosta), alternar };
}
