import type { ReactNode } from "react";
import { Tooltip } from "@base-ui/react";

type Props = {
  /** Por qué el botón está deshabilitado; sin motivo se muestra el botón tal cual. */
  motivo?: string;
  /** Clic sobre el botón deshabilitado (p. ej. llevar la vista al problema). */
  onMotivo?: () => void;
  children: ReactNode;
};

/**
 * Botón deshabilitado con su motivo como aviso flotante al pasar el mouse: no ocupa lugar en la barra. Un botón
 * deshabilitado no recibe eventos del mouse, así que los atiende el envoltorio.
 */
export function BotonConMotivo({ motivo, onMotivo, children }: Props) {
  if (!motivo) return <>{children}</>;
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        delay={0}
        render={<span className="inline-flex cursor-pointer [&>*]:pointer-events-none" onClick={onMotivo} />}
      >
        {children}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner side="top" align="end" sideOffset={8} className="z-50">
          <Tooltip.Popup className="max-w-64 rounded-md border border-destructive/40 bg-popover px-3 py-1.5 text-sm text-destructive shadow-md">
            {motivo}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
