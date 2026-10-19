import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ATAJOS } from "@/hooks/useAtajo";

export function Tecla({ children }: { children: string }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border bg-muted px-1 font-sans text-[11px] font-medium">{children}</kbd>;
}

export function AyudaAtajos({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Atajos de teclado</DialogTitle>
          <DialogDescription>Las teclas solas no funcionan mientras escribes en un campo.</DialogDescription>
        </DialogHeader>
        <dl className="grid gap-2 text-sm">
          {ATAJOS.map((a) => (
            <div key={a.que} className="flex items-start justify-between gap-4">
              <dt className="text-muted-foreground">{a.que}</dt>
              <dd className="flex shrink-0 gap-1">
                {a.teclas.map((t) => (
                  <Tecla key={t}>{t}</Tecla>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
