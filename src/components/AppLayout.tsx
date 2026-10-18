import { NavLink, Outlet } from "react-router";
import { FolderKanban, LineChart, Settings, Users } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

const items = [
  { to: "/campanas", label: "Campañas", icon: FolderKanban },
  { to: "/gerentes", label: "Gerentes", icon: Users },
  { to: "/tasas", label: "Tasas", icon: LineChart },
  { to: "/configuracion", label: "Configuración", icon: Settings },
];

export function AppLayout() {
  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside className="flex w-56 shrink-0 flex-col gap-1 border-r bg-muted/40 p-3">
        <div className="px-2 py-3 text-lg font-semibold">Control de Pagos</div>
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => cn("flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted", isActive && "bg-muted font-medium")}
          >
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
