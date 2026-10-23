/// <reference types="vite/client" />

declare module "virtual:novedades" {
  const novedades: import("@/domain/novedades").Novedad[];
  export default novedades;
}
