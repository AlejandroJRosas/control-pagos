// Vista previa en el navegador (`pnpm vista`): los comandos de Rust no existen; responden algo inofensivo.
const respuestas: Record<string, unknown> = {
  list_backups: [],
  data_paths: { dbPath: "C:/vista-previa/control-pagos.db", imagesDir: "C:/vista-previa/imagenes", backupsDir: "C:/vista-previa/respaldos" },
  tamano_imagenes: 0,
  auto_backup_path: null,
  auto_backup_path_hoy: "C:/vista-previa/respaldos/auto.zip",
  nombre_equipo: "VISTA-PREVIA",
};

export async function invoke<T>(cmd: string): Promise<T> {
  if (cmd in respuestas) return respuestas[cmd] as T;
  if (cmd === "ocr_imagen") throw new Error("El OCR no está disponible en la vista previa.");
  return undefined as T;
}
