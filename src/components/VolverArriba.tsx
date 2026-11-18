import { useEffect, useState, type RefObject } from "react";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAtajo } from "@/hooks/useAtajo";
import { cn } from "@/lib/utils";

/** Botón flotante para volver al inicio de `contenedor` (el que hace scroll); aparece tras bajar una pantalla. También con Inicio. */
export function VolverArriba({ contenedor }: { contenedor: RefObject<HTMLElement | null> }) {
  const [visible, setVisible] = useState(false);
  // Si la pantalla tiene una barra fija abajo (p. ej. "Ir a revisar" o el pie de una tabla, que con algo marcado crece),
  // el botón se sube justo encima de ella para no taparla.
  const [sobreBarra, setSobreBarra] = useState<number | null>(null);

  useEffect(() => {
    const el = contenedor.current;
    if (!el) return;
    const medir = () => {
      setVisible(el.scrollTop > el.clientHeight);
      const barra = document.querySelector("[data-barra-inferior]");
      if (!barra) return setSobreBarra(null);
      const arriba = barra.getBoundingClientRect().top;
      // Sin medidas (p. ej. en las pruebas) queda la altura de siempre.
      setSobreBarra(arriba > 0 && arriba < window.innerHeight ? Math.ceil(window.innerHeight - arriba) + 12 : 80);
    };
    medir();
    el.addEventListener("scroll", medir, { passive: true });
    // El contenido cambia de alto sin que haya scroll (p. ej. al marcar depósitos aparece su barra en el pie).
    const obs = typeof ResizeObserver === "function" ? new ResizeObserver(medir) : null;
    if (obs && el.firstElementChild) obs.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", medir);
      obs?.disconnect();
    };
  }, [contenedor]);

  const subir = () => contenedor.current?.scrollTo({ top: 0, behavior: "smooth" });
  useAtajo("Home", subir);

  return (
    <Button
      size="icon-lg"
      title="Volver arriba (Inicio)"
      aria-label="Volver arriba"
      tabIndex={visible ? 0 : -1}
      onClick={subir}
      style={sobreBarra === null ? undefined : { bottom: sobreBarra }}
      className={cn(
        "fixed right-6 z-30 size-12 rounded-full shadow-lg ring-4 ring-background transition-all [&_svg:not([class*='size-'])]:size-6",
        sobreBarra === null && "bottom-6",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0",
      )}
    >
      <ArrowUp strokeWidth={2.5} />
    </Button>
  );
}
