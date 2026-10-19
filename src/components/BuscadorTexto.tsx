import { Autocomplete } from "@base-ui/react/autocomplete";
import { ChevronDownIcon } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { claveComparacion } from "@/domain/texto";
import { cn } from "@/lib/utils";

type Props = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  sugerencias: string[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

const coincide = (s: string, q: string) => claveComparacion(s).includes(claveComparacion(q));

/**
 * Campo de texto libre con sugerencias, con el mismo aspecto que `BuscadorSelect`: se puede elegir una sugerencia
 * o escribir un valor nuevo (p. ej. un banco que aún no está en la lista).
 */
export function BuscadorTexto({ id, value, onChange, sugerencias, placeholder, disabled, className }: Props) {
  return (
    <Autocomplete.Root items={sugerencias} value={value} onValueChange={(v) => onChange(v)} filter={coincide} disabled={disabled} openOnInputClick>
      <InputGroup className={cn("w-full", className)}>
        <Autocomplete.Input id={id} placeholder={placeholder} render={<InputGroupInput disabled={disabled} />} />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            variant="ghost"
            render={<Autocomplete.Trigger aria-label="Ver sugerencias" />}
            data-slot="input-group-button"
            className="data-pressed:bg-transparent"
            disabled={disabled}
          >
            <ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <Autocomplete.Portal>
        <Autocomplete.Positioner side="bottom" sideOffset={6} align="start" className="isolate z-50">
          <Autocomplete.Popup
            data-slot="combobox-content"
            className="group/combobox-content relative max-h-(--available-height) w-(--anchor-width) max-w-(--available-width) min-w-[calc(var(--anchor-width)+--spacing(7))] origin-(--transform-origin) overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
          >
            <Autocomplete.Empty className="hidden w-full justify-center py-2 text-center text-sm text-muted-foreground group-data-empty/combobox-content:flex">
              Sin sugerencias: se usará lo escrito
            </Autocomplete.Empty>
            <Autocomplete.List className="no-scrollbar max-h-[min(calc(--spacing(72)---spacing(9)),calc(var(--available-height)---spacing(9)))] scroll-py-1 overflow-y-auto overscroll-contain p-1 data-empty:p-0">
              {(s: string) => (
                <Autocomplete.Item
                  key={s}
                  value={s}
                  className="relative flex w-full cursor-default items-center gap-2 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                >
                  <span className="truncate">{s}</span>
                </Autocomplete.Item>
              )}
            </Autocomplete.List>
          </Autocomplete.Popup>
        </Autocomplete.Positioner>
      </Autocomplete.Portal>
    </Autocomplete.Root>
  );
}
