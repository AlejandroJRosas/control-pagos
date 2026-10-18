import { NavLink, Outlet } from "react-router";
import { FolderKanban, FolderOpen, LineChart, Settings, Users } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
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

  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside className="flex w-56 shrink-0 flex-col gap-1 border-r bg-muted/40 p-3">
        <div className="px-2 py-3 text-lg font-semibold">Control de Pagos</div>
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
      </aside>
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
      <Toaster richColors position="bottom-right" />
    </div>
  );
}
