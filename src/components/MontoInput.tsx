import { useLayoutEffect, useRef, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { mascaraMonto, parseMonto, toInputVE } from "@/domain/money";

type Props = Omit<ComponentProps<"input">, "value" | "onChange"> & { value: string; onChange: (value: string) => void };

/**
 * Campo de monto que separa los miles mientras se escribe (90000.543 → 90.000,543): el punto o la coma que escribe el
 * usuario es el decimal. Lo pegado se lee con `parseMonto` (ahí "1.234" sigue siendo mil).
 */
export function MontoInput({ value, onChange, ...props }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (caret.current != null && el && document.activeElement === el) el.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  }, [value]);

  function cambiar(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    const pos = e.target.selectionStart ?? raw.length;
    const ev = e.nativeEvent as InputEvent;
    if (ev.inputType === "insertFromPaste" || ev.inputType === "insertFromDrop") {
      const m = parseMonto(raw);
      if (m) return onChange(toInputVE(m));
      const r = mascaraMonto(raw, pos, raw.includes(",") ? null : raw.lastIndexOf(".") >= 0 ? raw.lastIndexOf(".") : null);
      caret.current = r.caret;
      return onChange(r.texto);
    }
    const r = mascaraMonto(raw, pos, ev.inputType === "insertText" && ev.data === "." ? pos - 1 : null);
    caret.current = r.caret;
    onChange(r.texto);
  }

  return <Input ref={ref} inputMode="decimal" {...props} value={value} onChange={cambiar} />;
}
