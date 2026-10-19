import { claveDuplicado } from "./bancos";
import { compareCronologico } from "./campanaView";

type ConClave = { id: number; banco: string; referencia: string; fecha: string; creadoEn: string };

/** Depósitos con el mismo banco y referencia (`claveDuplicado`), en grupos de dos o más; cada grupo en orden cronológico. */
export function gruposDuplicados<T extends ConClave>(items: T[]): T[][] {
  const porClave = new Map<string, T[]>();
  for (const x of items) {
    const clave = claveDuplicado(x.banco, x.referencia);
    if (!clave) continue;
    const g = porClave.get(clave);
    if (g) g.push(x);
    else porClave.set(clave, [x]);
  }
  return [...porClave.values()]
    .filter((g) => g.length > 1)
    .map((g) => g.sort(compareCronologico))
    .sort((a, b) => compareCronologico(a[0], b[0]));
}
