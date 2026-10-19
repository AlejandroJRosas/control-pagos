import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { claveComparacion } from "@/domain/texto";
import { cn } from "@/lib/utils";

export type Opcion = { value: string; label: string; /** Texto gris a la derecha (p. ej. el grupo). */ detalle?: string };

type Props = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  opciones: Opcion[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-invalid"?: boolean;
};

const coincide = (o: Opcion, q: string) => claveComparacion(o.label).includes(claveComparacion(q));

/** Lista desplegable en la que se puede escribir para buscar (sin distinguir mayúsculas ni acentos). */
export function BuscadorSelect({ id, value, onChange, opciones, placeholder = "Buscar…", disabled, className, ...rest }: Props) {
  const actual = opciones.find((o) => o.value === value) ?? null;
  return (
    <Combobox
      items={opciones}
      value={actual}
      onValueChange={(o: Opcion | null) => onChange(o?.value ?? "")}
      itemToStringLabel={(o: Opcion) => o.label}
      isItemEqualToValue={(a: Opcion, b: Opcion) => a.value === b.value}
      filter={coincide}
      disabled={disabled}
      autoHighlight
    >
      <ComboboxInput id={id} placeholder={placeholder} disabled={disabled} className={cn("w-full", className)} aria-invalid={rest["aria-invalid"]} />
      <ComboboxContent>
        <ComboboxEmpty>Sin resultados</ComboboxEmpty>
        <ComboboxList>
          {(o: Opcion) => (
            <ComboboxItem key={o.value} value={o}>
              <span className="truncate">{o.label}</span>
              {o.detalle && <span className="ml-auto shrink-0 text-xs text-muted-foreground">{o.detalle}</span>}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
