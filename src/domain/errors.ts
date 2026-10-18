export type DomainErrorCode = "VALIDACION" | "DUPLICADO" | "TASA_EN_USO" | "NO_ENCONTRADO" | "CAMPANA_CERRADA";

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}
