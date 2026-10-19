import { Link } from "react-router";
import { ListChecks } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { getDb } from "@/db";
import { borradorTasaVacio, encolarTasa, getItemColaTasa, guardarBorradorTasa } from "@/db/repos/cola";
import { extractor } from "@/extraction/extractor";
import { deleteImage, saveImage } from "@/platform/images";
import { invalidate } from "@/hooks/useData";
import { borradorTasaConOcr } from "./leerEnBorrador";
import { useLote } from "./useLote";
import { BarraIrARevisar, TablaLote, ZonaLote } from "./ZonaLote";

export function SubirLoteTasasPage() {
  const { filas, agregar } = useLote({
    async encolar(file) {
      const imagenPath = await saveImage(file);
      try {
        const id = await encolarTasa(await getDb(), { imagenPath, nombreArchivo: file.name, borrador: borradorTasaVacio() });
        invalidate();
        return id;
      } catch (e) {
        await deleteImage(imagenPath);
        throw e;
      }
    },
    async leer(file, id) {
      const r = await extractor.extraerTasa(file);
      const db = await getDb();
      const item = await getItemColaTasa(db, id);
      if (item?.estado !== "pendiente") return r.formato;
      await guardarBorradorTasa(db, id, borradorTasaConOcr(item.borrador, r.fields), r.formato);
      invalidate();
      return r.formato;
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ to: "/tasas", label: "Tasas" }}
        title="Subir tasas en lote"
        subtitle="Cada imagen se lee y queda en la cola de revisión; la tasa se registra al darle Hecho."
        actions={
          filas.length === 0 && (
            <Link to="/tasas/revision" className={buttonVariants()}>
              <ListChecks />
              Ir a revisar
            </Link>
          )
        }
      />
      <ZonaLote onArchivos={agregar} />
      <TablaLote filas={filas} />
      <BarraIrARevisar to="/tasas/revision" filas={filas} />
    </div>
  );
}
