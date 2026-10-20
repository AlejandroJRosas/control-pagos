import { useEffect, useState, type RefObject } from "react";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAtajo } from "@/hooks/useAtajo";
import { cn } from "@/lib/utils";

/** Botón flotante para volver al inicio de `contenedor` (el que hace scroll); aparece tras bajar una pantalla. También con Inicio. */
export function VolverArriba({ contenedor }: { contenedor: RefObject<HTMLElement | null> }) {
  const [visible, setVisible] = useState(false);
  // Si la pantalla tiene una barra fija abajo (p. ej. "Ir a revisar"), el botón se sube para no taparla.
  const [sobreBarra, setSobreBarra] = useState(false);

  useEffect(() => {
    const el = contenedor.current;
    if (!el) return;
    const onScroll = () => {
      setVisible(el.scrollTop > el.clientHeight);
      setSobreBarra(document.querySelector("[data-barra-inferior]") !== null);
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [contenedor]);

  const subir = () => contenedor.current?.scrollTo({ top: 0, behavior: "smooth" });
  useAtajo("Home", subir);

  return (
    <Button
      variant="outline"
      size="icon"
      title="Volver arriba (Inicio)"
      aria-label="Volver arriba"
      tabIndex={visible ? 0 : -1}
      onClick={subir}
      className={cn(
        "fixed right-6 z-30 rounded-full shadow-md transition-all",
        sobreBarra ? "bottom-20" : "bottom-6",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0",
      )}
    >
      <ArrowUp />
    </Button>
  );
}
