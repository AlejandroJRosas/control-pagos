import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router";
import { router } from "./App";
import { reportError } from "./lib/reportError";
import { getDb } from "./db";
import { runAutoBackup } from "./platform/backup";
import { aplicarTemaGuardado } from "./lib/tema";
import "./index.css";

aplicarTemaGuardado();

window.addEventListener("unhandledrejection", (e) => reportError(e.reason));

getDb()
  .then(runAutoBackup)
  .catch((e) => reportError(e, "Respaldo automático"));

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
