/// <reference types="vitest/config" />
import { execFileSync } from "node:child_process";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import process from "node:process";
import { leerEtiquetas, type Novedad } from "./src/domain/novedades";

const host = process.env.TAURI_DEV_HOST;

/**
 * `virtual:novedades`: las notas de cada versión (mensaje de las etiquetas anotadas vX.Y.Z), leídas de git al compilar.
 * En el release la etiqueta de la versión ya existe (el workflow hace `git fetch --force --tags` antes de compilar).
 */
function novedades(): Plugin {
  const id = "virtual:novedades";
  return {
    name: "novedades",
    resolveId: (s) => (s === id ? `\0${id}` : undefined),
    load(s) {
      if (s !== `\0${id}`) return;
      let lista: Novedad[] = [];
      try {
        const formato = "--format=%(refname:short)%00%(creatordate:short)%00%(contents)%1e";
        lista = leerEtiquetas(execFileSync("git", ["for-each-ref", "refs/tags/v*", formato], { cwd: __dirname, encoding: "utf8" }));
      } catch (e) {
        this.warn(`Sin historial de cambios (git): ${String(e)}`);
      }
      return `export default ${JSON.stringify(lista)};`;
    },
  };
}

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react(), tailwindcss(), novedades()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
  test: {
    projects: [
      { extends: true, test: { name: "logica", environment: "node", include: ["src/**/*.test.ts"] } },
      // Pruebas de interfaz: la app real con la BD de sql.js en memoria y Tauri simulado (src/testing/setupUi.ts).
      { extends: true, test: { name: "ui", environment: "jsdom", include: ["src/**/*.ui.test.tsx"], setupFiles: ["src/testing/setupUi.ts"] } },
    ],
  },
}));
