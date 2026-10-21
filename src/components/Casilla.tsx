import { useEffect, useRef, type ComponentProps } from "react";

type Props = Omit<ComponentProps<"input">, "type"> & {
  /** Algunos marcados y otros no (la raya de "marcar todos"). */
  indeterminado?: boolean;
};

/** Casilla de marcar; con `indeterminado` muestra el estado intermedio, que en HTML solo se pone desde JS. */
export function Casilla({ indeterminado = false, ...props }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminado;
  }, [indeterminado]);
  return <input ref={ref} type="checkbox" {...props} />;
}
