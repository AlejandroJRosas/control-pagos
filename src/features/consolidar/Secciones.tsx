import type { ReactNode } from "react";
import { ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Casilla } from "@/components/Casilla";
import { ComprobanteIcono } from "@/components/ComprobanteIcono";
import { BotonConMotivo } from "@/components/BotonConMotivo";
import type { Campo, Cambio, Conflicto, Decisiones, Eleccion, GrupoJefe, PlanConsolidacion } from "@/domain/consolidar";
import type { DepositoPaquete } from "@/domain/paquete";
import { formatFecha } from "@/domain/dates";
import { formatBs, formatTasa, formatUsd, toUsd } from "@/domain/money";
import { cn } from "@/lib/utils";

export function Seccion({ titulo, cantidad, descripcion, children }: { titulo: string; cantidad: number; descripcion?: ReactNode; children: ReactNode }) {
  return (
    <Card role="region" aria-label={`${titulo} (${cantidad})`} className="px-4">
      <div>
        <h2 className="text-base font-semibold">
          {titulo} <span className="font-normal text-muted-foreground">({cantidad})</span>
        </h2>
        {descripcion && <p className="text-sm text-muted-foreground">{descripcion}</p>}
      </div>
      {children}
    </Card>
  );
}

/** Comprobante del paquete, leído de la carpeta donde se extrajo. */
function Comprobante({ carpeta, d }: { carpeta: string; d: DepositoPaquete }) {
  if (!d.imagen) return <ImageIcon aria-label="Sin comprobante" className="mx-auto size-4 text-muted-foreground/30" />;
  return <ComprobanteIcono path={`${carpeta}/imagenes/${d.imagen}`} />;
}

export function Nuevos({
  plan,
  carpeta,
  nombreDe,
  tasaDe,
}: {
  plan: PlanConsolidacion;
  carpeta: string;
  nombreDe: (asignacionId: number) => string;
  tasaDe: (fecha: string) => string | null;
}) {
  const grupos = new Map<number, PlanConsolidacion["nuevos"]>();
  for (const n of plan.nuevos) grupos.set(n.asignacionId, [...(grupos.get(n.asignacionId) ?? []), n]);
  return (
    <Seccion titulo="Nuevos" cantidad={plan.nuevos.length}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Banco</TableHead>
            <TableHead>Referencia</TableHead>
            <TableHead className="text-right">Monto</TableHead>
            <TableHead className="text-right">USD</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...grupos].map(([asignacionId, nuevos]) => [
            <TableRow key={`g${asignacionId}`} className="bg-muted/40 hover:bg-muted/40">
              <TableCell colSpan={6} className="font-medium">
                {nombreDe(asignacionId)} <span className="font-normal text-muted-foreground">· {nuevos.length}</span>
              </TableCell>
            </TableRow>,
            ...nuevos.map(({ remoto: d, tasa }) => {
              const valor = tasaDe(tasa.fecha);
              return (
                <TableRow key={d.uuid}>
                  <TableCell className="tabular-nums">{formatFecha(d.fecha)}</TableCell>
                  <TableCell>{d.banco}</TableCell>
                  <TableCell className="font-mono">{d.referencia}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatBs(d.montoBs)}</TableCell>
                  <TableCell className="text-right tabular-nums">{valor ? formatUsd(toUsd(d.montoBs, valor)) : "—"}</TableCell>
                  <TableCell>
                    <Comprobante carpeta={carpeta} d={d} />
                  </TableCell>
                </TableRow>
              );
            }),
          ])}
        </TableBody>
      </Table>
    </Seccion>
  );
}

const ETIQUETAS: Record<Campo, string> = {
  fecha: "Fecha", banco: "Banco", referencia: "Referencia", cuentaDestino: "Cuenta destino", montoBs: "Monto", observaciones: "Observaciones", gerente: "Gerente",
};

function valorCampo(campo: Campo, v: string | null): string {
  if (v === null || v === "") return "—";
  if (campo === "fecha") return formatFecha(v);
  if (campo === "montoBs") return formatBs(v);
  return v;
}

