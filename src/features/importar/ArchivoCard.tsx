import { useState } from "react";
import Decimal from "decimal.js";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SortableHead, useOrden } from "@/components/SortableHead";
import { DestinoGerente } from "@/components/DestinoGerente";
import { Casilla } from "@/components/Casilla";
import { IconoIncidencias } from "@/components/IconoIncidencias";
import { FechaInput } from "@/components/FechaInput";
import { MontoInput } from "@/components/MontoInput";
import type { CampanaData } from "@/db/queries/campanaData";
import type { Gerente } from "@/db/repos/gerentes";
import type { FilaPlan, PlanImportacion } from "@/db/operaciones/importarPagos";
import type { CampoEditable, EdicionFila } from "@/import/cuadroPagos";
import { formatFecha } from "@/domain/dates";
import { formatBs, formatTasa, formatUsd } from "@/domain/money";
import type { DestinoDraft } from "@/domain/validation";
import { ordenar, type Columnas } from "@/lib/orden";
import { cn } from "@/lib/utils";
import { motivosFila } from "./incidencias";

export type Archivo = {
  key: string;
  nombre: string;
  plan: PlanImportacion;
  destino: DestinoDraft;
  marcadas: Set<number>;
  actualizarSaldo: boolean;
  /** Lo que el usuario completó, por fila del Excel. */
  ediciones: Map<number, EdicionFila>;
};

type Vista = "todas" | "bien" | "incidencias";

type Col = "fila" | "fecha" | "banco" | "referencia" | "cuenta" | "montoBs" | "tasa" | "usd";
const COLUMNAS: Columnas<FilaPlan, Col> = {
  fila: { tipo: "numero", valor: (f) => f.fila },
  fecha: { tipo: "texto", valor: (f) => f.fecha },
  banco: { tipo: "texto", valor: (f) => f.banco },
  referencia: { tipo: "texto", valor: (f) => f.referencia },
  cuenta: { tipo: "texto", valor: (f) => f.cuentaDestino },
  montoBs: { tipo: "decimal", valor: (f) => f.montoBs },
  tasa: { tipo: "decimal", valor: (f) => f.tasaAplicada },
  usd: { tipo: "decimal", valor: (f) => f.usd },
};
const ENCABEZADOS: [Col, string, string?][] = [
  ["fila", "Fila"],
  ["fecha", "Fecha"],
  ["banco", "Banco"],
  ["referencia", "Referencia"],
  ["cuenta", "Cuenta destino"],
  ["montoBs", "Monto Bs", "text-right"],
  ["tasa", "Tasa", "text-right"],
  ["usd", "USD", "text-right"],
];

type CardProps = {
  archivo: Archivo;
  campana: CampanaData;
  gerentes: Gerente[];
  cerrada: boolean;
  onChange: (c: Partial<Archivo>) => void;
  onEditar: (fila: number, campo: CampoEditable, valor: string) => void;
  onQuitar: () => void;
  onImportar: () => Promise<void>;
};

