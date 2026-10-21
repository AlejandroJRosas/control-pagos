import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";

let cache: Promise<string> | null = null;

/** Versión instalada de la app (se pide una sola vez); `null` mientras llega. */
export function useVersion(): string | null {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    cache ??= getVersion();
    cache.then((v) => vivo && setVersion(v)).catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);
  return version;
}
