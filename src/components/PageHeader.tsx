import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { ChevronLeft } from "lucide-react";
import { useAtajo } from "@/hooks/useAtajo";

type Props = { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { to: string; label: string } };

export function PageHeader({ title, subtitle, actions, back }: Props) {
  const navigate = useNavigate();
  useAtajo("Escape", () => back && navigate(back.to), { activo: !!back });
  return (
    <div className="mb-6 space-y-1">
      {back && (
        <Link to={back.to} title="Esc" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
