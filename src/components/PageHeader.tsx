import { Fragment, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAtajo } from "@/hooks/useAtajo";

export type Miga = { to: string; label: string };

type Props = {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Pantallas de arriba, de la más general a la más cercana (sin la actual). */
  migas?: Miga[];
  /** Adónde vuelve Esc; sin él, a la última miga. Si no es una de ellas (se abrió desde otra lista), va aparte con su flecha. */
  back?: Miga;
};

const sinQuery = (to: string) => to.split("?")[0];

export function PageHeader({ title, subtitle, actions, migas = [], back }: Props) {
  const navigate = useNavigate();
  const destino = back ?? migas[migas.length - 1];
  useAtajo("Escape", () => destino && navigate(destino.to), { activo: !!destino });
  // Si se vuelve a una de las migas, su enlace lleva lo de `back` (p. ej. la pestaña o los filtros de la lista).
  const enRuta = back ? migas.findIndex((m) => sinQuery(m.to) === sinQuery(back.to)) : -1;
  const ruta = migas.map((m, i) => (i === enRuta && back ? { ...m, to: back.to } : m));
  const aparte = back && enRuta < 0 ? back : null;
  return (
    <div className="mb-6 space-y-1">
      {(aparte || ruta.length > 0) && (
        <nav aria-label="Ruta" className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-sm text-muted-foreground">
          {aparte && (
            <>
              <Link to={aparte.to} title="Esc" className="inline-flex items-center gap-1 hover:text-foreground">
                <ChevronLeft className="size-4" />
                {aparte.label}
              </Link>
              {ruta.length > 0 && <span className="px-1.5 text-muted-foreground/60">·</span>}
            </>
          )}
          {ruta.map((m, i) => (
            <Fragment key={m.to}>
              {i > 0 && <ChevronRight className="size-3.5 text-muted-foreground/60" />}
              <Link to={m.to} title={!aparte && i === ruta.length - 1 ? "Esc" : undefined} className="max-w-64 truncate hover:text-foreground">
                {m.label}
              </Link>
            </Fragment>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && (
          <div data-tour="acciones" className="flex flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
