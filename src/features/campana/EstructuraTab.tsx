import { useMemo, useState, type DragEvent } from "react";
import { useNavigate } from "react-router";
import { Lock, Move } from "lucide-react";
import { toast } from "sonner";
import { getDb } from "@/db";
import { setJefeAsignacion } from "@/db/repos/asignaciones";
import { MOTIVO_CERRADA } from "@/components/BotonConMotivo";
import { type GerenteResumen } from "@/domain/campanaView";
import { armarArbol, creaCiclo, type Jefes, type NodoArbol } from "@/domain/arbol";
import { invalidate } from "@/hooks/useData";
import { reportError } from "@/lib/reportError";
import { useRamasPlegadas } from "@/lib/ramasPlegadas";
import { cn } from "@/lib/utils";
import { CajitaGerente, TIPO_ARRASTRE, type Arrastre } from "./CajitaGerente";

type Nodo = NodoArbol<GerenteResumen>;
type Props = { campanaId: number; gerentes: GerenteResumen[]; jefes: Jefes; cerrada: boolean };

const idDe = (g: GerenteResumen) => g.asignacionId;
const contar = (n: Nodo): number => n.hijos.reduce((s, h) => s + 1 + contar(h), 0);
const esHoja = (n: Nodo) => n.hijos.length === 0;

