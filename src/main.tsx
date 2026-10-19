import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router";
import { router } from "./App";
import { reportError } from "./lib/reportError";
import { getDb } from "./db";
import { mantenimientoAlIniciar } from "./platform/backup";
import { buscarActualizacion } from "./platform/actualizacion";
import { warn } from "@tauri-apps/plugin-log";
import { aplicarTemaGuardado } from "./lib/tema";
import "./index.css";

aplicarTemaGuardado();

window.addEventListener("unhandledrejection", (e) => reportError(e.reason));

getDb()
  .then(mantenimientoAlIniciar)
  .catch((e) => reportError(e, "Respaldo automático"));

// Sin internet no se avisa nada: solo queda en el log.
if (!import.meta.env.DEV) buscarActualizacion().catch((e) => warn(`Buscar actualización: ${String(e)}`).catch(() => {}));

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
