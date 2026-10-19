import { useEffect, useRef, useState } from "react";
import { useBlocker } from "react-router";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { reportError } from "@/lib/reportError";

/**
 * Pide confirmación antes de salir de una pantalla con cambios sin guardar: al navegar dentro de la app
 * y al cerrar la ventana. Llamar a `permitirSalida()` justo antes de navegar tras guardar.
 */
export function useAvisoSinGuardar(sucio: boolean) {
  const sucioRef = useRef(sucio);
  sucioRef.current = sucio;
  const libre = useRef(false);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => sucioRef.current && !libre.current && currentLocation.pathname !== nextLocation.pathname,
  );
  const [cerrando, setCerrando] = useState(false);

  useEffect(() => {
    let alive = true;
    let unlisten: (() => void) | undefined;
    getCurrentWindow()
      .onCloseRequested((e) => {
        if (sucioRef.current && !libre.current) {
          e.preventDefault();
          setCerrando(true);
        }
      })
      .then((u) => (alive ? (unlisten = u) : u()))
      .catch(reportError);
    return () => {
      alive = false;
      unlisten?.();
    };
  }, []);

  const bloqueado = blocker.state === "blocked";
  const dialogo = (
    <ConfirmDialog
      open={bloqueado || cerrando}
      onOpenChange={(open) => {
        if (open) return;
        if (blocker.state === "blocked") blocker.reset();
        setCerrando(false);
      }}
      title="Cambios sin guardar"
      description={
        cerrando ? "Si cierras la aplicación ahora se perderán los cambios de este formulario." : "Si sales ahora se perderán los cambios de este formulario."
      }
      confirmLabel={cerrando ? "Cerrar sin guardar" : "Salir sin guardar"}
      destructive
      onConfirm={() => {
        libre.current = true;
        if (cerrando) void getCurrentWindow().destroy().catch(reportError);
        else if (blocker.state === "blocked") blocker.proceed();
      }}
    />
  );

  return {
    dialogo,
    permitirSalida: () => {
      libre.current = true;
    },
  };
}
