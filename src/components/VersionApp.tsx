import { toast } from "sonner";
import { useVersion } from "@/hooks/useVersion";
import { reportError } from "@/lib/reportError";
import { cn } from "@/lib/utils";

/** "v0.4.7" discreto; un clic copia "Control de Pagos v0.4.7" (para reportar un problema). */
export function VersionApp({ className }: { className?: string }) {
  const version = useVersion();
  if (!version) return null;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(`Control de Pagos v${version}`);
      toast.success("Versión copiada");
    } catch (e) {
      reportError(e, "No se pudo copiar la versión");
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copiar()}
      title="Copiar la versión"
      aria-label={`Versión ${version} (copiar)`}
      className={cn("rounded px-1 text-[11px] text-muted-foreground/50 tabular-nums transition-colors hover:text-muted-foreground", className)}
    >
      v{version}
    </button>
  );
}
