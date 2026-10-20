import { useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { ListChecks } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { Aviso, Cargando } from "@/components/Feedback";
import { Field } from "@/components/Field";
import { BuscadorSelect } from "@/components/BuscadorSelect";
import { getDb } from "@/db";
import { loadCampanaData, type CampanaData } from "@/db/queries/campanaData";
import { asignarGerenteCola, borradorDepositoVacio, encolarDeposito, getItemColaDeposito, guardarBorradorDeposito } from "@/db/repos/cola";
import { extractor } from "@/extraction/extractor";
import { ajustarCuentaDestino } from "@/extraction/cuentaConocida";
import { listCuentasDestinoUsadas } from "@/db/repos/depositos";
import { deleteImage, saveImage } from "@/platform/images";
import { invalidate, useData } from "@/hooks/useData";
import { reportError } from "@/lib/reportError";
import type { EstadoLote } from "@/components/SoltarImagenes";
import { borradorDepositoConOcr } from "./leerEnBorrador";
import { useLote } from "./useLote";
import { BarraIrARevisar, TablaLote, ZonaLote } from "./ZonaLote";

export function SubirLoteDepositosPage() {
  const { campanaId } = useParams();
  const { data, error } = useData((db) => loadCampanaData(db, Number(campanaId)), [campanaId]);
  if (!data) return <Cargando error={error} />;
  return <SubirLote key={campanaId} data={data} />;
}

function SubirLote({ data }: { data: CampanaData }) {
  const campana = data.campana;
  const cerrada = campana.estado === "cerrada";
  const preelegido = (useLocation().state as EstadoLote | null)?.gerente;
  const [gerente, setGerente] = useState(() => (preelegido && data.asignaciones.some((a) => `a:${a.id}` === preelegido) ? preelegido : ""));
  // Gerente vigente al encolar cada imagen (la lista puede cambiar entre tandas).
  const gerenteRef = useRef(gerente);
  gerenteRef.current = gerente;
  // Comprobantes subidos en esta pantalla: cambiar el gerente también los cambia a ellos.
  const subidos = useRef<number[]>([]);

  function elegirGerente(sel: string) {
    setGerente(sel);
    gerenteRef.current = sel;
    if (subidos.current.length === 0) return;
    getDb()
      .then((db) => asignarGerenteCola(db, subidos.current, sel))
      .then(() => invalidate())
      .catch((e) => reportError(e));
  }

  const { filas, agregar } = useLote({
    async encolar(file) {
      const imagenPath = await saveImage(file);
      try {
        const db = await getDb();
        const id = await encolarDeposito(db, campana.id, { imagenPath, nombreArchivo: file.name, borrador: borradorDepositoVacio(gerenteRef.current) });
        subidos.current.push(id);
        invalidate();
        return id;
      } catch (e) {
        await deleteImage(imagenPath);
        throw e;
      }
    },
    async leer(file, id) {
      const r = await extractor.extraerDeposito(file);
      const db = await getDb();
      const item = await getItemColaDeposito(db, id);
      if (item?.estado !== "pendiente") return r.formato;
      await guardarBorradorDeposito(db, id, borradorDepositoConOcr(item.borrador, ajustarCuentaDestino(r.fields, await listCuentasDestinoUsadas(db))), r.formato);
      invalidate();
      return r.formato;
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ to: `/campanas/${campana.id}`, label: campana.nombre }}
        title="Subir comprobantes en lote"
        subtitle="Cada imagen se lee y queda en la cola de revisión; los saldos cambian solo al darle Hecho."
        actions={
          filas.length === 0 && (
            <Link to={`/campanas/${campana.id}/revision`} className={buttonVariants()}>
              <ListChecks />
              Ir a revisar
            </Link>
          )
        }
      />
      {cerrada && <Aviso>La campaña está cerrada: no se pueden agregar comprobantes.</Aviso>}
      <div className="max-w-sm">
        <Field id="lote-gerente" label="Gerente para todo el lote (opcional)">
          <BuscadorSelect
            id="lote-gerente"
            value={gerente}
            disabled={cerrada}
            onChange={elegirGerente}
            opciones={data.asignaciones.map((a) => ({ value: `a:${a.id}`, label: a.gerenteNombre }))}
            placeholder="Sin asignar (lo eliges al revisar)"
          />
        </Field>
      </div>
      <ZonaLote onArchivos={agregar} disabled={cerrada} />
      <TablaLote filas={filas} />
      <BarraIrARevisar to={`/campanas/${campana.id}/revision`} filas={filas} />
    </div>
  );
}
