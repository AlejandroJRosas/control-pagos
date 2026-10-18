export const BANCOS_SUGERIDOS = [
  "100% Banco",
  "Activo",
  "Bancamiga",
  "Bancaribe",
  "Banco de Venezuela",
  "Banco del Tesoro",
  "Bancrecer",
  "Banesco",
  "Banfanb",
  "Banplus",
  "Bicentenario",
  "BNC",
  "Del Sur",
  "Exterior",
  "Mercantil",
  "Mi Banco",
  "Provincial",
  "R4",
  "Sofitasa",
  "Venezolano de Crédito",
];

export function sugerenciasBancos(usados: string[]): string[] {
  const porClave = new Map<string, string>();
  for (const b of [...BANCOS_SUGERIDOS, ...usados]) {
    const clave = b.trim().toLowerCase();
    if (clave && !porClave.has(clave)) porClave.set(clave, b.trim());
  }
  return [...porClave.values()].sort((a, b) => a.localeCompare(b, "es"));
}
