import { beforeEach, expect, it, vi } from "vitest";

const remove = vi.fn();
vi.mock("@tauri-apps/plugin-fs", () => ({
  BaseDirectory: { AppData: 14 },
  remove: (...args: unknown[]) => remove(...args),
}));

const { deleteImage, extensionFor, mimeForPath } = await import("./images");

beforeEach(() => {
  remove.mockReset();
});

it("mapea tipos MIME y extensiones", () => {
  expect(extensionFor("image/jpeg")).toBe("jpg");
  expect(extensionFor("application/pdf")).toBeNull();
  expect(mimeForPath("imagenes/a.JPG")).toBe("image/jpeg");
  expect(mimeForPath("imagenes/a.bin")).toBe("application/octet-stream");
});

it("borra la imagen en AppData", async () => {
  remove.mockResolvedValue(undefined);
  await deleteImage("imagenes/a.png");
  expect(remove).toHaveBeenCalledWith("imagenes/a.png", { baseDir: 14 });
});

it("no falla si la imagen ya no existe", async () => {
  remove.mockImplementation(() => Promise.reject(new Error("failed to remove path: No such file or directory (os error 2)")));
  await expect(deleteImage("imagenes/a.png")).resolves.toBeUndefined();
  remove.mockImplementation(() => Promise.reject("El sistema no puede encontrar el archivo especificado. (os error 2)"));
  await expect(deleteImage("imagenes/a.png")).resolves.toBeUndefined();
});

it("otros errores al borrar se propagan", async () => {
  remove.mockImplementation(() => Promise.reject(new Error("forbidden path")));
  await expect(deleteImage("imagenes/a.png")).rejects.toThrow("forbidden");
});
