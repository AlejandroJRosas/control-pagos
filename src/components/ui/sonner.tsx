import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useModo } from "@/lib/tema";

/** Sigue el modo claro/oscuro de la app (sonner usa "light" si no se le indica). */
export function Toaster(props: ToasterProps) {
  const modo = useModo();
  return <Sonner className="toaster group" theme={modo === "oscuro" ? "dark" : "light"} {...props} />;
}
