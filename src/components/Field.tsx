import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

type Props = { id: string; label: string; error?: string; hint?: string; children: ReactNode };

export function Field({ id, label, error, hint, children }: Props) {
  return (
    <div className="grid content-start gap-1.5" data-error={error ? "" : undefined}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <p className="text-sm text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
