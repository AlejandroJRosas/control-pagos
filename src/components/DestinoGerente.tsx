import { Input } from "@/components/ui/input";
import { Field } from "@/components/Field";
import { NativeSelect } from "@/components/NativeSelect";
import type { AsignacionData } from "@/domain/campanaView";
import type { DestinoDraft } from "@/domain/validation";
import type { Gerente } from "@/db/repos/gerentes";

type Props = {
  id: string;
  asignaciones: AsignacionData[];
  gerentes: Gerente[];
  value: DestinoDraft;
  onChange: (v: DestinoDraft) => void;
  errors?: Partial<Record<keyof DestinoDraft, string>>;
};

/** Elige el gerente de un depósito: uno de la campaña, otro existente (con saldo) o uno nuevo (con nombre y saldo). */
export function DestinoGerente({ id, asignaciones, gerentes, value, onChange, errors = {} }: Props) {
  const enCampana = new Set(asignaciones.map((a) => a.gerenteId));
  const otros = gerentes.filter((g) => !enCampana.has(g.id) && (g.activo || value.sel === `g:${g.id}`));
  const pideSaldo = value.sel === "nuevo" || value.sel.startsWith("g:");

  return (
    <div className="grid grid-cols-2 gap-4">
      <Field id={`${id}-gerente`} label="Gerente" error={errors.sel}>
        <NativeSelect id={`${id}-gerente`} value={value.sel} onChange={(e) => onChange({ ...value, sel: e.target.value })}>
          <option value="">Selecciona…</option>
          {asignaciones.length > 0 && (
            <optgroup label="En esta campaña">
              {asignaciones.map((a) => (
                <option key={a.id} value={`a:${a.id}`}>
                  {a.gerenteNombre}
                </option>
              ))}
            </optgroup>
          )}
          {otros.length > 0 && (
            <optgroup label="Agregar a la campaña">
              {otros.map((g) => (
                <option key={g.id} value={`g:${g.id}`}>
                  {g.nombre}
                </option>
              ))}
            </optgroup>
          )}
          <option value="nuevo">+ Nuevo gerente…</option>
        </NativeSelect>
      </Field>
      {pideSaldo && (
        <Field id={`${id}-saldo`} label="Saldo a pagar (USD)" error={errors.saldo} hint="Se agrega a la campaña con este saldo">
          <Input
            id={`${id}-saldo`}
            inputMode="decimal"
            className="text-right tabular-nums"
            value={value.saldo}
            onChange={(e) => onChange({ ...value, saldo: e.target.value })}
          />
        </Field>
      )}
      {value.sel === "nuevo" && (
        <div className="col-span-2">
          <Field id={`${id}-nombre`} label="Nombre del nuevo gerente" error={errors.nombre}>
            <Input id={`${id}-nombre`} value={value.nombre} onChange={(e) => onChange({ ...value, nombre: e.target.value })} />
          </Field>
        </div>
      )}
    </div>
  );
}
