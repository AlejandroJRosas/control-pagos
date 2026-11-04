import type { ReactNode } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/reportError";

/**
 * Mientras cargan los datos: un indicador que gira y un esqueleto de la pantalla con brillo. Aparece tras un instante
 * (`cargando-aparecer`, index.css) para que lo que carga rápido no parpadee. `texto` cambia "Cargando…".
 */
export function Cargando({ error, texto = "Cargando…" }: { error?: unknown; texto?: string }) {
  if (error) return <Aviso tono="warning">{errorMessage(error)}</Aviso>;
  return (
    <div role="status" aria-live="polite" className="cargando-aparecer grid gap-5 py-6">
      <div className="flex items-center justify-center gap-2.5 text-sm font-medium text-muted-foreground">
        <Spinner />
        <span>{texto}</span>
      </div>
      <div aria-hidden className="grid gap-3">
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="cargando-esqueleto h-16 rounded-xl" />
          ))}
        </div>
        {[100, 92, 96, 85].map((w, i) => (
          <div key={i} className="cargando-esqueleto h-9 rounded-md" style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  );
}

/** Anillo que gira con el color de la app; `size` en clases de Tailwind. */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-5 shrink-0 animate-spin rounded-full border-2 border-primary/25 border-t-primary-intenso", className)}
    />
  );
}

/** Estado vacío; `children` son las acciones para salir de él (p. ej. "Registrar depósito"). */
export function Vacio({ texto, children }: { texto: string; children?: ReactNode }) {
  return (
    <div className="grid justify-items-center gap-3 rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
      <p>{texto}</p>
      {children && <div className="flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

export function Aviso({ tono = "info", children }: { tono?: "info" | "warning"; children: ReactNode }) {
  const Icon = tono === "warning" ? AlertTriangle : Info;
  return (
    <div
      className={cn(
        "flex gap-2 rounded-md border px-3 py-2 text-sm",
        tono === "warning" ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200" : "border-primary-intenso/40 bg-fila-par text-foreground",
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
