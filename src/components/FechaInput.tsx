import { useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatFecha, isValidIsoDate, mascaraFecha, parseFechaVE } from "@/domain/dates";
import { cn } from "@/lib/utils";

type Props = {
  id?: string;
  /** YYYY-MM-DD o "" */
  value: string;
  onChange: (iso: string) => void;
  className?: string;
  /** Clases del contenedor (p. ej. el ancho en una barra de filtros). */
  contenedorClassName?: string;
  disabled?: boolean;
  "aria-label"?: string;
};

const mostrar = (iso: string) => (isValidIsoDate(iso) ? formatFecha(iso) : "");

/**
 * Fecha escrita como dd/mm/aaaa sin importar el idioma de Windows (el `<input type="date">` sigue la
 * configuración regional). Entrega "" mientras el texto no sea una fecha completa y válida.
 * El botón abre el calendario nativo.
 */
export function FechaInput({ id, value, onChange, className, contenedorClassName, disabled, "aria-label": ariaLabel }: Props) {
  const [texto, setTexto] = useState(() => mostrar(value));
  const nativo = useRef<HTMLInputElement>(null);

  // Cambios de afuera (OCR, limpiar filtros, calendario): mostrar la fecha nueva sin pisar lo que se escribe.
  useEffect(() => {
    setTexto((t) => ((parseFechaVE(t) ?? "") === value ? t : mostrar(value)));
  }, [value]);

  function escribir(t: string) {
    const m = mascaraFecha(t);
    setTexto(m);
    const iso = parseFechaVE(m) ?? "";
    if (iso !== value) onChange(iso);
  }

  return (
    <div className={cn("relative", contenedorClassName)}>
      <Input
        id={id}
        aria-label={ariaLabel}
        inputMode="numeric"
        placeholder="dd/mm/aaaa"
        autoComplete="off"
        className={cn("pr-8 tabular-nums", className)}
        value={texto}
        disabled={disabled}
        aria-invalid={texto.length >= 8 && !parseFechaVE(texto) ? true : undefined}
        onChange={(e) => escribir(e.target.value)}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Abrir calendario"
        title="Abrir calendario"
        disabled={disabled}
        className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-50"
        onClick={() => {
          try {
            nativo.current?.showPicker();
          } catch {
            // sin calendario nativo queda escribir la fecha
          }
        }}
      >
        <CalendarDays className="size-4" />
      </button>
      <input
        ref={nativo}
        type="date"
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute right-0 bottom-0 size-px opacity-0 dark:scheme-dark"
        value={isValidIsoDate(value) ? value : ""}
        onChange={(e) => e.target.value && onChange(e.target.value)}
      />
    </div>
  );
}
