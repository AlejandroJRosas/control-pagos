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
import { invalidate, useData } from "@/hooks/useData";
import { reportError } from "@/lib/reportError";
import { sugerenciasBancos } from "@/domain/bancos";
import { ListaCola, RevisionLayout, type Filtro } from "./RevisionLayout";
import { EditorDeposito, type Editor } from "./EditorDeposito";
import { nombreDestino } from "./destino";

type Ctx = { data: CampanaData; items: ItemColaDeposito[]; gerentes: Gerente[]; bancos: string[] };

export function RevisionDepositosPage() {
  const campanaId = Number(useParams().campanaId);
  const { data: ctx, error } = useData<Ctx>(
    async (db) => ({
      data: await loadCampanaData(db, campanaId),
      items: await listColaDepositos(db, campanaId),
      gerentes: await listGerentes(db),
      bancos: sugerenciasBancos(await listBancosUsados(db)),
    }),
    [campanaId],
  );
  if (!ctx) return <Cargando error={error} />;
  return <Revision key={campanaId} {...ctx} />;
}

function Revision({ data, items, gerentes, bancos }: Ctx) {
  const campana = data.campana;
  const cerrada = campana.estado === "cerrada";
  const [actualId, setActualId] = useState<number | null>(() => siguientePendiente(items, null) ?? items[0]?.id ?? null);
  const [filtro, setFiltro] = useState<Filtro>("pendientes");
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [gerenteMasivo, setGerenteMasivo] = useState("");
  // El elemento abierto recibe el gerente por su formulario, para que su autoguardado no lo pise.
  const editor = useRef<Editor | null>(null);
  const actual = items.find((i) => i.id === actualId) ?? null;
  const hechos = items.filter((i) => i.estado === "hecho").length;
  const irAlSiguiente = (desde: number | null) => setActualId(siguientePendiente(items, desde));

  async function asignar() {
    if (!gerenteMasivo || marcados.size === 0) return;
    try {
      const ids = [...marcados];
      let n = 0;
      if (actual && actual.estado === "pendiente" && marcados.has(actual.id) && editor.current) {
        editor.current.setDestino({ sel: gerenteMasivo, nombre: "", saldo: "" });
        n += 1;
      }
      n += await asignarGerenteCola(
        await getDb(),
        ids.filter((id) => id !== actual?.id),
        gerenteMasivo,
      );
      toast.success(`Gerente asignado a ${n} comprobante(s)`);
      setMarcados(new Set());
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
      items={items.map((i) => ({
        id: i.id,
        estado: i.estado,
        titulo: [i.borrador.draft.banco || "Sin banco", i.borrador.draft.montoBs].filter(Boolean).join(" · "),
        detalle: `${nombreDestino(i.borrador.destino, data, gerentes)} · ${i.nombreArchivo ?? `#${i.orden}`}`,
      }))}
      actualId={actualId}
      onElegir={setActualId}
      filtro={filtro}
      onFiltro={setFiltro}
      marcados={cerrada ? undefined : marcados}
      onMarcar={
        cerrada
          ? undefined
          : (id, m) =>
              setMarcados((s) => {
                const n = new Set(s);
                if (m) n.add(id);
                else n.delete(id);
                return n;
              })
      }
      pie={
        !cerrada && (
          <div className="grid gap-2 border-t pt-2">
            <BuscadorSelect
              value={gerenteMasivo}
              onChange={setGerenteMasivo}
              opciones={data.asignaciones.map((a) => ({ value: `a:${a.id}`, label: a.gerenteNombre }))}
              placeholder="Gerente para los marcados…"
            />
            <Button variant="outline" size="sm" disabled={!gerenteMasivo || marcados.size === 0} onClick={() => void asignar()}>
              Asignar gerente a marcados ({marcados.size})
            </Button>
          </div>
        )
      }
    />
  );

  return (
    <RevisionLayout
      back={{ to: `/campanas/${campana.id}`, label: campana.nombre }}
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
          onSaltar={() => setActualId(siguientePendiente(items, actual.id) ?? actual.id)}
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
