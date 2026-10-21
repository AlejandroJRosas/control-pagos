import { useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { Check, ChevronLeft, ChevronRight, ExternalLink, ImageOff } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { Aviso, Cargando, Vacio } from "@/components/Feedback";
import { Tecla } from "@/components/AyudaAtajos";
import { ZoomableImage } from "@/components/ZoomableImage";
import { getDb } from "@/db";
import { getCampana } from "@/db/repos/campanas";
import { deleteDepositos } from "@/db/repos/depositos";
import { loadDuplicadosCampana, type DepositoDuplicado } from "@/db/queries/duplicados";
import { formatFecha } from "@/domain/dates";
import { formatBs, formatUsd, toUsd } from "@/domain/money";
import { DomainError } from "@/domain/errors";
import { invalidate, useData } from "@/hooks/useData";
import { useAtajo } from "@/hooks/useAtajo";
import { avisarDepositosEliminados } from "@/lib/deshacer";
import { reportError } from "@/lib/reportError";
import { conVolver } from "@/lib/volver";
import { cn } from "@/lib/utils";

/** Datos que se comparan lado a lado; los que no coinciden entre los del grupo se resaltan. */
const CAMPOS: { etiqueta: string; valor: (d: DepositoDuplicado) => string; clase?: string }[] = [
  { etiqueta: "Fecha", valor: (d) => formatFecha(d.fecha), clase: "tabular-nums" },
  { etiqueta: "Monto", valor: (d) => formatBs(d.montoBs), clase: "tabular-nums font-semibold" },
  { etiqueta: "USD", valor: (d) => formatUsd(toUsd(d.montoBs, d.tasaValor)), clase: "tabular-nums" },
  { etiqueta: "Gerente", valor: (d) => d.gerenteNombre },
  { etiqueta: "Campaña", valor: (d) => d.campanaNombre + (d.campanaEstado === "cerrada" ? " (cerrada)" : "") },
  { etiqueta: "Cuenta destino", valor: (d) => d.cuentaDestino, clase: "font-mono text-xs" },
  { etiqueta: "Observaciones", valor: (d) => d.observaciones || "—" },
  { etiqueta: "Registrado", valor: (d) => new Date(d.creadoEn).toLocaleString("es-VE"), clase: "tabular-nums text-muted-foreground" },
];

/**
 * Depósitos con el mismo banco y referencia, un grupo a la vez y lado a lado: se elige cuál queda (clic, 1/2… o ←/→)
 * y se eliminan los demás (con Deshacer); luego pasa solo al siguiente grupo.
 */
export function DuplicadosPage() {
  const campanaId = Number(useParams().campanaId);
  const { data, error } = useData(
    async (db) => {
      const campana = await getCampana(db, campanaId);
      if (!campana) throw new DomainError("NO_ENCONTRADO", "La campaña no existe");
      return { campana, grupos: await loadDuplicadosCampana(db, campanaId) };
    },
    [campanaId],
  );
  if (!data) return <Cargando error={error} />;
  const { campana, grupos } = data;
  return (
    <div className="space-y-4">
      <PageHeader
        migas={[{ to: "/campanas", label: "Campañas" }, { to: `/campanas/${campanaId}`, label: campana.nombre }]}
        title="Depósitos duplicados"
        subtitle="Mismo banco y referencia: quédate con uno por grupo. Mientras haya duplicados no se puede exportar la campaña."
      />
      {grupos.length === 0 ? (
        <Vacio texto="No hay depósitos duplicados en esta campaña.">
          <Link to={`/campanas/${campanaId}`} className={buttonVariants({ variant: "outline" })}>
            Volver a la campaña
          </Link>
        </Vacio>
      ) : (
        <Comparar campanaId={campanaId} grupos={grupos} />
      )}
    </div>
  );
}

function Comparar({ campanaId, grupos }: { campanaId: number; grupos: DepositoDuplicado[][] }) {
  const location = useLocation();
  const [indice, setIndice] = useState(0);
  const [ocupado, setOcupado] = useState(false);
  // Al resolver uno, la lista se recarga sin él y el mismo índice ya es el siguiente.
  const i = Math.min(indice, grupos.length - 1);
  const g = grupos[i];
  // Quedarse con uno elimina los demás: si alguno de ellos está en una campaña cerrada, no se puede.
  const bloqueado = (d: DepositoDuplicado) => g.some((o) => o.id !== d.id && o.campanaEstado === "cerrada");
  const distinto = (valor: (d: DepositoDuplicado) => string) => new Set(g.map(valor)).size > 1;

  async function quedarse(d: DepositoDuplicado | undefined) {
    if (!d || ocupado || bloqueado(d)) return;
    setOcupado(true);
    try {
      const otros = g.filter((o) => o.id !== d.id).map((o) => o.id);
      avisarDepositosEliminados(await deleteDepositos(await getDb(), otros));
      invalidate();
    } catch (e) {
      reportError(e);
    } finally {
      setOcupado(false);
    }
  }

  // Siempre las mismas nueve llamadas (1 a 9), así que el orden de los hooks no cambia.
  for (let n = 1; n <= 9; n++) useAtajo(String(n), () => void quedarse(g[n - 1]));
  useAtajo("ArrowLeft", () => void quedarse(g[0]), { activo: g.length === 2 });
  useAtajo("ArrowRight", () => void quedarse(g[1]), { activo: g.length === 2 });

  const cerradas = [...new Set(g.filter((d) => d.campanaEstado === "cerrada").map((d) => d.campanaNombre))];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <div className="text-lg font-semibold">
            {g[0].banco} · Ref. <span className="font-mono">{g[0].referencia}</span>
          </div>
          <div className="text-sm text-muted-foreground">
            Grupo {i + 1} de {grupos.length} · {g.length} depósitos
          </div>
        </div>
        <Button variant="outline" size="sm" disabled={i === 0} onClick={() => setIndice(i - 1)}>
          <ChevronLeft />
          Anterior
        </Button>
        <Button variant="outline" size="sm" disabled={i === grupos.length - 1} onClick={() => setIndice(i + 1)}>
          Siguiente
          <ChevronRight />
        </Button>
      </div>
      {cerradas.length > 0 && (
        <Aviso tono="warning">Hay depósitos en una campaña cerrada ({cerradas.join(", ")}): solo se puede quedar con uno de ellos, o reabrir esa campaña.</Aviso>
      )}
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${g.length}, minmax(0, 1fr))` }}>
        {g.map((d, n) => (
          <section key={d.id} aria-label={`Opción ${n + 1}`} className="flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-3">
            <Button className="w-full" size="lg" disabled={ocupado || bloqueado(d)} onClick={() => void quedarse(d)}>
              <Check />
              Quedarse con este
              <Tecla className="border-primary-foreground/25 bg-primary-foreground/10 text-primary-foreground">
                {g.length === 2 ? `${n + 1} / ${n === 0 ? "←" : "→"}` : String(n + 1)}
              </Tecla>
            </Button>
            {d.imagenPath ? (
              <ZoomableImage imagen={{ path: d.imagenPath }} className="h-[45vh] min-h-64 rounded-md border" />
            ) : (
              <div className="flex h-[45vh] min-h-64 flex-col items-center justify-center gap-2 rounded-md border border-dashed text-sm text-muted-foreground">
                <ImageOff className="size-6" />
                Sin comprobante
              </div>
            )}
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
              {CAMPOS.map((c) => (
                <div key={c.etiqueta} className={cn("col-span-2 grid grid-cols-subgrid rounded px-1", distinto(c.valor) && "bg-amber-100 dark:bg-amber-950/60")}>
                  <dt className="text-muted-foreground">{c.etiqueta}</dt>
                  <dd className={cn("break-words", c.clase, c.etiqueta === "Campaña" && d.campanaId !== campanaId && "font-medium text-amber-700 dark:text-amber-400")}>
                    {c.valor(d)}
                  </dd>
                </div>
              ))}
            </dl>
            <Link
              to={`/depositos/${d.id}`}
              state={conVolver(location, "Depósitos duplicados")}
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "self-start")}
            >
              <ExternalLink />
              Abrir depósito
            </Link>
          </section>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Los datos resaltados son los que no coinciden. Lo eliminado se puede deshacer desde el aviso.</p>
    </div>
  );
}
