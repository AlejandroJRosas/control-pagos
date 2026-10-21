import { useEffect, useRef, useState } from "react";
import { useBlocker } from "react-router";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { registrarBloqueador } from "@/lib/cierre";

/**
 * Pide confirmación antes de salir de una pantalla con cambios sin guardar: al navegar dentro de la app
 * y al cerrar la ventana (como bloqueador del cierre, ver `lib/cierre.ts`). Llamar a `permitirSalida()` justo
 * antes de navegar tras guardar.
 */
export function useAvisoSinGuardar(sucio: boolean) {
  const sucioRef = useRef(sucio);
  sucioRef.current = sucio;
  const libre = useRef(false);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => sucioRef.current && !libre.current && currentLocation.pathname !== nextLocation.pathname,
  );
  // Al cerrar la ventana con cambios: el cierre espera la respuesta del diálogo.
  const [cierre, setCierre] = useState<((cerrar: boolean) => void) | null>(null);
  const pendiente = useRef<((cerrar: boolean) => void) | null>(null);

  useEffect(() => {
    const quitar = registrarBloqueador(() => {
      if (!sucioRef.current || libre.current) return Promise.resolve(true);
      return new Promise<boolean>((resolve) => {
        pendiente.current = resolve;
        setCierre(() => resolve);
      });
    });
    return () => {
      quitar();
      // Si el formulario se va con el diálogo abierto, ya no hay cambios que proteger: el cierre sigue.
      pendiente.current?.(true);
      pendiente.current = null;
    };
  }, []);

  const cerrando = cierre !== null;
  const responderCierre = (cerrar: boolean) => {
    cierre?.(cerrar);
    pendiente.current = null;
    setCierre(null);
  };

  const bloqueado = blocker.state === "blocked";
  const dialogo = (
    <ConfirmDialog
      open={bloqueado || cerrando}
      onOpenChange={(open) => {
        if (open) return;
        if (blocker.state === "blocked") blocker.reset();
        if (cerrando) responderCierre(false);
      }}
      title="Cambios sin guardar"
      description={
        cerrando ? "Si cierras la aplicación ahora se perderán los cambios de este formulario." : "Si sales ahora se perderán los cambios de este formulario."
      }
      confirmLabel={cerrando ? "Cerrar sin guardar" : "Salir sin guardar"}
      destructive
      onConfirm={() => {
        libre.current = true;
        if (cerrando) responderCierre(true);
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

/**
 * Lo mismo para un formulario en un diálogo: cerrarlo (Esc, clic afuera, Cancelar) o cerrar la ventana con cambios
 * pide confirmación. El diálogo usa el `onOpenChange` que devuelve y pone `dialogo` dentro de su contenido; al guardar
 * se cierra con el `onOpenChange` original, que no pregunta.
 */
export function useDialogoSinGuardar(sucio: boolean, onOpenChange: (open: boolean) => void) {
  const sucioRef = useRef(sucio);
  sucioRef.current = sucio;
  const [preguntar, setPreguntar] = useState(false);
  const [cierre, setCierre] = useState<((cerrar: boolean) => void) | null>(null);
  const pendiente = useRef<((cerrar: boolean) => void) | null>(null);

  useEffect(() => {
    const quitar = registrarBloqueador(() => {
      if (!sucioRef.current) return Promise.resolve(true);
      return new Promise<boolean>((resolve) => {
        pendiente.current = resolve;
        setCierre(() => resolve);
      });
    });
    return () => {
      quitar();
      pendiente.current?.(true);
      pendiente.current = null;
    };
  }, []);

  const cerrando = cierre !== null;
  const responderCierre = (cerrar: boolean) => {
    cierre?.(cerrar);
    pendiente.current = null;
    setCierre(null);
  };

  const dialogo = (
    <ConfirmDialog
      open={preguntar || cerrando}
      onOpenChange={(open) => {
        if (open) return;
        setPreguntar(false);
        if (cerrando) responderCierre(false);
      }}
      title="Cambios sin guardar"
      description={cerrando ? "Si cierras la aplicación ahora se perderán los cambios de este formulario." : "Si lo cierras ahora se perderán los cambios de este formulario."}
      confirmLabel={cerrando ? "Cerrar sin guardar" : "Descartar cambios"}
      destructive
      onConfirm={() => {
        if (cerrando) return responderCierre(true);
        setPreguntar(false);
        onOpenChange(false);
      }}
    />
  );

  return {
    dialogo,
    onOpenChange: (open: boolean) => {
      if (!open && sucioRef.current) setPreguntar(true);
      else onOpenChange(open);
    },
  };
}
