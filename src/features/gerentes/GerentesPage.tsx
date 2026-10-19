import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Plus, Search, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/PageHeader";
import { Cargando, Vacio } from "@/components/Feedback";
import { SortableHead, useOrden } from "@/components/SortableHead";
import { EtiquetaChip } from "@/components/EtiquetaChip";
import { getDb } from "@/db";
import { listEtiquetas, type Etiqueta } from "@/db/repos/etiquetas";
import { listGerentesConCampanas, setGerenteActivo, type Gerente, type GerenteConCampanas } from "@/db/repos/gerentes";
import { invalidate, useData } from "@/hooks/useData";
import { useAtajo } from "@/hooks/useAtajo";
import { reportError } from "@/lib/reportError";
import { ordenar, type Columnas } from "@/lib/orden";
import { useFiltrosUrl } from "@/lib/filtrosUrl";
import { claveComparacion } from "@/domain/texto";
import { conEtiquetas, filtroDeIds, idsDeFiltro } from "@/domain/etiquetas";
import { GerenteFormDialog } from "./GerenteFormDialog";
import { EtiquetasDialog } from "./EtiquetasDialog";

type Col = "nombre" | "telefono" | "campanas" | "estado";
const COLUMNAS: Columnas<GerenteConCampanas, Col> = {
  nombre: { tipo: "texto", valor: (g) => g.nombre },
  telefono: { tipo: "texto", valor: (g) => g.telefono },
  campanas: { tipo: "numero", valor: (g) => g.campanas.length },
  estado: { tipo: "numero", valor: (g) => (g.activo ? 0 : 1) },
};

