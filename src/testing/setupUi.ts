import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { reiniciarTauri, tauri } from "./tauri";

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

afterEach(() => {
  cleanup();
  reiniciarTauri();
  localStorage.clear();
  vi.useRealTimers();
});
