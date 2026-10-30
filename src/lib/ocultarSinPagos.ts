import { useState } from "react";

/** Si la exportación de la campaña deja fuera las páginas de los gerentes sin pagos; se recuerda (localStorage). */
const clave = "control-pagos:exportar-ocultar-sin-pagos";

function leer(): boolean {
  try {
    return localStorage.getItem(clave) === "1";
  } catch {
    return false;
  }
}

export function useOcultarSinPagos(): [boolean, (v: boolean) => void] {
  const [ocultar, setOcultar] = useState(leer);
  return [
    ocultar,
    (v) => {
      setOcultar(v);
      try {
        localStorage.setItem(clave, v ? "1" : "0");
      } catch {
        // sin almacenamiento solo se pierde la comodidad de recordarlo
      }
    },
  ];
}
