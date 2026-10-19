import { vi } from "vitest";
import type { SqlDriver } from "@/db/driver";

/** Estado compartido entre los mocks de Tauri y las pruebas de interfaz. */
export const tauri = {
  db: null as SqlDriver | null,
  /** Respuesta de `invoke` por comando; lo que no esté da null. */
  invoke: vi.fn(async (_cmd: string, _args?: unknown): Promise<unknown> => null),
  openUrl: vi.fn(async (_url: string) => {}),
};

export function reiniciarTauri() {
  tauri.db = null;
  tauri.invoke.mockReset();
  tauri.invoke.mockImplementation(async () => null);
  tauri.openUrl.mockReset();
}
