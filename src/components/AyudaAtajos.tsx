import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ATAJOS } from "@/hooks/useAtajo";
import { cn } from "@/lib/utils";

export function Tecla({ children, className }: { children: string; className?: string }) {
  return (
    <kbd className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded border bg-muted px-1 font-sans text-[11px] font-medium", className)}>{children}</kbd>
  );
}

export function AyudaAtajos({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100%-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Atajos de teclado</DialogTitle>
          <DialogDescription>Las teclas solas no funcionan mientras escribes en un campo.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 md:grid-cols-2 md:gap-0 md:divide-x">
          {ATAJOS.map((g) => (
            <section key={g.titulo} className="md:px-5 md:first:pl-0 md:last:pr-0">
              <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{g.titulo}</h3>
              <dl className="grid gap-2 text-sm">
                {g.atajos.map((a) => (
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
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
