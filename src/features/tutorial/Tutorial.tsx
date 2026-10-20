import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCampanaActual } from "@/lib/campanaActual";
import {
  abrirTutorialAlIniciar,
  cerrarTutorial,
  posicionTarjeta,
  setTutorialActivado,
  useTutorialAbierto,
  useTutorialActivado,
  type Rect,
} from "@/lib/tutorial";
import { cn } from "@/lib/utils";
import { PASOS } from "./pasos";

const HOLGURA = 6;

const igual = (a: Rect | null, b: Rect | null) =>
  a === b || (!!a && !!b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height);

/** Rectángulo del elemento `data-tour` visible, o null. Se vuelve a medir seguido: las pantallas cargan sus datos después. */
function useObjetivo(objetivo: string | undefined, paso: number): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);
  useLayoutEffect(() => {
    let visto = false;
    const medir = () => {
      const el = objetivo ? document.querySelector<HTMLElement>(`[data-tour="${objetivo}"]`) : null;
      const r = el?.getBoundingClientRect();
      const nuevo = r && r.width > 0 && r.height > 0 ? { top: r.top, left: r.left, width: r.width, height: r.height } : null;
      if (el && nuevo && !visto) {
        visto = true;
        el.scrollIntoView({ block: "nearest" });
      }
      setRect((prev) => (igual(prev, nuevo) ? prev : nuevo));
    };
    medir();
    const id = window.setInterval(medir, 200);
    window.addEventListener("resize", medir);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", medir);
    };
  }, [objetivo, paso]);
  return rect;
}

/** Montado en `AppLayout`: se abre solo al iniciar si está activado, o con `abrirTutorial()`. */
export function Tutorial() {
  const abierto = useTutorialAbierto();
  useEffect(abrirTutorialAlIniciar, []);
  return abierto ? <Recorrido /> : null;
}

function Recorrido() {
  const navigate = useNavigate();
  const location = useLocation();
  const activado = useTutorialActivado();
  const [i, setI] = useState(0);
  const paso = PASOS[i];
  const ultimo = i === PASOS.length - 1;
  // Al cerrar se vuelve a la pantalla donde estaba.
  const origen = useRef(location.pathname + location.search);

  useEffect(() => {
    const ruta = paso.ruta?.({ campanaActual: getCampanaActual() });
    if (ruta && ruta !== location.pathname) navigate(ruta);
    // Solo al cambiar de paso: si el usuario no puede salir (cambios sin guardar), no se insiste.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  const rect = useObjetivo(paso.objetivo, i);
  const tarjeta = useRef<HTMLDivElement>(null);
  const [tam, setTam] = useState({ width: 380, height: 240 });
  useLayoutEffect(() => {
    const el = tarjeta.current;
    if (el && (el.offsetWidth !== tam.width || el.offsetHeight !== tam.height) && el.offsetWidth > 0) setTam({ width: el.offsetWidth, height: el.offsetHeight });
  });
  const hueco = rect && { top: rect.top - HOLGURA, left: rect.left - HOLGURA, width: rect.width + 2 * HOLGURA, height: rect.height + 2 * HOLGURA };
  const pos = posicionTarjeta(hueco, tam, { width: window.innerWidth, height: window.innerHeight });

  function cerrar() {
    cerrarTutorial();
    if (origen.current !== location.pathname + location.search) navigate(origen.current);
  }

  function terminar() {
    setTutorialActivado(false);
    cerrar();
  }

  const siguiente = () => (ultimo ? terminar() : setI(i + 1));
  const anterior = () => setI(Math.max(0, i - 1));

  const teclas = useRef({ siguiente, anterior, cerrar });
  teclas.current = { siguiente, anterior, cerrar };
  useEffect(() => {
    // En captura y con preventDefault: mientras dura el recorrido las teclas no llegan a los atajos de la pantalla.
    const onKey = (e: KeyboardEvent) => {
      const t = teclas.current;
      if (e.key === "Escape") t.cerrar();
      else if (e.key === "ArrowRight") t.siguiente();
      else if (e.key === "ArrowLeft") t.anterior();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Tapa la app: durante el recorrido no se hace clic en lo de atrás. */}
      <div className={cn("absolute inset-0", !hueco && "bg-black/50")} />
      {hueco && (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-lg ring-2 ring-primary transition-all duration-200"
          style={{ ...hueco, boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.5)" }}
        />
      )}
      <div
        ref={tarjeta}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-titulo"
        className="absolute w-[380px] max-w-[calc(100vw-2rem)] space-y-3 rounded-xl bg-popover p-4 text-sm text-popover-foreground shadow-xl ring-1 ring-foreground/10 transition-[top,left] duration-200"
        style={pos}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-xs text-muted-foreground">
              Tutorial · paso {i + 1} de {PASOS.length}
            </div>
            <h2 id="tutorial-titulo" className="text-base font-semibold">
              {paso.titulo}
            </h2>
          </div>
          <button type="button" onClick={cerrar} aria-label="Cerrar el tutorial" title="Esc" className="rounded-md p-1 text-muted-foreground hover:bg-fila-hover hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
        <div className="space-y-2 leading-relaxed">{paso.texto}</div>
        <div className="flex gap-1" aria-hidden>
          {PASOS.map((_, n) => (
            <span key={n} className={cn("h-1 flex-1 rounded-full", n <= i ? "bg-primary" : "bg-muted")} />
          ))}
        </div>
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={activado} onChange={(e) => setTutorialActivado(e.target.checked)} />
            Mostrar al abrir la app
          </label>
          <div className="flex gap-2">
            {i > 0 && (
              <Button variant="outline" size="sm" onClick={anterior}>
                Anterior
              </Button>
            )}
            <Button size="sm" onClick={siguiente} autoFocus>
              {ultimo ? "Terminar" : "Siguiente"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
