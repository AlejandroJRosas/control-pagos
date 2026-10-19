import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { Check, Images, SkipForward, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Aviso, Cargando, Vacio } from "@/components/Feedback";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { BuscadorSelect } from "@/components/BuscadorSelect";
import { getDb } from "@/db";
import { loadCampanaData, type CampanaData } from "@/db/queries/campanaData";
import { listBancosUsados } from "@/db/repos/depositos";
import { listGerentes, type Gerente } from "@/db/repos/gerentes";
import {
  asignarGerenteCola,
  descartarDeposito,
  guardarBorradorDeposito,
  listColaDepositos,
  quitarHechosDepositos,
  type BorradorDeposito,
  type ItemColaDeposito,
} from "@/db/repos/cola";
import { completarDeposito } from "@/db/operaciones/revision";
import { duplicadosEnCola, siguientePendiente } from "@/domain/cola";
import type { DestinoDraft } from "@/domain/validation";
import { deleteImage } from "@/platform/images";
import { invalidate, useData } from "@/hooks/useData";
import { reportError } from "@/lib/reportError";
import { conVolver } from "@/lib/volver";
import { sugerenciasBancos } from "@/domain/bancos";
import { DepositoCampos } from "@/features/deposito/DepositoCampos";
import { useDepositoForm } from "@/features/deposito/useDepositoForm";
import { ListaCola, RevisionLayout, type Filtro } from "./RevisionLayout";
import { useAutoguardado } from "./useAutoguardado";

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

/** Nombre del gerente elegido en un borrador, para la lista. */
function nombreDestino(d: DestinoDraft, data: CampanaData, gerentes: Gerente[]): string {
  const m = /^(a|g):(\d+)$/.exec(d.sel);
  if (m?.[1] === "a") return data.asignaciones.find((a) => a.id === Number(m[2]))?.gerenteNombre ?? "sin gerente";
  if (m?.[1] === "g") return gerentes.find((g) => g.id === Number(m[2]))?.nombre ?? "sin gerente";
  if (d.sel === "nuevo") return d.nombre.trim() || "nuevo gerente";
  return "sin gerente";
}

type Editor = { setDestino: (d: DestinoDraft) => void };

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

type EditorProps = {
  item: ItemColaDeposito;
  items: ItemColaDeposito[];
  data: CampanaData;
  gerentes: Gerente[];
  bancos: string[];
  cerrada: boolean;
  editor: React.RefObject<Editor | null>;
  onSiguiente: () => void;
  /** Como `onSiguiente`, pero si no hay otro pendiente se queda en este. */
  onSaltar: () => void;
};

function EditorDeposito({ item, items, data, gerentes, bancos, cerrada, editor, onSiguiente, onSaltar }: EditorProps) {
  const location = useLocation();
  const hecho = item.estado === "hecho";
  const f = useDepositoForm({
    data,
    asignacion: null,
    // Un hecho ya está en los datos de la campaña: se excluye de los saldos y de los duplicados.
    depositoId: hecho ? (item.depositoId ?? undefined) : undefined,
    inicial: () => ({ draft: { ...item.borrador.draft, tasaId: null }, destino: item.borrador.destino, auto: item.borrador.auto }),
  });
  editor.current = hecho ? null : { setDestino: f.setDestino };
  const [saving, setSaving] = useState(false);
  const [confirmDescartar, setConfirmDescartar] = useState(false);

  const { tasaId: _tasa, ...draft } = f.form.draft;
  const borrador: BorradorDeposito = { draft, destino: f.form.destino, auto: f.form.auto };
  const auto = useAutoguardado(hecho ? "" : JSON.stringify(borrador), async (v) => {
    await guardarBorradorDeposito(await getDb(), item.id, JSON.parse(v) as BorradorDeposito);
    invalidate();
  });

  // Duplicados dentro de la cola, con lo que se está escribiendo en este elemento.
  const enCola = useMemo(() => {
    const filas = items.map((i) => ({
      id: i.id,
      estado: i.estado,
      banco: i.id === item.id ? draft.banco : i.borrador.draft.banco,
      referencia: i.id === item.id ? draft.referencia : i.borrador.draft.referencia,
    }));
    const ids = duplicadosEnCola(filas, item.id);
    return items.filter((i) => ids.includes(i.id));
  }, [items, item.id, draft.banco, draft.referencia]);

  async function marcarHecho() {
    if (hecho || cerrada || saving) return;
    const r = f.validar();
    if (!r) return;
    setSaving(true);
    auto.cancelar();
    try {
      // En la revisión no hay asignación fija: `validar` siempre devuelve el destino.
      await completarDeposito(await getDb(), item.id, r.deposito, r.destino!, borrador);
      toast.success("Depósito registrado");
      onSiguiente();
      invalidate();
    } catch (e) {
      reportError(e);
      void auto.guardar();
      setSaving(false);
    }
  }

  async function descartar() {
    auto.cancelar();
    try {
      const imagen = await descartarDeposito(await getDb(), item.id);
      await deleteImage(imagen);
      toast.success("Comprobante descartado");
      onSiguiente();
      invalidate();
    } catch (e) {
      reportError(e);
      setConfirmDescartar(false);
    }
  }

  const marcarHechoRef = useRef(marcarHecho);
  marcarHechoRef.current = marcarHecho;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "Enter") {
        e.preventDefault();
        void marcarHechoRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <form
      className="grid content-start gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void marcarHecho();
      }}
    >
      {hecho && (
        <Aviso>
          Ya está hecho.{" "}
          {item.depositoId ? (
            <Link to={`/depositos/${item.depositoId}`} state={conVolver(location, "Revisión")} className="underline">
              Ver depósito
            </Link>
          ) : (
            "El depósito se eliminó después."
          )}
        </Aviso>
      )}
      {!hecho && item.formato === null && <Aviso tono="warning">No se leyó el comprobante: completa los datos a mano.</Aviso>}
      <DepositoCampos
        f={f}
        data={data}
        asignacion={null}
        gerentes={gerentes}
        bancos={bancos}
        disabled={hecho || cerrada || saving}
        avisosExtra={
          enCola.length > 0 && (
            <Aviso tono="warning">
              En la cola hay otro comprobante con este banco y esta referencia:{" "}
              {enCola.map((i) => i.nombreArchivo ?? `#${i.orden}`).join(", ")}
            </Aviso>
          )
        }
      />
      {!hecho && (
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" className="text-destructive" disabled={cerrada || saving} onClick={() => setConfirmDescartar(true)}>
            <Trash2 />
            Descartar
          </Button>
          <Button type="button" variant="outline" disabled={saving} onClick={onSaltar}>
            <SkipForward />
            Saltar
          </Button>
          <Button type="submit" disabled={cerrada || saving} title="Ctrl+Enter">
            <Check />
            Hecho
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={confirmDescartar}
        onOpenChange={setConfirmDescartar}
        title="Descartar comprobante"
        description="Se quita de la cola y se borra su imagen. No se registra ningún depósito."
        confirmLabel="Descartar"
        destructive
        onConfirm={descartar}
      />
    </form>
  );
}
