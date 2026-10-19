import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router";
import { router } from "./App";
import { reportError } from "./lib/reportError";
import { getDb } from "./db";
import { mantenimientoAlIniciar, marcarArranque } from "./platform/backup";
import { invalidate } from "./hooks/useData";
import { buscarActualizacion } from "./platform/actualizacion";
import { warn } from "@tauri-apps/plugin-log";
import { aplicarTemaGuardado } from "./lib/tema";
import { instalarCierre } from "./lib/instalarCierre";
import { OverlayCierre } from "./components/OverlayCierre";
import { BdDanada } from "./components/BdDanada";
import { verificarIntegridad, type Integridad } from "./db/integridad";
import "./index.css";

aplicarTemaGuardado();

window.addEventListener("unhandledrejection", (e) => reportError(e.reason));

instalarCierre().catch((e) => reportError(e, "Cierre de la ventana"));

// Sin internet no se avisa nada: solo queda en el log.
if (!import.meta.env.DEV) buscarActualizacion().catch((e) => warn(`Buscar actualización: ${String(e)}`).catch(() => {}));

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
const render = (contenido: React.ReactNode) =>
  root.render(
    <React.StrictMode>
      {contenido}
      <OverlayCierre />
    </React.StrictMode>,
  );
const app = <RouterProvider router={router} />;

/**
 * Antes de mostrar la app se revisa la BD. Si está dañada no se hace el respaldo automático (pisaría uno bueno y
 * podaría los viejos) ni la limpieza: se ofrece restaurar.
 */
async function arrancar() {
  let db;
  try {
    db = await getDb();
  } catch (e) {
    render(<BdDanada detalle={[e instanceof Error ? e.message : String(e)]} />);
    return;
  }
  const r = await verificarIntegridad(db).catch((e): Integridad => ({ ok: false, detalle: [String(e)] }));
  if (!r.ok) {
    render(<BdDanada detalle={r.detalle} onContinuar={() => render(app)} />);
    return;
  }
  render(app);
  const mantenimiento = mantenimientoAlIniciar(db)
    // Los avisos (Drive, tasa de hoy con los feriados recién cargados) se leyeron al montar: se recargan.
    .then(invalidate)
    .catch((e) => reportError(e, "Respaldo automático"));
  marcarArranque({ integridadOk: true, mantenimiento });
}

void arrancar();
