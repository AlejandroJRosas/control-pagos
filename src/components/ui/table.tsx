"use client"

import * as React from "react"
import { cn } from "cn"

// Sin overflow propio: así el encabezado (sticky) se pega arriba al bajar por la página. Dentro de una Card el fondo
// del encabezado es el de la tarjeta (--fondo-tabla).
function Table({ className, contenedorClassName, ...props }: React.ComponentProps<"table"> & { contenedorClassName?: string }) {
  return (
    <div
      data-slot="table-container"
      className={cn("relative w-full", contenedorClassName)}
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn(
        "sticky top-0 z-20 bg-[var(--fondo-tabla,var(--background))] shadow-[inset_0_-1px_0_var(--border)] [&_tr]:border-b",
        className
      )}
      {...props}
    />
  )
}

// Pie de totales pegado abajo, con el total a la vista; data-barra-inferior en el tfoot sube el botón de volver arriba
// para no taparlo.
const STICKY_PIE = "sticky bottom-0 z-20 border-t-0 bg-[var(--fondo-tabla,var(--background))] shadow-[inset_0_1px_0_var(--border)]"

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors even:bg-fila-par hover:bg-fila-hover has-aria-expanded:bg-fila-hover data-[state=selected]:bg-fila-sel",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
  STICKY_PIE,
}
