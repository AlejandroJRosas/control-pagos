import { useState } from "react";
import { NavLink, Outlet } from "react-router";
import { FolderKanban, FolderOpen, Keyboard, LineChart, Search, Settings, Users } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { BusquedaGlobal } from "@/components/BusquedaGlobal";
import { AyudaAtajos, Tecla } from "@/components/AyudaAtajos";
import { useAtajo } from "@/hooks/useAtajo";
import { getCampana } from "@/db/repos/campanas";
import { useData } from "@/hooks/useData";
import { useCampanaActual } from "@/lib/campanaActual";
import { cn } from "@/lib/utils";

const items = [
  { to: "/campanas", label: "Campañas", icon: FolderKanban },
  { to: "/gerentes", label: "Gerentes", icon: Users },
  { to: "/tasas", label: "Tasas", icon: LineChart },
  { to: "/configuracion", label: "Configuración", icon: Settings },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors",
    isActive ? "bg-primary font-semibold text-primary-foreground shadow-sm" : "hover:bg-fila-hover",
  );

export function AppLayout() {
  const actualId = useCampanaActual();
  const { data: actual } = useData(async (db) => (actualId ? await getCampana(db, actualId) : null), [actualId]);
  const [buscar, setBuscar] = useState(false);
  const [ayuda, setAyuda] = useState(false);
  useAtajo("k", () => setBuscar(true), { ctrl: true });
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
      <aside className="flex w-56 shrink-0 flex-col gap-1 border-r bg-muted/40 p-3">
        <div className="px-2 py-3 text-lg font-semibold">Control de Pagos</div>
        <button
          type="button"
          onClick={() => setBuscar(true)}
          className="mb-2 flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-fila-hover"
        >
          <Search className="size-4" />
          <span className="flex-1 text-left">Buscar…</span>
          <span className="flex gap-0.5">
            <Tecla>Ctrl</Tecla>
            <Tecla>K</Tecla>
          </span>
        </button>
        {actual && (
          <div className="mb-2">
            <div className="px-2 pb-1 text-xs text-muted-foreground">Campaña actual</div>
            <NavLink to={`/campanas/${actual.id}`} className={linkClass} title={actual.nombre}>
              <FolderOpen className="size-4 shrink-0" />
              <span className="truncate">{actual.nombre}</span>
            </NavLink>
          </div>
        )}
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === "/campanas"} className={linkClass}>
            <Icon className="size-4" />
            {label}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setAyuda(true)}
          className="mt-auto flex items-center gap-2 rounded-md px-2 py-2 text-xs text-muted-foreground transition-colors hover:bg-fila-hover"
        >
          <Keyboard className="size-4" />
          <span className="flex-1 text-left">Atajos de teclado</span>
          <Tecla>?</Tecla>
        </button>
      </aside>
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
      <Toaster richColors position="bottom-right" />
      <BusquedaGlobal open={buscar} onOpenChange={setBuscar} />
      <AyudaAtajos open={ayuda} onOpenChange={setAyuda} />
    </div>
  );
}
