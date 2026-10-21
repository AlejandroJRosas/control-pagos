import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getDb } from "@/db";
import { getAjuste, setAjuste } from "@/db/repos/ajustes";
import { AJUSTE_ANTELACION_CUMPLE, ANTELACION_CUMPLE_MAX, antelacionDeAjuste } from "@/domain/cumpleanos";
import { invalidate, useData } from "@/hooks/useData";
import { reportError } from "@/lib/reportError";

/** Días de antelación con que se avisan los cumpleaños de los gerentes. */
export function AvisoCumpleanosCard() {
  const { data: guardada } = useData(async (db) => antelacionDeAjuste(await getAjuste(db, AJUSTE_ANTELACION_CUMPLE)), []);
  const [valor, setValor] = useState("");
  useEffect(() => {
    if (guardada !== undefined) setValor(String(guardada));
  }, [guardada]);

  const dias = /^\d+$/.test(valor) ? Number(valor) : null;
  const valido = dias !== null && dias <= ANTELACION_CUMPLE_MAX;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!valido) return;
    try {
      await setAjuste(await getDb(), AJUSTE_ANTELACION_CUMPLE, String(dias));
      toast.success("Antelación guardada");
      invalidate();
    } catch (err) {
      reportError(err);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cumpleaños</CardTitle>
        <CardDescription>
          Arriba de cada pantalla se avisa el cumpleaños de los gerentes activos con estos días de antelación, todos los días hasta la fecha. Con 0 solo se
          avisa el mismo día.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={guardar} className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1.5">
            <Label htmlFor="cumple-antelacion">Días de antelación</Label>
            <Input
              id="cumple-antelacion"
              type="number"
              min={0}
              max={ANTELACION_CUMPLE_MAX}
              className="w-24"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
          </div>
          <Button type="submit" variant="outline" aria-label="Guardar antelación" disabled={!valido || dias === guardada}>
            Guardar
          </Button>
          {!valido && valor !== "" && <span className="text-sm text-destructive">Entre 0 y {ANTELACION_CUMPLE_MAX} días</span>}
        </form>
      </CardContent>
    </Card>
  );
}
