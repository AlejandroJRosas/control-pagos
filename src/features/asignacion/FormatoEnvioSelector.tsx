import { FileImage, FileSpreadsheet, FileText } from "lucide-react";
import { ETIQUETA_FORMATO, FORMATOS_ENVIO, type FormatoEnvio } from "@/lib/formatoEnvio";
import { cn } from "@/lib/utils";

const ICONO = { imagen: FileImage, pdf: FileText, excel: FileSpreadsheet } satisfies Record<FormatoEnvio, unknown>;

/** Imagen, PDF o Excel: en qué se copia, guarda o manda por WhatsApp el estado de cuenta. */
export function FormatoEnvioSelector({ formato, onChange }: { formato: FormatoEnvio; onChange: (f: FormatoEnvio) => void }) {
  return (
    <div role="group" aria-label="Enviar como" className="flex items-center gap-1.5 text-sm">
      <span className="mr-1 text-muted-foreground">Enviar como</span>
      {FORMATOS_ENVIO.map((f) => {
        const Icono = ICONO[f];
        return (
          <button
            key={f}
            type="button"
            aria-pressed={formato === f}
            onClick={() => onChange(f)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors hover:bg-fila-hover",
              formato === f && "border-primary-intenso bg-fila-hover font-medium",
            )}
          >
            <Icono className="size-3.5" />
            {ETIQUETA_FORMATO[f]}
          </button>
        );
      })}
    </div>
  );
}
