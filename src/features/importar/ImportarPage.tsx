import { useRef, useState } from "react";
import { useParams } from "react-router";
import ExcelJS from "exceljs";
import Decimal from "decimal.js";
import { FileUp, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/PageHeader";
import { Aviso, Cargando } from "@/components/Feedback";
import { DestinoGerente } from "@/components/DestinoGerente";
import { getDb } from "@/db";
import { loadCampanaData, type CampanaData } from "@/db/queries/campanaData";
import { listGerentes, type Gerente } from "@/db/repos/gerentes";
import { importarPagos, planificarImportacion, type FilaPlan, type PlanImportacion } from "@/db/operaciones/importarPagos";
import { parseCuadroPagos } from "@/import/cuadroPagos";
import { formatFecha } from "@/domain/dates";
import { formatBs, formatTasa, formatUsd } from "@/domain/money";
import { validateDestino, type DestinoDraft } from "@/domain/validation";
import { invalidate, useData } from "@/hooks/useData";
import { reportError } from "@/lib/reportError";
import { cn } from "@/lib/utils";

type Archivo = { key: string; nombre: string; plan: PlanImportacion; destino: DestinoDraft; marcadas: Set<number>; actualizarSaldo: boolean };

const marcadasPorDefecto = (filas: FilaPlan[]) => new Set(filas.filter((f) => f.marcada).map((f) => f.fila));

export function ImportarPage() {
  const campanaId = Number(useParams().campanaId);
  const { data, error } = useData(async (db) => ({ campana: await loadCampanaData(db, campanaId), gerentes: await listGerentes(db) }), [campanaId]);
  const [archivos, setArchivos] = useState<Archivo[]>([]);
  const [leyendo, setLeyendo] = useState(false);
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
          const plan = await planificarImportacion(db, campanaId, parseCuadroPagos(wb, file.name));
          if (plan.filas.length === 0) toast.warning(`${file.name}: el cuadro de pagos no tiene depósitos`);
          const a: Archivo = {
            key: crypto.randomUUID(),
            nombre: file.name,
            plan,
            destino: plan.destino,
            marcadas: marcadasPorDefecto(plan.filas),
            actualizarSaldo: false,
          };
          setArchivos((prev) => [...prev, a]);
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
      if (a.key !== importado) planes.set(a.key, await planificarImportacion(db, campanaId, a.plan.cuadro));
    }
    setArchivos((prev) =>
      prev.map((a) => {
        const plan = planes.get(a.key);
        if (!plan) return a;
        const importables = new Set(plan.filas.filter((f) => f.importable).map((f) => f.fila));
        const destino = a.destino.sel === "nuevo" && plan.destino.sel !== "nuevo" ? plan.destino : a.destino;
        return { ...a, plan, destino, marcadas: new Set([...a.marcadas].filter((n) => importables.has(n))) };
      }),
    );
  }

  const actualizar = (key: string, cambio: Partial<Archivo>) => setArchivos((prev) => prev.map((a) => (a.key === key ? { ...a, ...cambio } : a)));

  async function importar(a: Archivo) {
    const filas = a.plan.filas.filter((f) => a.marcadas.has(f.fila));
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
        `${r.depositos} depósito(s) importado(s) de ${a.nombre}` + (r.tasasCreadas > 0 ? ` · ${r.tasasCreadas} tasa(s) registrada(s)` : ""),
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
        back={{ to: `/campanas/${campanaId}`, label: campana.nombre }}
        title="Importar depósitos desde Excel"
        subtitle="Se lee la hoja CUADRO DE PAGOS de cada factura: el gerente, su saldo inicial y los depósitos."
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

      {archivos.map((a) => (
        <ArchivoCard
          key={a.key}
          archivo={a}
          campana={data.campana}
          gerentes={data.gerentes}
          cerrada={cerrada}
          onChange={(c) => actualizar(a.key, c)}
          onQuitar={() => setArchivos((prev) => prev.filter((x) => x.key !== a.key))}
          onImportar={() => importar(a)}
        />
      ))}
    </div>
  );
}

type CardProps = {
  archivo: Archivo;
  campana: CampanaData;
  gerentes: Gerente[];
  cerrada: boolean;
  onChange: (c: Partial<Archivo>) => void;
  onQuitar: () => void;
  onImportar: () => Promise<void>;
};

