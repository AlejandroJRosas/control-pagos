import { useRef, useState } from "react";
import { useParams } from "react-router";
import ExcelJS from "exceljs";
import { FileUp } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Aviso, Cargando } from "@/components/Feedback";
import { getDb } from "@/db";
import { loadCampanaData } from "@/db/queries/campanaData";
import { listGerentes } from "@/db/repos/gerentes";
import { listBancosUsados } from "@/db/repos/depositos";
import { guardarAliasBanco } from "@/db/repos/bancosAlias";
import { sugerenciasBancos } from "@/domain/bancos";
import { claveComparacion } from "@/domain/texto";
import { importarPagos, planificarImportacion, type PlanImportacion } from "@/db/operaciones/importarPagos";
import { parseLibro, type CampoEditable } from "@/import/cuadroPagos";
import { validateDestino } from "@/domain/validation";
import { invalidate, useData } from "@/hooks/useData";
import { reportError } from "@/lib/reportError";
import { cn } from "@/lib/utils";
import { ArchivoCard, type Archivo } from "./ArchivoCard";
import { BancosDesconocidos } from "./BancosDesconocidos";
import { ajustarMarcadas, marcadasPorDefecto } from "./seleccion";

export function ImportarPage() {
  const campanaId = Number(useParams().campanaId);
  const { data, error } = useData(
    async (db) => ({
      campana: await loadCampanaData(db, campanaId),
      gerentes: await listGerentes(db),
      bancos: sugerenciasBancos(await listBancosUsados(db)),
    }),
    [campanaId],
  );
  const [archivos, setArchivos] = useState<Archivo[]>([]);
  const [leyendo, setLeyendo] = useState(false);
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Última revisión pedida por archivo: una respuesta más vieja no pisa a una más nueva. */
  const versiones = useRef(new Map<string, number>());

  if (!data) return <Cargando error={error} />;
  const { campana } = data.campana;
  const cerrada = campana.estado === "cerrada";

  async function leer(files: File[]) {
    setLeyendo(true);
    try {
      const db = await getDb();
      for (const file of files) {
        try {
          if (!/\.xlsx$/i.test(file.name)) throw new Error("solo se aceptan archivos .xlsx");
          const wb = new ExcelJS.Workbook();
          await wb.xlsx.load(await file.arrayBuffer());
          const cuadros = parseLibro(wb, file.name);
          for (const cuadro of cuadros) {
            const plan = await planificarImportacion(db, campanaId, cuadro);
            // Un Excel exportado por la app trae un cuadro por gerente: cada uno va en su tarjeta.
            const nombre = cuadros.length > 1 ? `${file.name} · ${cuadro.gerenteNombre}` : file.name;
            if (plan.filas.length === 0 && cuadros.length === 1) toast.warning(`${file.name}: el cuadro de pagos no tiene depósitos`);
            const a: Archivo = {
              key: crypto.randomUUID(),
              nombre,
              plan,
              destino: plan.destino,
              marcadas: marcadasPorDefecto(plan.filas),
              actualizarSaldo: false,
              ediciones: new Map(),
            };
            setArchivos((prev) => [...prev, a]);
          }
        } catch (e) {
          reportError(e, file.name);
        }
      }
    } finally {
      setLeyendo(false);
    }
  }

  /**
   * Tras importar un archivo, los demás se vuelven a revisar (tasas nuevas, duplicados, gerentes creados)
   * sin perder lo que el usuario ya eligió en ellos.
   */
  async function replanificar(importado: string) {
    setArchivos((prev) => prev.filter((x) => x.key !== importado));
    const db = await getDb();
    const planes = new Map<string, PlanImportacion>();
    for (const a of archivos) {
      if (a.key !== importado) planes.set(a.key, await planificarImportacion(db, campanaId, a.plan.cuadro, a.ediciones));
    }
    setArchivos((prev) =>
      prev.map((a) => {
        const plan = planes.get(a.key);
        if (!plan) return a;
        const destino = a.destino.sel === "nuevo" && plan.destino.sel !== "nuevo" ? plan.destino : a.destino;
        return { ...a, plan, destino, marcadas: ajustarMarcadas(a.plan, plan, a.marcadas) };
      }),
    );
  }

  /** Se recuerda qué banco es `nombre` y se vuelven a revisar todos los archivos abiertos (así vale para todas las filas con ese nombre). */
  async function elegirBanco(nombre: string, banco: string) {
    try {
      const db = await getDb();
      await guardarAliasBanco(db, nombre, banco);
      const planes = new Map<string, PlanImportacion>();
      for (const a of archivos) planes.set(a.key, await planificarImportacion(db, campanaId, a.plan.cuadro, a.ediciones));
      setArchivos((prev) =>
        prev.map((a) => {
          const plan = planes.get(a.key);
          return plan ? { ...a, plan, marcadas: ajustarMarcadas(a.plan, plan, a.marcadas) } : a;
        }),
      );
    } catch (e) {
      reportError(e);
    }
  }

  const bancosDesconocidos = new Map<string, string>();
  for (const a of archivos) for (const f of a.plan.filas) if (f.bancoDesconocido && !bancosDesconocidos.has(claveComparacion(f.banco))) bancosDesconocidos.set(claveComparacion(f.banco), f.banco);

  const actualizar = (key: string, cambio: Partial<Archivo>) => setArchivos((prev) => prev.map((a) => (a.key === key ? { ...a, ...cambio } : a)));

  async function editar(a: Archivo, fila: number, campo: CampoEditable, valor: string) {
    const ediciones = new Map(a.ediciones).set(fila, { ...a.ediciones.get(fila), [campo]: valor });
    const version = (versiones.current.get(a.key) ?? 0) + 1;
    versiones.current.set(a.key, version);
    actualizar(a.key, { ediciones });
    try {
      const plan = await planificarImportacion(await getDb(), campanaId, a.plan.cuadro, ediciones);
      if (versiones.current.get(a.key) !== version) return;
      setArchivos((prev) => prev.map((x) => (x.key === a.key ? { ...x, plan, marcadas: ajustarMarcadas(x.plan, plan, x.marcadas) } : x)));
    } catch (e) {
      reportError(e, a.nombre);
    }
  }

  async function importar(a: Archivo) {
    // La tasa que se muestra es la que se usa: la registrada, la del Excel o la que se completó.
    const filas = a.plan.filas.filter((f) => a.marcadas.has(f.fila)).map((f) => ({ ...f, tasa: f.tasaAplicada ?? f.tasa }));
    const rd = validateDestino(a.destino);
    if (!rd.ok) {
      toast.error(`${a.nombre}: ${Object.values(rd.errors)[0]}`);
      return;
    }
    try {
      const r = await importarPagos(await getDb(), campanaId, {
        destino: rd.value,
        saldoUsd: a.actualizarSaldo ? a.plan.cuadro.saldoInicial : null,
        filas,
      });
      toast.success(
        (filas.length === 0 ? `Gerente agregado a la campaña desde ${a.nombre}` : `${r.depositos} depósito(s) importado(s) de ${a.nombre}`) + (r.tasasCreadas > 0 ? ` · ${r.tasasCreadas} tasa(s) registrada(s)` : ""),
      );
      invalidate();
      await replanificar(a.key);
    } catch (e) {
      reportError(e, a.nombre);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        migas={[{ to: "/campanas", label: "Campañas" }, { to: `/campanas/${campanaId}`, label: campana.nombre }]}
        title="Importar depósitos desde Excel"
        subtitle="Se lee la hoja CUADRO DE PAGOS de cada factura (el gerente, su saldo inicial y los depósitos) o el Excel exportado por la app (cada gerente con su asignado y sus depósitos)."
      />
      {cerrada && <Aviso>La campaña está cerrada: no se pueden importar depósitos.</Aviso>}

      {!cerrada && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            void leer(Array.from(e.dataTransfer.files));
          }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed bg-muted/30 p-8 text-center text-sm text-muted-foreground",
            over && "border-primary bg-primary/5",
          )}
        >
          <FileUp className="mb-2 size-8" />
          {leyendo ? "Leyendo…" : "Arrastra aquí uno o varios Excel (.xlsx) o haz clic para elegirlos"}
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            multiple
            hidden
            onChange={(e) => {
              void leer(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </div>
      )}

      <BancosDesconocidos nombres={[...bancosDesconocidos.values()]} bancos={data.bancos} onElegir={elegirBanco} />

      {archivos.map((a) => (
        <ArchivoCard
          key={a.key}
          archivo={a}
          campana={data.campana}
          gerentes={data.gerentes}
          cerrada={cerrada}
          onChange={(c) => actualizar(a.key, c)}
          onEditar={(fila, campo, valor) => editar(a, fila, campo, valor)}
          onQuitar={() => setArchivos((prev) => prev.filter((x) => x.key !== a.key))}
          onImportar={() => importar(a)}
        />
      ))}
    </div>
  );
}
