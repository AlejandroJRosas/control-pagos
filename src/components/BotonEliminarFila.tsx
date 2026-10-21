import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = { label: string; onClick: () => void; disabled?: boolean };

/** Eliminar en una fila de tabla o lista: la papelera roja, con lo que elimina al pasar el mouse. */
export function BotonEliminarFila({ label, onClick, disabled }: Props) {
  return (
    <Button type="button" size="icon-sm" variant="ghost" title={label} aria-label={label} disabled={disabled} onClick={onClick}>
      <Trash2 className="text-destructive" />
    </Button>
  );
}
