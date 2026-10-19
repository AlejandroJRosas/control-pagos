import type { ReactNode } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/reportError";

export function Cargando({ error }: { error?: unknown }) {
  if (error) return <Aviso tono="warning">{errorMessage(error)}</Aviso>;
  return <p className="py-8 text-center text-sm text-muted-foreground">Cargando…</p>;
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