export function ArchivoCard({ archivo: a, campana, gerentes, cerrada, onChange, onEditar, onQuitar, onImportar }: CardProps) {
  const [importando, setImportando] = useState(false);
  const { orden, alternar } = useOrden<Col>();
  const { cuadro, filas } = a.plan;
  const [vista, setVista] = useState<Vista>("todas");
  const conIncidencias = filas.filter((f) => motivosFila(f).length > 0);
  const visibles = vista === "todas" ? filas : filas.filter((f) => (motivosFila(f).length > 0) === (vista === "incidencias"));
  const ordenadas = ordenar(visibles, COLUMNAS, orden);
  const elegidas = filas.filter((f) => a.marcadas.has(f.fila));
  const totalUsd = elegidas.reduce((s, f) => s.plus(f.usd ?? 0), new Decimal(0));
  const selAsignacion = /^a:(\d+)$/.exec(a.destino.sel);
  const asignacion = selAsignacion ? campana.asignaciones.find((x) => x.id === Number(selAsignacion[1])) : undefined;
  const saldoDistinto = asignacion && cuadro.saldoInicial && !new Decimal(asignacion.saldoUsd).eq(cuadro.saldoInicial);
  const importables = visibles.filter((f) => f.importable);
  const todas = importables.length > 0 && importables.every((f) => a.marcadas.has(f.fila));
  const marcadasVisibles = importables.filter((f) => a.marcadas.has(f.fila)).length;
  // Sin depósitos elegidos todavía sirve para agregar el gerente a la campaña (p. ej. uno sin depósitos en un Excel exportado).
  const soloGerente = elegidas.length === 0 && filas.length === 0 && a.destino.sel !== "" && !selAsignacion;

  function marcar(fila: number, si: boolean) {
    const next = new Set(a.marcadas);
    if (si) next.add(fila);
    else next.delete(fila);
    onChange({ marcadas: next });
  }

  // Marcar todos actúa solo sobre lo que se ve: lo marcado fuera del filtro se queda como está.
  function marcarVisibles(si: boolean) {
    const next = new Set(a.marcadas);
    importables.forEach((f) => (si ? next.add(f.fila) : next.delete(f.fila)));
    onChange({ marcadas: next });
  }

  const chip = (v: Vista, label: string, n: number) => (
    <button
      key={v}
      type="button"
      aria-pressed={vista === v}
      onClick={() => setVista(v)}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors hover:bg-fila-hover",
        vista === v && "border-primary-intenso bg-fila-hover font-medium",
      )}
    >
      {label}
      <span className="text-muted-foreground tabular-nums">{n}</span>
    </button>
  );

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

        {filas.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {chip("todas", "Todas", filas.length)}
            {chip("bien", "Bien", filas.length - conIncidencias.length)}
            {chip("incidencias", "Con incidencias", conIncidencias.length)}
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <Casilla
                  aria-label="Marcar todas"
                  indeterminado={!todas && marcadasVisibles > 0}
                  checked={todas}
                  disabled={importables.length === 0}
                  onChange={(e) => marcarVisibles(e.target.checked)}
                />
              </TableHead>
              {ENCABEZADOS.map(([col, label, className]) => (
                <SortableHead key={col} col={col} orden={orden} onOrden={alternar} className={className}>
                  {label}
                </SortableHead>
              ))}
              <TableHead>Revisión</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ordenadas.map((f) => (
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
                {(
                  [
                    ["fecha", f.fecha ? formatFecha(f.fecha) : null, ""],
                    ["banco", f.banco, ""],
                    ["referencia", f.referencia, "font-mono"],
                    ["cuentaDestino", f.cuentaDestino, ""],
                    ["montoBs", f.montoBs ? formatBs(f.montoBs) : null, "text-right tabular-nums"],
                    ["tasa", f.tasaAplicada ? formatTasa(f.tasaAplicada) : null, "text-right tabular-nums"],
                  ] as const
                ).map(([campo, texto, className]) => (
                  <TableCell key={campo} className={className}>
                    {f.editables.includes(campo) ? (
                      <CampoFila
                        f={f}
                        campo={campo}
                        valor={a.ediciones.get(f.fila)?.[campo] ?? ""}
                        disabled={cerrada}
                        onEditar={(valor) => onEditar(f.fila, campo, valor)}
                      />
                    ) : (
                      texto || "—"
                    )}
                  </TableCell>
                ))}
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
            disabled={cerrada || importando || (elegidas.length === 0 && !soloGerente)}
            onClick={async () => {
              setImportando(true);
              try {
                await onImportar();
              } finally {
                setImportando(false);
              }
            }}
          >
            {importando ? "Importando…" : soloGerente ? "Agregar el gerente a la campaña" : `Importar ${elegidas.length} depósito(s)`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

const ETIQUETAS: Record<CampoEditable, string> = {
  fecha: "Fecha",
  banco: "Banco",
  referencia: "Referencia",
  cuentaDestino: "Cuenta destino",
  montoBs: "Monto Bs",
  tasa: "Tasa",
};

/** Campo para completar un dato que el Excel no trae o trae mal; se aplica al salir del campo o con Enter (la fecha, al quedar completa). */
function CampoFila(props: { f: FilaPlan; campo: CampoEditable; valor: string; disabled: boolean; onEditar: (valor: string) => void }) {
  const { f, campo, valor, disabled, onEditar } = props;
  const [monto, setMonto] = useState(valor);
  const falta = campo === "tasa" ? !f.tasaAplicada : !f[campo];
  // Una tasa que viene de otra fila del mismo día se muestra como sugerencia.
  const placeholder = campo === "tasa" && f.tasaAplicada ? formatTasa(f.tasaAplicada) : ETIQUETAS[campo];
  const ariaLabel = `${ETIQUETAS[campo]} de la fila ${f.fila}`;
  const alSalir = {
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
      if (e.target.value !== valor) onEditar(e.target.value);
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") e.currentTarget.blur();
    },
  };
  if (campo === "fecha")
    return <FechaInput aria-label={ariaLabel} value={valor} disabled={disabled} className="h-7" contenedorClassName="min-w-32" onChange={onEditar} />;
  if (campo === "montoBs")
    return (
      <MontoInput
        aria-label={ariaLabel}
        aria-invalid={falta}
        value={monto}
        onChange={setMonto}
        placeholder={placeholder}
        disabled={disabled}
        className="h-7 min-w-28 text-right tabular-nums"
        {...alSalir}
      />
    );
  return (
    <Input
      inputMode={campo === "tasa" ? "decimal" : undefined}
      aria-label={ariaLabel}
      aria-invalid={falta}
      defaultValue={valor}
      placeholder={placeholder}
      disabled={disabled}
      className={cn("h-7 min-w-28", campo === "tasa" && "text-right")}
      {...alSalir}
    />
  );
}

function Revision({ f }: { f: FilaPlan }) {
  const motivos = motivosFila(f);
  // El ícono lleva los motivos; el detalle de cada uno (dónde está el registrado, qué dice el Excel) va debajo de ellos.
  const detalle: string[] = [];
  f.duplicados.forEach((d) => detalle.push(`Ya registrado (no se importa): ${formatFecha(d.fecha)} · ${d.gerenteNombre} · ${d.campanaNombre}`));
  f.posiblesRepetidos.forEach((d) => detalle.push(`Posible repetido: ${formatFecha(d.fecha)} · ${d.gerenteNombre} · ${d.campanaNombre}`));
  if (f.bancoDesconocido) detalle.push("Elige qué banco es en la parte de arriba");
  if (f.estadoTasa === "distinta" && f.tasa && f.tasaAplicada) detalle.push(`El Excel dice ${formatTasa(f.tasa)}; se usará la del día: ${formatTasa(f.tasaAplicada)}`);
  const infos: string[] = [];
  if (f.estadoTasa === "nueva") infos.push("Tasa nueva: se registrará");
  if (f.estadoTasa === "registrada") infos.push("Tasa tomada de la app");
  if (f.editada) infos.push("Editada");
  if (motivos.length === 0 && infos.length === 0) return <Badge variant="secondary">OK</Badge>;
  return (
    <div className="flex items-start gap-2">
      <IconoIncidencias motivos={[...motivos, ...detalle]} />
      <ul className="space-y-0.5 text-xs">
        {infos.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
}