/** Organigrama de la campaña: cada gerente encima de su gente. Se arrastra uno sobre otro para cambiarle el jefe. */
export function EstructuraTab({ campanaId, gerentes, jefes, cerrada }: Props) {
  const navigate = useNavigate();
  const ramas = useRamasPlegadas(`estructura-${campanaId}`);
  const [arrastrando, setArrastrando] = useState<number | null>(null);
  const [sobre, setSobre] = useState<number | "sueltos" | "punta" | null>(null);
  const { arboles, sueltos } = useMemo(() => {
    const orden = [...gerentes].sort((a, b) => a.gerenteNombre.localeCompare(b.gerenteNombre, "es"));
    const raices = armarArbol(orden, idDe, jefes);
    return { arboles: raices.filter((r) => !esHoja(r)), sueltos: raices.filter(esHoja).map((r) => r.item) };
  }, [gerentes, jefes]);
  const nombres = useMemo(() => new Map(gerentes.map((g) => [g.asignacionId, g.gerenteNombre])), [gerentes]);

  /** Destino válido para lo que se arrastra: ni él mismo, ni alguien de su rama, ni su jefe actual (no cambiaría nada). */
  const valido = (destino: number | null) =>
    !cerrada && arrastrando !== null && (jefes.get(arrastrando) ?? null) !== destino && !creaCiclo(jefes, arrastrando, destino);

  async function mover(id: number, jefe: number | null) {
    const anterior = jefes.get(id) ?? null;
    const nombre = nombres.get(id) ?? "";
    try {
      await setJefeAsignacion(await getDb(), id, jefe);
      invalidate();
      toast.success(jefe === null ? `${nombre} ya no tiene jefe` : `${nombre} ahora está bajo ${nombres.get(jefe)}`, {
        duration: 10_000,
        action: {
          label: "Deshacer",
          onClick: async () => {
            try {
              await setJefeAsignacion(await getDb(), id, anterior);
              invalidate();
              toast.success("Cambio deshecho");
            } catch (e) {
              reportError(e, "Deshacer");
            }
          },
        },
      });
    } catch (e) {
      reportError(e);
    }
  }

  const terminar = () => {
    setArrastrando(null);
    setSobre(null);
  };
  /**
   * Manejadores de una zona de soltar: `preventDefault` solo si el destino es válido, así el inválido no se resalta. Un
   * arrastre propio no se propaga (una cajita dentro de una zona no suelta también en ella); uno de afuera (imágenes, un
   * .cpagos) no se toca, para que lo reciba `SoltarImagenes` en la ventana.
   */
  const zona = (destino: number | null, marca: number | "sueltos" | "punta" = destino ?? "sueltos") => ({
    onDragOver: (e: DragEvent) => {
      if (arrastrando === null) return;
      e.stopPropagation();
      if (!valido(destino)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setSobre(marca);
    },
    onDragLeave: (e: DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSobre(null);
    },
    onDrop: (e: DragEvent) => {
      const id = arrastrando;
      if (id === null) return;
      e.preventDefault();
      e.stopPropagation();
      const ok = valido(destino);
      terminar();
      if (ok) void mover(id, destino);
    },
  });

  const arrastre = (g: GerenteResumen): Arrastre | undefined =>
    cerrada
      ? undefined
      : {
          zona: zona(g.asignacionId),
          resaltado: sobre === g.asignacionId,
          origen: arrastrando === g.asignacionId,
          onDragStart: (e) => {
            e.dataTransfer.setData(TIPO_ARRASTRE, String(g.asignacionId));
            e.dataTransfer.effectAllowed = "move";
            setArrastrando(g.asignacionId);
          },
          onDragEnd: terminar,
        };

  const cajita = (n: Nodo) => {
    const g = n.item;
    return (
      <CajitaGerente
        g={g}
        cerrada={cerrada}
        debajo={contar(n)}
        plegada={n.hijos.length > 0 ? ramas.plegados.has(g.asignacionId) : undefined}
        onAlternar={() => ramas.alternar(g.asignacionId)}
        onAbrir={() => navigate(`/asignaciones/${g.asignacionId}`)}
        arrastre={arrastre(g)}
      />
    );
  };

  /** Un nodo: la cajita encima de su gente. Si toda su gente son hojas, van en columna para no ensanchar la pirámide. */
  const rama = (n: Nodo) => {
    const abierta = n.hijos.length > 0 && !ramas.plegados.has(n.item.asignacionId);
    const enColumna = n.hijos.every(esHoja);
    return (
      <div role="group" aria-label={`Rama de ${n.item.gerenteNombre}`} className="flex flex-col items-center">
        {cajita(n)}
        {abierta && <span aria-hidden className="h-5 w-px bg-border" />}
        {abierta &&
          (enColumna ? (
            <div className="relative flex flex-col items-center gap-2">
              <span aria-hidden className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border" />
              {n.hijos.map((h) => (
                <div key={h.item.asignacionId} className="relative">
                  {rama(h)}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-start">
              {n.hijos.map((h, i) => (
                <div key={h.item.asignacionId} className="relative flex flex-col items-center px-2 pt-5">
                  {n.hijos.length > 1 && (
                    <span
                      aria-hidden
                      className={cn("absolute top-0 h-px bg-border", i === 0 ? "left-1/2" : "left-0", i === n.hijos.length - 1 ? "right-1/2" : "right-0")}
                    />
                  )}
                  <span aria-hidden className="absolute top-0 left-1/2 h-5 w-px bg-border" />
                  {rama(h)}
                </div>
              ))}
            </div>
          ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        {cerrada ? (
          <>
            <Lock className="size-4" />
            {MOTIVO_CERRADA}
          </>
        ) : (
          <>
            <Move className="size-4" />
            Arrastra un gerente sobre otro para ponerlo debajo; suéltalo arriba, fuera de las cajitas, o en «Sin estructura» para quitarle el jefe.
          </>
        )}
      </p>
      <div
        role="region"
        aria-label="Organigrama"
        {...(cerrada ? {} : zona(null, "punta"))}
        className={cn("overflow-x-auto rounded-xl border bg-muted/30 p-6 transition-colors", sobre === "punta" && "border-primary-intenso bg-fila-hover")}
      >
        {arboles.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Todavía nadie tiene gente a cargo.</p>
        ) : (
          <div className="mx-auto flex w-max items-start gap-10">
            {arboles.map((a) => (
              <div key={a.item.asignacionId}>{rama(a)}</div>
            ))}
          </div>
        )}
      </div>
      <section
        role="region"
        aria-label="Sin estructura"
        {...(cerrada ? {} : zona(null))}
        className={cn("rounded-xl border border-dashed p-4 transition-colors", sobre === "sueltos" && "border-primary-intenso bg-fila-hover")}
      >
        <h3 className="mb-3 text-sm font-medium">
          Sin estructura <span className="font-normal text-muted-foreground tabular-nums">{sueltos.length}</span>
        </h3>
        {sueltos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todos los gerentes están en la pirámide.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {sueltos.map((g) => (
              <CajitaGerente
                key={g.asignacionId}
                g={g}
                cerrada={cerrada}
                debajo={0}
                onAbrir={() => navigate(`/asignaciones/${g.asignacionId}`)}
                arrastre={arrastre(g)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