export function GerentesPage() {
  const { data, error } = useData((db) => listGerentesConCampanas(db), []);
  const { data: etiquetas } = useData((db) => listEtiquetas(db), []);
  const [verEtiquetas, setVerEtiquetas] = useState(false);
  const [dialog, setDialog] = useState<{ open: boolean; gerente: Gerente | null }>({ open: false, gerente: null });
  const [verInactivos, setVerInactivos] = useState(false);

  async function toggleActivo(g: Gerente) {
    try {
      await setGerenteActivo(await getDb(), g.id, !g.activo);
      invalidate();
    } catch (e) {
      reportError(e);
    }
  }

  const { orden, alternar } = useOrden<Col>();
  const { valores: f, set } = useFiltrosUrl("gerentes", ["q", "etiquetas"] as const);
  const porId = useMemo(() => new Map<number, Etiqueta>((etiquetas ?? []).map((e) => [e.id, e])), [etiquetas]);
  // Ids de etiquetas ya eliminadas no filtran (si no, la lista quedaría vacía sin chip que desmarcar).
  const elegidas = useMemo(() => idsDeFiltro(f.etiquetas).filter((id) => !etiquetas || porId.has(id)), [f.etiquetas, etiquetas, porId]);
  const alternarEtiqueta = (id: number) =>
    set({ etiquetas: filtroDeIds(elegidas.includes(id) ? elegidas.filter((x) => x !== id) : [...elegidas, id]) });
  const filas = useMemo(() => {
    const k = claveComparacion(f.q);
    const coincide = (g: GerenteConCampanas) =>
      claveComparacion(g.nombre).includes(k) ||
      claveComparacion(g.telefono ?? "").includes(k) ||
      g.campanas.some((c) => claveComparacion(c).includes(k)) ||
      g.etiquetas.some((id) => claveComparacion(porId.get(id)?.nombre ?? "").includes(k));
    return ordenar((data ?? []).filter((g) => (verInactivos || g.activo) && conEtiquetas(g.etiquetas, elegidas) && coincide(g)), COLUMNAS, orden);
  }, [data, verInactivos, orden, f.q, elegidas, porId]);
  const navigate = useNavigate();
  const nuevo = () => setDialog({ open: true, gerente: null });
  useAtajo("n", nuevo);

  return (
    <div>
      <PageHeader
        title="Gerentes"
        actions={
          <>
            <div className="relative w-64">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                data-buscar-tabla
                type="search"
                aria-label="Buscar gerente"
                className="pl-8"
                placeholder="Nombre, teléfono, campaña o etiqueta…"
                value={f.q}
                onChange={(e) => set({ q: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} />
              Ver inactivos
            </label>
            <Button variant="outline" onClick={() => setVerEtiquetas(true)}>
              <Tags />
              Etiquetas
            </Button>
            <Button title="N" onClick={nuevo}>
              <Plus />
              Nuevo gerente
            </Button>
          </>
        }
      />
      {etiquetas && etiquetas.length > 0 && (
        <div role="group" aria-label="Filtrar por etiqueta" className="mb-4 flex flex-wrap items-center gap-1.5">
          {etiquetas.map((e) => (
            <EtiquetaChip key={e.id} nombre={e.nombre} color={e.color} activo={elegidas.includes(e.id)} onClick={() => alternarEtiqueta(e.id)} />
          ))}
          {elegidas.length > 0 && (
            <Button variant="link" size="sm" className="h-6 px-1 text-xs" onClick={() => set({ etiquetas: "" })}>
              Quitar filtro
            </Button>
          )}
        </div>
      )}
      {!data ? (
        <Cargando error={error} />
      ) : filas.length === 0 ? (
        data.length === 0 ? (
          <Vacio texto="Todavía no hay gerentes.">
            <Button onClick={nuevo}>
              <Plus />
              Nuevo gerente
            </Button>
          </Vacio>
        ) : (
          <Vacio texto="Ningún gerente coincide con la búsqueda.">
            {elegidas.length > 0 && (
              <Button variant="outline" onClick={() => set({ etiquetas: "" })}>
                Quitar filtro de etiquetas
              </Button>
            )}
            {f.q && (
              <Button variant="outline" onClick={() => set({ q: "" })}>
                Limpiar búsqueda
              </Button>
            )}
            {!verInactivos && (
              <Button variant="outline" onClick={() => setVerInactivos(true)}>
                Ver inactivos
              </Button>
            )}
          </Vacio>
        )
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead col="nombre" orden={orden} onOrden={alternar}>
                Nombre
              </SortableHead>
              <TableHead>Etiquetas</TableHead>
              <SortableHead col="telefono" orden={orden} onOrden={alternar}>
                Teléfono
              </SortableHead>
              <SortableHead col="campanas" orden={orden} onOrden={alternar}>
                Campañas
              </SortableHead>
              <SortableHead col="estado" orden={orden} onOrden={alternar}>
                Estado
              </SortableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((g) => (
              <TableRow key={g.id} className="cursor-pointer" onClick={() => navigate(`/gerentes/${g.id}`)}>
                <TableCell className="font-medium">{g.nombre}</TableCell>
                <TableCell className="max-w-64">
                  <div className="flex flex-wrap gap-1">
                    {g.etiquetas.length === 0
                      ? "—"
                      : g.etiquetas.map((id) => {
                          const e = porId.get(id);
                          return e && <EtiquetaChip key={id} nombre={e.nombre} color={e.color} />;
                        })}
                  </div>
                </TableCell>
                <TableCell>{g.telefono ?? "—"}</TableCell>
                <TableCell className="max-w-80">
                  <div className="flex flex-wrap gap-1">
                    {g.campanas.length === 0
                      ? "—"
                      : g.campanas.map((c) => (
                          <Badge key={c} variant="outline">
                            {c}
                          </Badge>
                        ))}
                  </div>
                </TableCell>
                <TableCell>{g.activo ? <Badge>Activo</Badge> : <Badge variant="secondary">Inactivo</Badge>}</TableCell>
                <TableCell className="space-x-2 text-right" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" variant="outline" onClick={() => setDialog({ open: true, gerente: g })}>
                    Editar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => toggleActivo(g)}>
                    {g.activo ? "Desactivar" : "Activar"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <EtiquetasDialog open={verEtiquetas} onOpenChange={setVerEtiquetas} />
      <GerenteFormDialog gerente={dialog.gerente} open={dialog.open} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} />
    </div>
  );
}
