import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet } from "react-router";
import { Download, FolderKanban, FolderOpen, GraduationCap, Keyboard, LayoutDashboard, LineChart, PanelLeftClose, PanelLeftOpen, Search, Settings, Users } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { BusquedaGlobal } from "@/components/BusquedaGlobal";
import { AyudaAtajos, Tecla } from "@/components/AyudaAtajos";
import { AvisoActualizacion } from "@/components/AvisoActualizacion";
import { AvisoTasaFaltante } from "@/components/AvisoTasaFaltante";
import { AvisoEspejo } from "@/components/AvisoEspejo";
import { SoltarImagenes } from "@/components/SoltarImagenes";
import { VolverArriba } from "@/components/VolverArriba";
import { Tutorial } from "@/features/tutorial/Tutorial";
import { useAtajo } from "@/hooks/useAtajo";
import { getCampana } from "@/db/repos/campanas";
import { useData } from "@/hooks/useData";
import { useBarraLateral } from "@/lib/barraLateral";
import { useZoomApp } from "@/lib/zoomApp";
import { abrirAvisoActualizacion, useActualizacion } from "@/platform/actualizacion";
import { useCampanaActual } from "@/lib/campanaActual";
import { cn } from "@/lib/utils";
import { avisarErrorDeCierre } from "@/lib/instalarCierre";
import { reportError } from "@/lib/reportError";
import { abrirTutorial } from "@/lib/tutorial";

const items = [
  { to: "/resumen", label: "Resumen", icon: LayoutDashboard },
  { to: "/campanas", label: "Campañas", icon: FolderKanban },
  { to: "/gerentes", label: "Gerentes", icon: Users },
  { to: "/tasas", label: "Tasas", icon: LineChart },
];

const linkClass = (colapsada: boolean) => ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex items-center gap-2 rounded-md px-2 py-2 text-sm whitespace-nowrap transition-colors",
    colapsada && "justify-center",
    isActive ? "bg-primary font-semibold text-primary-foreground shadow-sm" : "hover:bg-fila-hover",
  );

/** Con la barra colapsada solo quedan los íconos; el texto pasa al `title`. */
const textoClass = (colapsada: boolean) => cn("flex-1 truncate text-left", colapsada && "sr-only");

export function AppLayout() {
  const actualId = useCampanaActual();
  const { data: actual } = useData(async (db) => (actualId ? await getCampana(db, actualId) : null), [actualId]);
  const [buscar, setBuscar] = useState(false);
  const [ayuda, setAyuda] = useState(false);
  const barra = useBarraLateral();
  const main = useRef<HTMLElement>(null);
  useZoomApp();
  const { update } = useActualizacion();
  useEffect(() => {
    avisarErrorDeCierre().catch(reportError);
  }, []);
  const c = barra.colapsada;
  useAtajo("k", () => setBuscar(true), { ctrl: true });
  useAtajo("b", barra.alternar, { ctrl: true });
  useAtajo("?", () => setAyuda(true));
  useAtajo("/", () => {
    const campo = document.querySelector<HTMLInputElement>("[data-buscar-tabla]");
    if (campo) {
      campo.focus();
      campo.select();
    } else setBuscar(true);
  });

  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside className={cn("flex shrink-0 flex-col gap-1 overflow-hidden border-r bg-muted/40 p-3 transition-[width]", c ? "w-14 px-2" : "w-56")}>
        <div className={cn("flex items-center gap-1 py-2", c ? "justify-center" : "pl-2")}>
          {!c && <span className="flex-1 truncate text-lg font-semibold">Control de Pagos</span>}
          <button
            type="button"
            onClick={barra.alternar}
            title={c ? "Expandir la barra (Ctrl+B)" : "Colapsar la barra (Ctrl+B)"}
            aria-label={c ? "Expandir la barra lateral" : "Colapsar la barra lateral"}
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-fila-hover hover:text-foreground"
          >
            {c ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
        </div>
        <button
          type="button"
          onClick={() => setBuscar(true)}
          title="Buscar (Ctrl+K)"
          data-tour="buscar"
          className={cn(
            "mb-2 flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-fila-hover",
            c && "justify-center",
          )}
        >
          <Search className="size-4 shrink-0" />
          <span className={textoClass(c)}>Buscar…</span>
          {!c && (
            <span className="flex gap-0.5">
              <Tecla>Ctrl</Tecla>
              <Tecla>K</Tecla>
            </span>
          )}
        </button>
        {actual && (
          <div className="mb-2 border-b pb-3">
            {!c && <div className="px-2 pb-1 text-xs text-muted-foreground">Campaña actual</div>}
            <NavLink to={`/campanas/${actual.id}`} className={linkClass(c)} title={c ? `Campaña actual: ${actual.nombre}` : actual.nombre}>
              <FolderOpen className="size-4 shrink-0" />
              <span className={textoClass(c)}>{actual.nombre}</span>
            </NavLink>
          </div>
        )}
        <nav data-tour="navegacion" className="flex flex-col gap-1">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === "/campanas"} className={linkClass(c)} title={c ? label : undefined}>
              <Icon className="size-4 shrink-0" />
              <span className={textoClass(c)}>{label}</span>
            </NavLink>
          ))}
        </nav>
        {update && (
          <button
            type="button"
            onClick={abrirAvisoActualizacion}
            title={c ? `Actualizar a la versión ${update.version}` : undefined}
            className={cn(
              "mt-auto flex items-center gap-2 rounded-md bg-primary px-2 py-2 text-sm font-medium whitespace-nowrap text-primary-foreground shadow-sm transition-opacity hover:opacity-90",
              c && "justify-center",
            )}
          >
            <Download className="size-4 shrink-0" />
            <span className={textoClass(c)}>Actualizar a {update.version}</span>
          </button>
        )}
        <div data-tour="ayuda" className={cn("flex flex-col gap-1", !update && "mt-auto")}>
          <button
            type="button"
            onClick={abrirTutorial}
            title={c ? "Tutorial: recorrido por la app" : "Recorrido por la app"}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-2 text-xs whitespace-nowrap text-muted-foreground transition-colors hover:bg-fila-hover",
              c && "justify-center",
            )}
          >
            <GraduationCap className="size-4 shrink-0" />
            <span className={textoClass(c)}>Tutorial</span>
          </button>
          <button
            type="button"
            onClick={() => setAyuda(true)}
            title={c ? "Atajos de teclado (?)" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-2 text-xs whitespace-nowrap text-muted-foreground transition-colors hover:bg-fila-hover",
              c && "justify-center",
            )}
          >
            <Keyboard className="size-4 shrink-0" />
            <span className={textoClass(c)}>Atajos de teclado</span>
            {!c && <Tecla>?</Tecla>}
          </button>
        </div>
        <NavLink to="/configuracion" className={linkClass(c)} title={c ? "Configuración" : undefined}>
          <Settings className="size-4 shrink-0" />
          <span className={textoClass(c)}>Configuración</span>
        </NavLink>
      </aside>
      <main ref={main} className="flex-1 overflow-auto p-6">
        <AvisoEspejo />
        <AvisoTasaFaltante />
        <Outlet />
        <VolverArriba contenedor={main} />
      </main>
      <Toaster richColors position="top-right" />
      <BusquedaGlobal open={buscar} onOpenChange={setBuscar} />
      <AyudaAtajos open={ayuda} onOpenChange={setAyuda} />
      <AvisoActualizacion />
      <SoltarImagenes />
      <Tutorial />
    </div>
  );
}
