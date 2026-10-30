import { useEffect, useMemo, useState, type DragEvent, type MouseEvent, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { Lock, Move } from "lucide-react";
import { toast } from "sonner";
import { getDb } from "@/db";
import { moverAJefe, restaurarJefes } from "@/db/operaciones/moverAJefe";
import { MOTIVO_CERRADA } from "@/components/BotonConMotivo";
import { resumenesDeRama, type GerenteResumen } from "@/domain/campanaView";
import { acomodarDirectos, aplanarArbol, armarArbol, creaCiclo, type Jefes, type LugarDirecto, type NodoArbol } from "@/domain/arbol";
import { clicSeleccion, SIN_SELECCION, type Seleccion } from "@/domain/seleccion";
import { hayDialogoAbierto } from "@/hooks/useAtajo";
import { invalidate } from "@/hooks/useData";
import { reportError } from "@/lib/reportError";
import { useRamasPlegadas } from "@/lib/ramasPlegadas";
import { cn } from "@/lib/utils";
import { CajitaGerente, TIPO_ARRASTRE, type Arrastre } from "./CajitaGerente";
import { LienzoOrganigrama } from "./LienzoOrganigrama";

type Nodo = NodoArbol<GerenteResumen>;
type Props = { campanaId: number; gerentes: GerenteResumen[]; jefes: Jefes; cerrada: boolean };

const idDe = (g: GerenteResumen) => g.asignacionId;
const contar = (n: Nodo): number => n.hijos.reduce((s, h) => s + 1 + contar(h), 0);
const esHoja = (n: Nodo) => n.hijos.length === 0;

/** Organigrama de la campaña: cada gerente encima de su gente. Se arrastra uno sobre otro para cambiarle el jefe. */
export function EstructuraTab({ campanaId, gerentes, jefes, cerrada }: Props) {
  const navigate = useNavigate();
  const ramas = useRamasPlegadas(`estructura-${campanaId}`);
  const [arrastrando, setArrastrando] = useState<number[] | null>(null);
  const [seleccion, setSeleccion] = useState<Seleccion>(SIN_SELECCION);
  const [sobre, setSobre] = useState<number | "sueltos" | "punta" | null>(null);
  const { arboles, sueltos } = useMemo(() => {
    const orden = [...gerentes].sort((a, b) => a.gerenteNombre.localeCompare(b.gerenteNombre, "es"));
    const raices = armarArbol(orden, idDe, jefes);
    return { arboles: raices.filter((r) => !esHoja(r)), sueltos: raices.filter(esHoja).map((r) => r.item) };
  }, [gerentes, jefes]);
  const deRama = useMemo(() => resumenesDeRama(arboles, idDe), [arboles]);
  const nombres = useMemo(() => new Map(gerentes.map((g) => [g.asignacionId, g.gerenteNombre])), [gerentes]);

  /** Las cajitas en el orden en que se ven: la pirámide (sin ramas plegadas) y luego «Sin estructura». */
  const orden = useMemo(() => [...aplanarArbol(arboles, idDe).map((f) => idDe(f.item)), ...sueltos.map(idDe)], [arboles, sueltos]);
  const elegidos = useMemo(() => orden.filter((id) => seleccion.marcados.has(id)), [orden, seleccion]);
  const hayElegidos = !cerrada && elegidos.length > 0;

  // Esc suelta la selección y no vuelve atrás: en captura, antes del Esc de PageHeader.
  useEffect(() => {
    if (!hayElegidos) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || hayDialogoAbierto()) return;
      e.preventDefault();
      e.stopPropagation();
      setSeleccion(SIN_SELECCION);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [hayElegidos]);

  /** Destino válido para lo que se arrastra: ni una de ellas, ni alguien de su rama, y que al menos una cambie de jefe. */
  const valido = (destino: number | null) =>
    !cerrada &&
    arrastrando !== null &&
    arrastrando.some((id) => (jefes.get(id) ?? null) !== destino) &&
    !arrastrando.some((id) => creaCiclo(jefes, id, destino));

  async function mover(arrastrados: number[], jefe: number | null) {
    // Solo cuentan (y se tocan) los que de verdad cambian de jefe.
    const ids = arrastrados.filter((id) => (jefes.get(id) ?? null) !== jefe);
    if (ids.length === 0) return;
    // Arrastrar una cajita que no estaba elegida no suelta la selección.
    const deLaSeleccion = arrastrados.some((id) => seleccion.marcados.has(id));
    const destino = jefe === null ? null : (nombres.get(jefe) ?? "");
    const texto =
      ids.length === 1
        ? jefe === null
          ? `${nombres.get(ids[0])} ya no tiene jefe`
          : `${nombres.get(ids[0])} ahora está bajo ${destino}`
        : jefe === null
          ? `${ids.length} gerentes ya no tienen jefe`
          : `${ids.length} gerentes ahora están bajo ${destino}`;
    try {
      const anteriores = await moverAJefe(await getDb(), ids, jefe);
      if (deLaSeleccion) setSeleccion(SIN_SELECCION);
      invalidate();
      toast.success(texto, {
        duration: 10_000,
        action: {
          label: "Deshacer",
          onClick: async () => {
            try {
              await restaurarJefes(await getDb(), anteriores);
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
      const ids = arrastrando;
      if (ids === null) return;
      e.preventDefault();
      e.stopPropagation();
      const ok = valido(destino);
      terminar();
      if (ok) void mover(ids, destino);
    },
  });

  const arrastre = (g: GerenteResumen): Arrastre | undefined =>
    cerrada
      ? undefined
      : {
          zona: zona(g.asignacionId),
          resaltado: sobre === g.asignacionId,
          origen: arrastrando?.includes(g.asignacionId) ?? false,
          onDragStart: (e) => {
            e.dataTransfer.setData(TIPO_ARRASTRE, String(g.asignacionId));
            e.dataTransfer.effectAllowed = "move";
            setArrastrando(elegidos.includes(g.asignacionId) ? elegidos : [g.asignacionId]);
          },
          onDragEnd: terminar,
        };

  /** Ctrl/Shift + clic elige (no abre); el clic simple abre al gerente. Con la campaña cerrada no se elige. */
  const clic = (id: number) => (e: MouseEvent) => {
    if (!cerrada && (e.ctrlKey || e.metaKey || e.shiftKey)) setSeleccion((s) => clicSeleccion(s, orden, id, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey }));
    else navigate(`/asignaciones/${id}`);
  };

  const cajita = (n: Nodo) => {
    const g = n.item;
    return (
      <CajitaGerente
        g={g}
        cerrada={cerrada}
        rama={deRama.get(g.asignacionId)}
        debajo={contar(n)}
        plegada={n.hijos.length > 0 ? ramas.plegados.has(g.asignacionId) : undefined}
        onAlternar={() => ramas.alternar(g.asignacionId)}
        onClic={clic(g.asignacionId)}
        elegida={hayElegidos && seleccion.marcados.has(g.asignacionId)}
        arrastre={arrastre(g)}
      />
    );
  };

  /** Se ve como una sola cajita: sin gente o con la rama plegada. */
  const compacta = (n: Nodo) => esHoja(n) || ramas.plegados.has(n.item.asignacionId);

  /** Las hojas de un jefe: en columna sobre la línea (1 columna) o en un recuadro de 2 o 3 columnas. */
  const bloqueHojas = (nodos: Nodo[], columnas: number) =>
    columnas === 1 ? (
      <div className="relative flex flex-col items-center gap-2">
        <span aria-hidden className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border" />
        {nodos.map((h) => (
          <div key={h.item.asignacionId} className="relative">
            {rama(h)}
          </div>
        ))}
      </div>
    ) : (
      <div className={cn("grid gap-2 rounded-lg border border-dashed bg-background/60 p-2", columnas === 2 ? "grid-cols-2" : "grid-cols-3")}>
        {nodos.map((h) => (
          <div key={h.item.asignacionId}>{rama(h)}</div>
        ))}
      </div>
    );

  /**
   * Una fila de directos colgando de una línea horizontal. En la grilla la línea arranca en el tronco de la izquierda;
   * si no, va del primero al último.
   */
  const fila = (lugares: LugarDirecto<GerenteResumen>[], enGrilla: boolean) => (
    <div className={cn("flex items-start", enGrilla && "pb-4")}>
      {lugares.map((l, i) => (
        <div key={l.tipo === "rama" ? l.nodo.item.asignacionId : "hojas"} className="relative flex flex-col items-center px-3 pt-5">
          {(enGrilla || lugares.length > 1) && (
            <span
              aria-hidden
              className={cn("absolute top-0 h-px bg-border", i === 0 && !enGrilla ? "left-1/2" : "left-0", i === lugares.length - 1 ? "right-1/2" : "right-0")}
            />
          )}
          <span aria-hidden className="absolute top-0 left-1/2 h-5 w-px bg-border" />
          {l.tipo === "rama" ? rama(l.nodo) : bloqueHojas(l.nodos, l.columnas)}
        </div>
      ))}
    </div>
  );

  /**
   * Un nodo: la cajita encima de su gente (`acomodarDirectos`). Con pocos lugares van en una fila centrada; con más, en
   * una grilla de filas que cuelgan de un tronco que baja desde el centro del jefe (por eso el jefe va a la izquierda).
   */
  const rama = (n: Nodo): ReactNode => {
    const abierta = n.hijos.length > 0 && !ramas.plegados.has(n.item.asignacionId);
    const filas = abierta ? acomodarDirectos(n.hijos, compacta) : [];
    const enGrilla = filas.length > 1;
    const [unico] = filas.length === 1 && filas[0].length === 1 ? filas[0] : [];
    return (
      <div role="group" aria-label={`Rama de ${n.item.gerenteNombre}`} className={cn("flex flex-col", enGrilla ? "items-start" : "items-center")}>
        {cajita(n)}
        {abierta && <span aria-hidden className={cn("h-5 w-px bg-border", enGrilla && "ml-20")} />}
        {unico?.tipo === "hojas" ? bloqueHojas(unico.nodos, unico.columnas) : filas.length === 1 && fila(filas[0], false)}
        {enGrilla && (
          <div className="ml-20 flex flex-col">
            {filas.map((f, i) => (
              <div key={i} className="relative">
                {i < filas.length - 1 && <span aria-hidden className="absolute inset-y-0 left-0 w-px bg-border" />}
                {fila(f, true)}
              </div>
            ))}
          </div>
        )}
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
            Arrastra un gerente sobre otro para ponerlo debajo; suéltalo arriba, fuera de las cajitas, o en «Sin estructura» para quitarle el jefe. Con
            Ctrl o Shift + clic eliges varios para moverlos a la vez.
          </>
        )}
      </p>
      {hayElegidos && (
        <p role="status" className="text-sm font-medium">
          {`${elegidos.length} ${elegidos.length === 1 ? "elegido" : "elegidos"} · Esc para soltar`}
        </p>
      )}
      {arboles.length === 0 ? (
        <div
          role="region"
          aria-label="Organigrama"
          {...(cerrada ? {} : zona(null, "punta"))}
          className={cn("rounded-xl border bg-muted/30 p-6 transition-colors", sobre === "punta" && "border-primary-intenso bg-fila-hover")}
        >
          <p className="py-6 text-center text-sm text-muted-foreground">Todavía nadie tiene gente a cargo.</p>
        </div>
      ) : (
        <LienzoOrganigrama clave={`estructura-${campanaId}`} zona={cerrada ? {} : zona(null, "punta")} resaltado={sobre === "punta"}>
          {/* Las puntas también se reparten en filas para no hacer un organigrama larguísimo a lo ancho. */}
          <div className="flex flex-col gap-10">
            {acomodarDirectos(arboles, compacta).map((f, i) => (
              <div key={i} className="flex items-start gap-10">
                {f.map((l) => (l.tipo === "rama" ? <div key={l.nodo.item.asignacionId}>{rama(l.nodo)}</div> : <div key="hojas">{bloqueHojas(l.nodos, l.columnas)}</div>))}
              </div>
            ))}
          </div>
        </LienzoOrganigrama>
      )}
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
                onClic={clic(g.asignacionId)}
                elegida={hayElegidos && seleccion.marcados.has(g.asignacionId)}
                arrastre={arrastre(g)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
