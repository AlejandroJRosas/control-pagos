import { toast } from "sonner";
import { error as logError } from "@tauri-apps/plugin-log";
import { DomainError } from "@/domain/errors";

export function errorMessage(e: unknown): string {
  if (e instanceof DomainError) return e.message;
  if (e instanceof Error) return `Error inesperado: ${e.message}`;
  return `Error inesperado: ${String(e)}`;
}

export function reportError(e: unknown, contexto?: string): void {
  const msg = errorMessage(e);
  toast.error(contexto ? `${contexto}: ${msg}` : msg);
  const detalle = e instanceof Error ? (e.stack ?? e.message) : String(e);
  logError(`${contexto ?? "error"}: ${detalle}`).catch(() => {});
}