function ArchivoCard({ archivo: a, campana, gerentes, cerrada, onChange, onQuitar, onImportar }: CardProps) {
  const [importando, setImportando] = useState(false);
  const { cuadro, filas } = a.plan;
  const elegidas = filas.filter((f) => a.marcadas.has(f.fila));
  const totalUsd = elegidas.reduce((s, f) => s.plus(f.usd ?? 0), new Decimal(0));
  const selAsignacion = /^a:(\d+)$/.exec(a.destino.sel);
  const asignacion = selAsignacion ? campana.asignaciones.find((x) => x.id === Number(selAsignacion[1])) : undefined;
  const saldoDistinto = asignacion && cuadro.saldoInicial && !new Decimal(asignacion.saldoUsd).eq(cuadro.saldoInicial);
  const importables = filas.filter((f) => f.importable);
  const todas = importables.length > 0 && importables.every((f) => a.marcadas.has(f.fila));

  function marcar(fila: number, si: boolean) {
    const next = new Set(a.marcadas);
    if (si) next.add(fila);
    else next.delete(fila);
    onChange({ marcadas: next });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>{a.nombre}</CardTitle>
          <p className="text-sm text-muted-foreground">
            En el Excel: {cuadro.gerenteNombre ?? "sin nombre de gerente"}
            {cuadro.saldoInicial && ` · saldo inicial ${formatUsd(cuadro.saldoInicial)}`} · {filas.length} fila(s)
          </p>
        </div>
        <Button size="icon-sm" variant="ghost" aria-label="Quitar archivo" onClick={onQuitar}>
          <X />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-w-2xl">
          <DestinoGerente
            id={`imp-${a.key}`}
            asignaciones={campana.asignaciones}
            gerentes={gerentes}
            value={a.destino}
            onChange={(destino) => onChange({ destino, actualizarSaldo: false })}
          />
        </div>
        {saldoDistinto && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={a.actualizarSaldo} onChange={(e) => onChange({ actualizarSaldo: e.target.checked })} />
            Actualizar el saldo a pagar de {formatUsd(asignacion.saldoUsd)} a {formatUsd(cuadro.saldoInicial!)} (según el Excel)
          </label>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <input
                  type="checkbox"
                  aria-label="Marcar todas"
                  checked={todas}
                  disabled={importables.length === 0}
                  onChange={(e) => onChange({ marcadas: e.target.checked ? new Set(importables.map((f) => f.fila)) : new Set() })}
                />
              </TableHead>
              <TableHead>Fila</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Banco</TableHead>
              <TableHead>Referencia</TableHead>
              <TableHead>Cuenta destino</TableHead>
              <TableHead className="text-right">Monto Bs</TableHead>
              <TableHead className="text-right">Tasa</TableHead>
              <TableHead className="text-right">USD</TableHead>
              <TableHead>Revisión</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((f) => (
              <TableRow key={f.fila} className={cn(!f.importable && "text-muted-foreground")}>
                <TableCell>
                  <input
                    type="checkbox"
                    aria-label={`Importar fila ${f.fila}`}
                    disabled={!f.importable}
                    checked={a.marcadas.has(f.fila)}
                    onChange={(e) => marcar(f.fila, e.target.checked)}
                  />
                </TableCell>
                <TableCell className="tabular-nums">{f.fila}</TableCell>
                <TableCell>{f.fecha ? formatFecha(f.fecha) : "—"}</TableCell>
                <TableCell>{f.banco || "—"}</TableCell>
                <TableCell className="font-mono">{f.referencia || "—"}</TableCell>
                <TableCell>{f.cuentaDestino || "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{f.montoBs ? formatBs(f.montoBs) : "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{f.tasaAplicada ? formatTasa(f.tasaAplicada) : "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{f.usd ? formatUsd(f.usd) : "—"}</TableCell>
                <TableCell>
                  <Revision f={f} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="flex items-center justify-end gap-4">
          <span className="text-sm text-muted-foreground tabular-nums">
            {elegidas.length} depósito(s) · {formatUsd(totalUsd)}
          </span>
          <Button
            disabled={cerrada || importando || elegidas.length === 0}
            onClick={async () => {
              setImportando(true);
              try {
                await onImportar();
              } finally {
                setImportando(false);
              }
            }}
          >
            {importando ? "Importando…" : `Importar ${elegidas.length} depósito(s)`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Revision({ f }: { f: FilaPlan }) {
  const notas: { texto: string; tono: "error" | "aviso" | "info" }[] = [];
  f.problemas.forEach((p) => notas.push({ texto: p, tono: "error" }));
  if (f.estadoTasa === "nueva") notas.push({ texto: "Tasa nueva: se registrará", tono: "info" });
  if (f.estadoTasa === "distinta" && f.tasa && f.tasaAplicada) {
    notas.push({ texto: `El Excel dice ${formatTasa(f.tasa)}; se usará la del día: ${formatTasa(f.tasaAplicada)}`, tono: "aviso" });
  }
  f.duplicados.forEach((d) =>
    notas.push({ texto: `Ya registrado: ${formatFecha(d.fecha)} · ${d.gerenteNombre} · ${d.campanaNombre}`, tono: "aviso" }),
  );
  if (f.repetidaEnArchivo !== null) notas.push({ texto: `Repetida en el archivo (fila ${f.repetidaEnArchivo})`, tono: "aviso" });
  if (notas.length === 0) return <Badge variant="secondary">OK</Badge>;
  return (
    <ul className="space-y-0.5 text-xs">
      {notas.map((n) => (
        <li key={n.texto} className={cn(n.tono === "error" && "text-destructive", n.tono === "aviso" && "text-amber-700")}>
          {n.texto}
        </li>
      ))}
    </ul>
  );
}
