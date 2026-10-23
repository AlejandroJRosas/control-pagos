/** Ruta de la pantalla Consolidar para un paquete extraído en `carpeta` (relativa a AppData), con la campaña sugerida. */
export function rutaConsolidar(carpeta: string, campanaId: number | null): string {
  const q = new URLSearchParams({ carpeta });
  if (campanaId !== null) q.set("campana", String(campanaId));
  return `/consolidar?${q}`;
}
