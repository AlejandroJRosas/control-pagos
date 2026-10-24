import { BuscadorSelect } from "@/components/BuscadorSelect";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Valor de la opción que deja el nombre del archivo como un banco nuevo (no puede chocar con el nombre de un banco). */
const NUEVO = "__banco_nuevo__";

type Props = {
  /** Nombres de banco del archivo que la app no conoce (sin repetir). */
  nombres: string[];
  /** Bancos para elegir. */
  bancos: string[];
  /** Recuerda que `nombre` es el banco `banco`. */
  onElegir: (nombre: string, banco: string) => Promise<void>;
};

export function BancosDesconocidos({ nombres, bancos, onElegir }: Props) {
  if (nombres.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Bancos del archivo que no conozco</CardTitle>
        <p className="text-sm text-muted-foreground">Mientras no se sepa qué banco es, las filas con ese nombre no se pueden importar. Se recuerda la respuesta.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {nombres.map((nombre) => (
          <div key={nombre} className="flex flex-wrap items-center gap-3">
            <span className="min-w-40 text-sm font-medium">{nombre} es…</span>
            <div className="w-72">
              <BuscadorSelect
                value=""
                onChange={(v) => {
                  if (v) void onElegir(nombre, v === NUEVO ? nombre : v);
                }}
                opciones={[...bancos.map((b) => ({ value: b, label: b })), { value: NUEVO, label: "Es un banco nuevo: dejar este nombre" }]}
                placeholder="Elegir banco…"
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
