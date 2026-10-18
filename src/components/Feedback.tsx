import type { ReactNode } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/reportError";

export function Cargando({ error }: { error?: unknown }) {
  if (error) return <Aviso tono="warning">{errorMessage(error)}</Aviso>;
  return <p className="py-8 text-center text-sm text-muted-foreground">Cargando…</p>;
}

export function Vacio({ texto }: { texto: string }) {
  return <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">{texto}</p>;
}

export function Aviso({ tono = "info", children }: { tono?: "info" | "warning"; children: ReactNode }) {
  const Icon = tono === "warning" ? AlertTriangle : Info;
  return (
    <div
      className={cn(
        "flex gap-2 rounded-md border px-3 py-2 text-sm",
        tono === "warning" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-sky-200 bg-sky-50 text-sky-900",
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
