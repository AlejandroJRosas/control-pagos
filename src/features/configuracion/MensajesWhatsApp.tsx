import { useEffect, useRef, useState } from "react";
import { RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Aviso } from "@/components/Feedback";
import { getDb } from "@/db";
import { getPlantillas, setPlantillas } from "@/db/repos/plantillas";
import { todayIso } from "@/domain/dates";
import { aplicarPlantilla, CAMPOS_PLANTILLA, camposDesconocidos, PLANTILLAS_POR_DEFECTO, type Plantillas } from "@/domain/whatsapp";
import { invalidate, useData } from "@/hooks/useData";
import { useAvisoSinGuardar } from "@/hooks/useAvisoSinGuardar";
import { reportError } from "@/lib/reportError";

const EJEMPLO = { gerenteNombre: "María Pérez", campanaNombre: "Ejemplo", fechaCorte: todayIso(), asignado: "1500", pagado: "1000", cantidad: 4 };
const EJEMPLOS: Record<keyof Plantillas, typeof EJEMPLO & { restante: string }> = {
  pendiente: { ...EJEMPLO, restante: "500" },
  completo: { ...EJEMPLO, pagado: "1520", restante: "-20", cantidad: 5 },
};
const TITULOS: Record<keyof Plantillas, string> = { pendiente: "Con saldo pendiente", completo: "Saldo completo o pagado de más" };

/** Texto del estado de cuenta por WhatsApp (individual y en lote). */
export function MensajesWhatsApp() {
  const { data } = useData((db) => getPlantillas(db), []);
  const [p, setP] = useState<Plantillas | null>(null);
  useEffect(() => {
    if (data && !p) setP(data);
  }, [data, p]);
  const sucio = !!p && !!data && (p.pendiente !== data.pendiente || p.completo !== data.completo);
  const aviso = useAvisoSinGuardar(sucio);
  const refs = { pendiente: useRef<HTMLTextAreaElement>(null), completo: useRef<HTMLTextAreaElement>(null) };

  if (!p) return null;

  function insertar(k: keyof Plantillas, campo: string) {
    const el = refs[k].current;
    const texto = p![k];
    const ini = el?.selectionStart ?? texto.length;
    const fin = el?.selectionEnd ?? texto.length;
    const nuevo = `${texto.slice(0, ini)}{${campo}}${texto.slice(fin)}`;
    setP({ ...p!, [k]: nuevo });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(ini + campo.length + 2, ini + campo.length + 2);
    });
  }

  async function guardar() {
    try {
      await setPlantillas(await getDb(), p!);
      toast.success("Mensajes guardados");
      invalidate();
    } catch (e) {
      reportError(e);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mensajes de WhatsApp</CardTitle>
        <CardDescription>
          Texto que acompaña al estado de cuenta. Los campos entre llaves se reemplazan por los datos del gerente; haz clic en uno para insertarlo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {(Object.keys(TITULOS) as (keyof Plantillas)[]).map((k) => {
          const desconocidos = camposDesconocidos(p[k]);
          return (
            <div key={k} className="grid gap-3 lg:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor={`wa-${k}`} className="text-sm font-medium">
                  {TITULOS[k]}
                </label>
                <Textarea id={`wa-${k}`} ref={refs[k]} rows={9} value={p[k]} onChange={(e) => setP({ ...p, [k]: e.target.value })} />
                <div className="flex flex-wrap gap-1">
                  {CAMPOS_PLANTILLA.map((c) => (
                    <Button key={c} type="button" size="xs" variant="outline" className="font-mono" onClick={() => insertar(k, c)}>
                      {`{${c}}`}
                    </Button>
                  ))}
                </div>
                {desconocidos.length > 0 && (
                  <Aviso tono="warning">
                    Campos que no existen (se enviarán tal cual): {desconocidos.map((d) => `{${d}}`).join(", ")}
                  </Aviso>
                )}
              </div>
              <div className="space-y-2">
                <span className="text-sm text-muted-foreground">Vista previa</span>
                <pre className="rounded-md border bg-muted/40 p-3 font-sans text-sm whitespace-pre-wrap">{aplicarPlantilla(p[k], EJEMPLOS[k])}</pre>
              </div>
            </div>
          );
        })}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void guardar()} disabled={!sucio}>
            <Save />
            Guardar
          </Button>
          <Button variant="outline" onClick={() => setP(PLANTILLAS_POR_DEFECTO)}>
            <RotateCcw />
            Restaurar el texto original
          </Button>
        </div>
      </CardContent>
      {aviso.dialogo}
    </Card>
  );
}
