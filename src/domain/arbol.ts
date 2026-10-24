/** Árbol de gerentes de una campaña: cada asignación puede tener un jefe (otra asignación). Lógica pura. */

/** id → id del jefe. Un id que no está en el mapa no tiene jefe. */
export type Jefes = ReadonlyMap<number, number | null>;

function hijosPorJefe(jefes: Jefes): Map<number, number[]> {
  const hijos = new Map<number, number[]>();
  for (const [id, jefe] of jefes) {
    if (jefe === null) continue;
    const lista = hijos.get(jefe);
    if (lista) lista.push(id);
    else hijos.set(jefe, [id]);
  }
  return hijos;
}

/** Todos los niveles debajo de `id`, sin incluirlo. */
export function descendientes(jefes: Jefes, id: number): number[] {
  const hijos = hijosPorJefe(jefes);
  const vistos = new Set<number>([id]);
  const salida: number[] = [];
  const pila = [id];
  while (pila.length > 0) {
    const actual = pila.pop() as number;
    for (const h of hijos.get(actual) ?? []) {
      if (vistos.has(h)) continue;
      vistos.add(h);
      salida.push(h);
      pila.push(h);
    }
  }
  return salida;
}

/** true si poner `jefeNuevo` como jefe de `id` lo dejaría debajo de sí mismo. */
export function creaCiclo(jefes: Jefes, id: number, jefeNuevo: number | null): boolean {
  if (jefeNuevo === null) return false;
  return jefeNuevo === id || descendientes(jefes, id).includes(jefeNuevo);
}

/** Los ids de un ciclo (cualquiera), o null si no hay. */
export function cicloEn(jefes: Jefes): number[] | null {
  const hechos = new Set<number>();
  for (const inicio of jefes.keys()) {
    if (hechos.has(inicio)) continue;
    const camino: number[] = [];
    const enCamino = new Set<number>();
    let actual: number | null | undefined = inicio;
    while (actual !== null && actual !== undefined && !hechos.has(actual)) {
      if (enCamino.has(actual)) return camino.slice(camino.indexOf(actual));
      enCamino.add(actual);
      camino.push(actual);
      actual = jefes.get(actual);
    }
    for (const c of camino) hechos.add(c);
  }
  return null;
}

export type NodoArbol<T> = { item: T; hijos: NodoArbol<T>[] };

/** Partición estable: primero los que no tienen a nadie debajo, después los que sí. */
function directosPrimero<T>(nodos: NodoArbol<T>[]): NodoArbol<T>[] {
  return [...nodos.filter((n) => n.hijos.length === 0), ...nodos.filter((n) => n.hijos.length > 0)];
}

/** Raíces e hijos en el orden de `items`, con los que no tienen equipo antes que los que sí. Un jefe fuera de `items` cuenta como sin jefe; los nodos de un ciclo van como raíces. */
export function armarArbol<T>(items: T[], id: (t: T) => number, jefes: Jefes): NodoArbol<T>[] {
  const presentes = new Set(items.map(id));
  const enCiclo = new Set<number>();
  // cicloEn devuelve un solo ciclo: se repite quitando los ya encontrados hasta que no queden
  const sinCiclos = new Map(jefes);
  for (let c = cicloEn(sinCiclos); c; c = cicloEn(sinCiclos)) {
    for (const n of c) {
      enCiclo.add(n);
      sinCiclos.set(n, null);
    }
  }
  const nodos = new Map<number, NodoArbol<T>>();
  for (const item of items) nodos.set(id(item), { item, hijos: [] });
  const raices: NodoArbol<T>[] = [];
  for (const item of items) {
    const n = id(item);
    const nodo = nodos.get(n) as NodoArbol<T>;
    const jefe = jefes.get(n) ?? null;
    const padre = jefe !== null && !enCiclo.has(n) && presentes.has(jefe) ? nodos.get(jefe) : undefined;
    if (padre) padre.hijos.push(nodo);
    else raices.push(nodo);
  }
  for (const nodo of nodos.values()) nodo.hijos = directosPrimero(nodo.hijos);
  return directosPrimero(raices);
}

export type FilaArbol<T> = { item: T; nivel: number; debajo: number; tieneHijos: boolean };

function contar<T>(nodo: NodoArbol<T>): number {
  return nodo.hijos.reduce((s, h) => s + 1 + contar(h), 0);
}

/** Preorden sin entrar en los plegados. `debajo` cuenta todos los niveles. */
export function aplanarArbol<T>(nodos: NodoArbol<T>[], id: (t: T) => number, plegados: ReadonlySet<number> = new Set()): FilaArbol<T>[] {
  const filas: FilaArbol<T>[] = [];
  const visitar = (nodo: NodoArbol<T>, nivel: number) => {
    filas.push({ item: nodo.item, nivel, debajo: contar(nodo), tieneHijos: nodo.hijos.length > 0 });
    if (plegados.has(id(nodo.item))) return;
    for (const h of nodo.hijos) visitar(h, nivel + 1);
  };
  for (const n of nodos) visitar(n, 0);
  return filas;
}

/** Si `id` está marcado, lo desmarca con toda su rama; si no, los marca. */
export function alternarRama(marcados: ReadonlySet<number>, jefes: Jefes, id: number): Set<number> {
  const nuevo = new Set(marcados);
  const rama = [id, ...descendientes(jefes, id)];
  if (marcados.has(id)) for (const r of rama) nuevo.delete(r);
  else for (const r of rama) nuevo.add(r);
  return nuevo;
}

/** Estado de `id` y su rama. */
export function estadoRama(marcados: ReadonlySet<number>, jefes: Jefes, id: number): "todo" | "parte" | "nada" {
  const rama = [id, ...descendientes(jefes, id)];
  const n = rama.filter((r) => marcados.has(r)).length;
  return n === 0 ? "nada" : n === rama.length ? "todo" : "parte";
}
