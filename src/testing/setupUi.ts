import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { reiniciarTauri, tauri } from "./tauri";
import { reiniciarTutorial, setTutorialActivado } from "@/lib/tutorial";
import { KEY_NOVEDADES_VISTAS } from "@/lib/novedades";

// jsdom no trae estas APIs del navegador que usan la app y Base UI.
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia;
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.scrollIntoView ??= () => {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => {};

vi.mock("@/db", () => ({
  getDb: async () => {
    if (!tauri.db) throw new Error("La prueba no preparó la BD");
    return tauri.db;
  },
  closeDb: async () => {},
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: (cmd: string, args?: unknown) => tauri.invoke(cmd, args) }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: async () => "0.0.0-test" }));
vi.mock("@tauri-apps/api/path", () => ({ join: async (...p: string[]) => p.join("/"), dirname: async (p: string) => p.split("/").slice(0, -1).join("/") }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ onCloseRequested: async () => () => {}, destroy: async () => {} }),
}));
vi.mock("@tauri-apps/api/webview", () => ({ getCurrentWebview: () => ({ setZoom: async () => {} }) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: async () => null, save: async () => null }));
vi.mock("@tauri-apps/plugin-fs", () => ({
  BaseDirectory: { AppData: 0 },
  mkdir: async () => {},
  readFile: async () => new Uint8Array(),
  remove: async () => {},
  writeFile: async () => {},
}));
vi.mock("@tauri-apps/plugin-log", () => ({ error: async () => {}, warn: async () => {} }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: (u: string) => tauri.openUrl(u), openPath: async () => {} }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: async () => tauri.update }));
vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load: async () => ({}) } }));
// Historial fijo en vez del de git (la versión simulada es 0.0.0-test).
vi.mock("virtual:novedades", () => ({
  default: [
    { version: "0.0.0-test", fecha: "2026-10-22", notas: ["Novedad de prueba."] },
    { version: "0.0.0-anterior", fecha: "2026-10-01", notas: ["Cambio viejo."] },
  ],
}));

// El tutorial y las novedades de la versión se abrirían solos en cada prueba: se apagan salvo en las que los prueban.
beforeEach(() => {
  reiniciarTutorial();
  setTutorialActivado(false);
  localStorage.setItem(KEY_NOVEDADES_VISTAS, "0.0.0-test");
});

afterEach(() => {
  cleanup();
  reiniciarTauri();
  localStorage.clear();
  vi.useRealTimers();
});
