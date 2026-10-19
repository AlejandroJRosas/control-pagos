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
import type { CampanaData } from "@/db/queries/campanaData";
import type { Gerente } from "@/db/repos/gerentes";
import type { FilaPlan, PlanImportacion } from "@/db/operaciones/importarPagos";
import type { CampoEditable, EdicionFila } from "@/import/cuadroPagos";
import { formatFecha } from "@/domain/dates";
import { formatBs, formatTasa, formatUsd } from "@/domain/money";
import type { DestinoDraft } from "@/domain/validation";
import { ordenar, type Columnas } from "@/lib/orden";
import { cn } from "@/lib/utils";

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
  const ordenadas = ordenar(filas, COLUMNAS, orden);
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

const ETIQUETAS: Record<CampoEditable, string> = {
  fecha: "Fecha",
  banco: "Banco",
  referencia: "Referencia",
  cuentaDestino: "Cuenta destino",
  montoBs: "Monto Bs",
  tasa: "Tasa",
};

/** Campo para completar un dato que el Excel no trae o trae mal; se aplica al salir del campo o con Enter. */
function CampoFila(props: { f: FilaPlan; campo: CampoEditable; valor: string; disabled: boolean; onEditar: (valor: string) => void }) {
  const { f, campo, valor, disabled, onEditar } = props;
  const falta = campo === "tasa" ? !f.tasaAplicada : !f[campo];
  // Una tasa que viene de otra fila del mismo día se muestra como sugerencia.
  const placeholder = campo === "tasa" && f.tasaAplicada ? formatTasa(f.tasaAplicada) : ETIQUETAS[campo];
  return (
    <Input
      type={campo === "fecha" ? "date" : "text"}
      inputMode={campo === "montoBs" || campo === "tasa" ? "decimal" : undefined}
      aria-label={`${ETIQUETAS[campo]} de la fila ${f.fila}`}
      aria-invalid={falta}
      defaultValue={valor}
      placeholder={placeholder}
      disabled={disabled}
      className={cn("h-7 min-w-28", (campo === "montoBs" || campo === "tasa") && "text-right")}
      onBlur={(e) => {
        if (e.target.value !== valor) onEditar(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}

function Revision({ f }: { f: FilaPlan }) {
  const notas: { texto: string; tono: "error" | "aviso" | "info" }[] = [];
  f.problemas.forEach((p) => notas.push({ texto: p, tono: "error" }));
  if (f.estadoTasa === "nueva") notas.push({ texto: "Tasa nueva: se registrará", tono: "info" });
  if (f.estadoTasa === "registrada") notas.push({ texto: "Tasa tomada de la app", tono: "info" });
  if (f.editada) notas.push({ texto: "Editada", tono: "info" });
  if (f.estadoTasa === "distinta" && f.tasa && f.tasaAplicada) {
    notas.push({ texto: `El Excel dice ${formatTasa(f.tasa)}; se usará la del día: ${formatTasa(f.tasaAplicada)}`, tono: "aviso" });
  }
  f.duplicados.forEach((d) =>
    notas.push({ texto: `Ya registrado (no se importa): ${formatFecha(d.fecha)} · ${d.gerenteNombre} · ${d.campanaNombre}`, tono: "error" }),
  );
  if (f.repetidaEnArchivo !== null) notas.push({ texto: `Repetida en el archivo (fila ${f.repetidaEnArchivo}): no se importa`, tono: "error" });
  if (notas.length === 0) return <Badge variant="secondary">OK</Badge>;
  return (
    <ul className="space-y-0.5 text-xs">
      {notas.map((n) => (
        <li key={n.texto} className={cn(n.tono === "error" && "text-destructive", n.tono === "aviso" && "text-amber-700 dark:text-amber-400")}>
          {n.texto}
        </li>
      ))}
    </ul>
  );
}
