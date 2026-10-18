import { expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

it("envía los bytes de la imagen como cuerpo crudo del comando ocr_imagen", async () => {
  const { windowsOcr } = await import("./windowsOcr");
  const resultado = { lineas: [], ancho: 1, alto: 1 };
  invoke.mockResolvedValue(resultado);
  await expect(windowsOcr.reconocer(new Blob([new Uint8Array([1, 2, 3])]))).resolves.toBe(resultado);
  expect(invoke).toHaveBeenCalledWith("ocr_imagen", new Uint8Array([1, 2, 3]));
});
