import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { siguienteOrden, type Orden } from "@/lib/orden";
import { cn } from "@/lib/utils";

export function useOrden<K extends string>(inicial: Orden<K> = null) {
  const [orden, setOrden] = useState<Orden<K>>(inicial);
  return { orden, setOrden, alternar: (key: K) => setOrden((o) => siguienteOrden(o, key)) };
}

type Props<K extends string> = {
  col: K;
  orden: Orden<K>;
  onOrden: (col: K) => void;
  className?: string;
  children: ReactNode;
};

/** Encabezado que ordena la tabla al hacer clic (ascendente → descendente → original). */
export function SortableHead<K extends string>({ col, orden, onOrden, className, children }: Props<K>) {
  const activo = orden?.key === col;
  const Icon = !activo ? ChevronsUpDown : orden.dir === 1 ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className} aria-sort={activo ? (orden.dir === 1 ? "ascending" : "descending") : undefined}>
      <button
        type="button"
        className={cn("inline-flex items-center gap-1 hover:text-foreground", className?.includes("text-right") && "flex-row-reverse")}
        onClick={() => onOrden(col)}
      >
        {children}
        <Icon className={cn("size-3", !activo && "opacity-30")} />
      </button>
    </TableHead>
  );
}