function Cambios({ cambios }: { cambios: Cambio[] }) {
  return (
    <ul className="text-sm">
      {cambios.map((c) => (
        <li key={c.campo}>
          <span className="text-muted-foreground">{ETIQUETAS[c.campo]}:</span> <span className="line-through decoration-muted-foreground/60">{valorCampo(c.campo, c.antes)}</span> →{" "}
          <span className="font-medium">{valorCampo(c.campo, c.despues)}</span>
        </li>
      ))}
    </ul>
  );
}

const titulo = (d: { banco: string; referencia: string }) => (
  <>
    {d.banco} · Ref. <span className="font-mono">{d.referencia}</span>
  </>
);

export function Correcciones({ plan, nombreDe }: { plan: PlanConsolidacion; nombreDe: (asignacionId: number) => string }) {
  return (
    <Seccion titulo="Correcciones" cantidad={plan.correcciones.length}>
      <ul className="divide-y">
        {plan.correcciones.map((c) => (
          <li key={c.remoto.uuid} className="py-2 first:pt-0 last:pb-0">
            <div className="font-medium">
              {titulo(c.local)} <span className="font-normal text-muted-foreground">· {nombreDe(c.local.asignacionId)}</span>
            </div>
            <Cambios cambios={c.cambios} />
          </li>
        ))}
      </ul>
    </Seccion>
  );
}

