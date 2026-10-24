import { useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { Images } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Aviso, Cargando, Vacio } from "@/components/Feedback";
import { BuscadorSelect } from "@/components/BuscadorSelect";
import { getDb } from "@/db";
import { loadCampanaData, type CampanaData } from "@/db/queries/campanaData";
import { listBancosUsados } from "@/db/repos/depositos";
import { listGerentes, type Gerente } from "@/db/repos/gerentes";
import { asignarGerenteCola, listColaDepositos, quitarHechosDepositos, type ItemColaDeposito } from "@/db/repos/cola";
import { siguientePendiente } from "@/domain/cola";
import { SIN_SELECCION, type Seleccion } from "@/domain/seleccion";
import { invalidate, useData } from "@/hooks/useData";
import { reportError } from "@/lib/reportError";
import { sugerenciasBancos } from "@/domain/bancos";
import { contextoIncidencias } from "@/db/queries/incidenciasCola";
import { ListaCola, RevisionLayout, visiblesDe, type ElementoLista, type Filtro } from "./RevisionLayout";
import { motivosBorrador, type ContextoIncidencia } from "./incidencias";
import { EditorDeposito, type Editor } from "./EditorDeposito";
import { nombreDestino } from "./destino";

type Ctx = { data: CampanaData; items: ItemColaDeposito[]; gerentes: Gerente[]; bancos: string[]; contexto: Map<number, ContextoIncidencia> };

const LIMPIO: ContextoIncidencia = { duplicado: false, posibleRepetido: false, faltaTasa: false };

export function RevisionDepositosPage() {
  const campanaId = Number(useParams().campanaId);
  const { data: ctx, error } = useData<Ctx>(
    async (db) => {
      const items = await listColaDepositos(db, campanaId);
      return {
        data: await loadCampanaData(db, campanaId),
        items,
        gerentes: await listGerentes(db),
        bancos: sugerenciasBancos(await listBancosUsados(db)),
        contexto: await contextoIncidencias(db, items),
      };
    },
    [campanaId],
  );
  if (!ctx) return <Cargando error={error} />;
  return <Revision key={campanaId} {...ctx} />;
}

function Revision({ data, items, gerentes, bancos, contexto }: Ctx) {
  const campana = data.campana;
  const cerrada = campana.estado === "cerrada";
  const [actualId, setActualId] = useState<number | null>(() => siguientePendiente(items, null) ?? items[0]?.id ?? null);
  const [filtro, setFiltro] = useState<Filtro>("pendientes");
  const [seleccion, setSeleccion] = useState<Seleccion>(SIN_SELECCION);
  const [gerenteMasivo, setGerenteMasivo] = useState("");
  // El elemento abierto recibe el gerente por su formulario, para que su autoguardado no lo pise.
  const editor = useRef<Editor | null>(null);
  const actual = items.find((i) => i.id === actualId) ?? null;
  const hechos = items.filter((i) => i.estado === "hecho").length;
  // Lo que pasó a hecho deja de contar como marcado.
  const marcados = items.filter((i) => i.estado === "pendiente" && seleccion.marcados.has(i.id)).map((i) => i.id);
  const elementos: ElementoLista[] = items.map((i) => ({
    id: i.id,
    estado: i.estado,
    titulo: [i.borrador.draft.banco || "Sin banco", i.borrador.draft.montoBs].filter(Boolean).join(" · "),
    detalle: `${nombreDestino(i.borrador.destino, data, gerentes)} · ${i.nombreArchivo ?? `#${i.orden}`}`,
    motivos: i.estado === "pendiente" ? motivosBorrador(i.formato, i.borrador, contexto.get(i.id) ?? LIMPIO) : undefined,
  }));
  // "Siguiente" recorre lo que se ve: con el filtro de incidencias, solo los pendientes con incidencias.
  const recorrido = filtro === "incidencias" ? visiblesDe(elementos, filtro, actualId) : elementos;
  const irAlSiguiente = (desde: number | null) => setActualId(siguientePendiente(recorrido, desde));

  async function asignar() {
    if (!gerenteMasivo || marcados.length === 0) return;
    try {
      const ids = marcados;
      let n = 0;
      if (actual && actual.estado === "pendiente" && ids.includes(actual.id) && editor.current) {
        editor.current.setDestino({ sel: gerenteMasivo, nombre: "", saldo: "" });
        n += 1;
      }
      n += await asignarGerenteCola(
        await getDb(),
        ids.filter((id) => id !== actual?.id),
        gerenteMasivo,
      );
      toast.success(`Gerente asignado a ${n} comprobante(s)`);
      setSeleccion(SIN_SELECCION);
      invalidate();
    } catch (e) {
      reportError(e);
    }
  }

  async function quitarHechos() {
    try {
      const n = await quitarHechosDepositos(await getDb(), campana.id);
      toast.success(`${n} hecho(s) quitados de la cola`);
      if (actual?.estado === "hecho") irAlSiguiente(null);
      invalidate();
    } catch (e) {
      reportError(e);
    }
  }

  const lista = (
    <ListaCola
      items={elementos}
      conIncidencias
      actualId={actualId}
      onElegir={setActualId}
      filtro={filtro}
      onFiltro={setFiltro}
      seleccion={cerrada ? undefined : seleccion}
      onSeleccion={cerrada ? undefined : setSeleccion}
      pie={
        !cerrada && (
          <div className="grid gap-2 border-t pt-2">
            <BuscadorSelect
              value={gerenteMasivo}
              onChange={setGerenteMasivo}
              opciones={data.asignaciones.map((a) => ({ value: `a:${a.id}`, label: a.gerenteNombre }))}
              placeholder="Gerente para los marcados…"
            />
            <Button variant="outline" size="sm" disabled={!gerenteMasivo || marcados.length === 0} onClick={() => void asignar()}>
              Asignar gerente a marcados ({marcados.length})
            </Button>
          </div>
        )
      }
    />
  );

  return (
    <RevisionLayout
      migas={[{ to: "/campanas", label: "Campañas" }, { to: `/campanas/${campana.id}`, label: campana.nombre }]}
      titulo="Revisión de comprobantes"
      hechos={hechos}
      total={items.length}
      acciones={
        <>
          <Button variant="outline" disabled={hechos === 0} onClick={() => void quitarHechos()}>
            Quitar hechos
          </Button>
          {!cerrada && (
            <Link to={`/campanas/${campana.id}/lote`} className={buttonVariants({ variant: "outline" })}>
              <Images />
              Subir más
            </Link>
          )}
        </>
      }
      lista={lista}
      imagenPath={actual?.imagenPath ?? null}
    >
      {cerrada && <Aviso>La campaña está cerrada: la revisión es de solo lectura.</Aviso>}
      {actual ? (
        <EditorDeposito
          key={actual.id}
          item={actual}
          items={items}
          data={data}
          gerentes={gerentes}
          bancos={bancos}
          cerrada={cerrada}
          editor={editor}
          onSiguiente={() => irAlSiguiente(actual.id)}
          onSaltar={() => setActualId(siguientePendiente(recorrido, actual.id) ?? actual.id)}
        />
      ) : (
        <Vacio texto="No quedan comprobantes por revisar.">
          <Link to={`/campanas/${campana.id}`} className={buttonVariants({ variant: "outline" })}>
            Volver a la campaña
          </Link>
        </Vacio>
      )}
    </RevisionLayout>
  );
}