export function Eliminaciones({
  plan,
  origen,
  eliminar,
  nombreDe,
  onMarcar,
}: {
  plan: PlanConsolidacion;
  origen: string;
  eliminar: ReadonlySet<string>;
  nombreDe: (asignacionId: number) => string;
  onMarcar: (uuids: string[], marcar: boolean) => void;
}) {
  const marcadas = plan.eliminaciones.filter((e) => eliminar.has(e.remotoUuid)).length;
  const n = plan.eliminaciones.length;
  return (
    <Seccion titulo="Eliminaciones" cantidad={n} descripcion={`${origen} eliminó ${n === 1 ? "este depósito" : `estos ${n} depósitos`}: se eliminan aquí los marcados.`}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">
              <Casilla
                aria-label="Marcar todos"
                checked={marcadas === n}
                indeterminado={marcadas > 0 && marcadas < n}
                onChange={(e) => onMarcar(plan.eliminaciones.map((x) => x.remotoUuid), e.target.checked)}
              />
            </TableHead>
            <TableHead>Gerente</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead>Banco</TableHead>
            <TableHead>Referencia</TableHead>
            <TableHead className="text-right">Monto</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {plan.eliminaciones.map((e) => (
            <TableRow key={e.remotoUuid}>
              <TableCell>
                <Casilla
                  aria-label={`Eliminar ${e.local.banco} ${e.local.referencia}`}
                  checked={eliminar.has(e.remotoUuid)}
                  onChange={(ev) => onMarcar([e.remotoUuid], ev.target.checked)}
                />
              </TableCell>
              <TableCell>{nombreDe(e.local.asignacionId)}</TableCell>
              <TableCell className="tabular-nums">{formatFecha(e.local.fecha)}</TableCell>
              <TableCell>{e.local.banco}</TableCell>
              <TableCell className="font-mono">{e.local.referencia}</TableCell>
              <TableCell className="text-right tabular-nums">{formatBs(e.local.montoBs)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Seccion>
  );
}

/** Dos botones excluyentes: lo mío o lo del archivo. Con `motivoArchivo`, lo del archivo no se puede elegir. */
function Elegir({
  valor,
  onElegir,
  mia,
  archivo,
  motivoArchivo,
}: {
  valor: Eleccion | undefined;
  onElegir: (e: Eleccion) => void;
  mia: ReactNode;
  archivo: ReactNode;
  motivoArchivo?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant={valor === "mia" ? "default" : "outline"} aria-pressed={valor === "mia"} onClick={() => onElegir("mia")}>
        {mia}
      </Button>
      <BotonConMotivo motivo={motivoArchivo}>
        <Button
          size="sm"
          variant={valor === "archivo" ? "default" : "outline"}
          aria-pressed={valor === "archivo"}
          disabled={!!motivoArchivo}
          onClick={() => onElegir("archivo")}
        >
          {archivo}
        </Button>
      </BotonConMotivo>
    </div>
  );
}

const CAMPOS_CONFLICTO: Exclude<Campo, "gerente">[] = ["fecha", "banco", "referencia", "cuentaDestino", "montoBs", "observaciones"];

function Version({ titulo, valores, distintos, elegida }: { titulo: string; valores: Record<Campo, string | null>; distintos: Set<Campo>; elegida: boolean }) {
  return (
    <div className={cn("rounded-lg border p-3", elegida && "border-primary ring-1 ring-primary")}>
      <div className="mb-1 text-sm font-medium">{titulo}</div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 text-sm">
        {(["gerente", ...CAMPOS_CONFLICTO] as Campo[]).map((c) => (
          <div key={c} className={cn("col-span-2 grid grid-cols-subgrid rounded px-1", distintos.has(c) && "bg-amber-100 dark:bg-amber-950/60")}>
            <dt className="text-muted-foreground">{ETIQUETAS[c]}</dt>
            <dd className="break-words">{valorCampo(c, valores[c])}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ConflictoFila({ c, valor, nombreDe, onElegir }: { c: Conflicto; valor: Eleccion | undefined; nombreDe: (id: number) => string; onElegir: (e: Eleccion) => void }) {
  const distintos = new Set(c.cambios.map((x) => x.campo));
  const mia = { ...c.local, gerente: nombreDe(c.local.asignacionId) } as Record<Campo, string | null>;
  const delArchivo = { ...c.remoto, gerente: nombreDe(c.asignacionId) } as Record<Campo, string | null>;
  return (
    <li className="space-y-2">
      <div className="font-medium">
        {c.tipo === "duplicado" ? "Registrado en las dos apps" : "Editado en las dos apps"}: {titulo(c.local)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Version titulo="Tu versión" valores={mia} distintos={distintos} elegida={valor === "mia"} />
        <Version titulo="La del archivo" valores={delArchivo} distintos={distintos} elegida={valor === "archivo"} />
      </div>
      <Elegir valor={valor} onElegir={onElegir} mia="Quedarse con la mía" archivo="Usar la del archivo" />
    </li>
  );
}

export function Diferencias({
  plan,
  d,
  nombreDe,
  onTasa,
  onSaldo,
  onConflicto,
}: {
  plan: PlanConsolidacion;
  d: Decisiones;
  nombreDe: (asignacionId: number) => string;
  onTasa: (fecha: string, e: Eleccion) => void;
  onSaldo: (asignacionId: number, e: Eleccion) => void;
  onConflicto: (uuid: string, e: Eleccion) => void;
}) {
  const n = plan.tasasDistintas.length + plan.saldos.length + plan.conflictos.length;
  return (
    <Seccion titulo="Diferencias" cantidad={n} descripcion="Lo que no coincide entre tu app y el archivo: elige qué queda.">
      <ul className="space-y-4">
        {plan.tasasDistintas.map((t) => (
          <li key={t.fecha} className="space-y-1.5">
            <div className="font-medium">
              Tasa del {formatFecha(t.fecha)} <span className="font-normal text-muted-foreground">· La usan {t.usos} depósitos tuyos</span>
            </div>
            <Elegir valor={d.tasas[t.fecha]} onElegir={(e) => onTasa(t.fecha, e)} mia={`Mi tasa ${formatTasa(t.local)}`} archivo={`La del archivo ${formatTasa(t.archivo)}`} />
          </li>
        ))}
        {plan.saldos.map((s) => (
          <li key={s.asignacionId} className="space-y-1.5">
            <div className="font-medium">Monto asignado de {s.gerenteNombre}</div>
            <Elegir
              valor={d.saldos[s.asignacionId]}
              onElegir={(e) => onSaldo(s.asignacionId, e)}
              mia={`El mío ${formatUsd(s.local)}`}
              archivo={`El del archivo ${formatUsd(s.archivo)}`}
            />
          </li>
        ))}
        {plan.conflictos.map((c) => (
          <ConflictoFila key={c.remoto.uuid} c={c} valor={d.conflictos[c.remoto.uuid]} nombreDe={nombreDe} onElegir={(e) => onConflicto(c.remoto.uuid, e)} />
        ))}
      </ul>
    </Seccion>
  );
}

/** Gerentes con un jefe aquí y otro en el archivo, agrupados por (mi jefe → el del archivo) para elegir de una vez. */
export function JefesDistintos({ grupos, d, onElegir }: { grupos: GrupoJefe[]; d: Decisiones; onElegir: (ids: number[], e: Eleccion) => void }) {
  const n = grupos.reduce((s, g) => s + g.filas.length, 0);
  return (
    <Seccion titulo="Jefe distinto" cantidad={n} descripcion="Tu app y el archivo ponen a estos gerentes bajo jefes distintos: elige cuál queda">
      <ul className="space-y-4">
        {grupos.map((g) => {
          const elegibles = g.filas.filter((f) => !f.bloqueo);
          const mezcladas = new Set(g.filas.map((f) => d.jefes[f.asignacionId])).size > 1;
          const mia = g.desde === "sin jefe" ? "Sin jefe, como en mi app" : `Mi jefe: ${g.desde}`;
          const archivo = g.hacia === "sin jefe" ? "Sin jefe, como en el archivo" : `El del archivo: ${g.hacia}`;
          return (
            <li key={JSON.stringify([g.desde, g.hacia])} className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{`${g.desde} → ${g.hacia} · ${g.filas.length} ${g.filas.length === 1 ? "gerente" : "gerentes"}`}</span>
                <Button size="sm" variant="outline" onClick={() => onElegir(g.filas.map((f) => f.asignacionId), "mia")}>
                  Todos: el mío
                </Button>
                <BotonConMotivo motivo={elegibles.length === 0 ? (g.filas[0]?.bloqueo ?? undefined) : undefined}>
                  <Button size="sm" variant="outline" disabled={elegibles.length === 0} onClick={() => onElegir(elegibles.map((f) => f.asignacionId), "archivo")}>
                    Todos: el del archivo
                  </Button>
                </BotonConMotivo>
                {mezcladas && <span className="text-sm text-muted-foreground">Elecciones mezcladas</span>}
              </div>
              <details open={g.filas.length <= 3}>
                <summary className="cursor-pointer text-sm text-muted-foreground">Ver los gerentes</summary>
                <ul className="mt-1.5 space-y-1.5">
                  {g.filas.map((f) => (
                    <li key={f.asignacionId} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-medium">
                        {f.gerenteNombre}
                        {f.debajo > 0 && <span className="font-normal text-muted-foreground"> · {f.debajo} debajo</span>}
                      </span>
                      <Elegir
                        valor={d.jefes[f.asignacionId]}
                        onElegir={(e) => onElegir([f.asignacionId], e)}
                        mia={mia}
                        archivo={archivo}
                        motivoArchivo={f.bloqueo ?? undefined}
                      />
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          );
        })}
      </ul>
    </Seccion>
  );
}

export function NoIncluidos({ plan }: { plan: PlanConsolidacion }) {
  return (
    <Seccion
      titulo="No se incluyen"
      cantidad={plan.noIncluidos.length}
      descripcion={
        <>
          Estos depósitos del archivo no entran en tu campaña. Para recibirlos más adelante, pide que te manden la campaña con «Solo lo que cambió desde
          mi último envío» desmarcado.
        </>
      }
    >
      <ul className="divide-y text-sm">
        {plan.noIncluidos.map((n) => (
          <li key={n.remoto.uuid} className="flex flex-wrap gap-x-2 py-1.5 first:pt-0 last:pb-0">
            <span className="font-medium">{n.gerenteNombre}</span>
            <span className="tabular-nums">{formatFecha(n.remoto.fecha)}</span>
            <span>{titulo(n.remoto)}</span>
            <span className="tabular-nums">{formatBs(n.remoto.montoBs)}</span>
            <span className="ml-auto text-muted-foreground">{n.motivo}</span>
          </li>
        ))}
      </ul>
    </Seccion>
  );
}
