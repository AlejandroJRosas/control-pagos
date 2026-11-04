// Datos de demostración de la vista previa: una campaña activa con estructura, depósitos de las últimas semanas, tasas,
// metas y un par de cumpleaños cercanos; otra campaña cerrada. Todo relativo a hoy, para que los avisos tengan sentido.
import type { SqlDriver } from "@/db/driver";
import { createCampana, setEstadoCampana } from "@/db/repos/campanas";
import { createGerente } from "@/db/repos/gerentes";
import { createAsignacion } from "@/db/repos/asignaciones";
import { createTasa, getTasaParaFecha } from "@/db/repos/tasas";
import { createDeposito } from "@/db/repos/depositos";
import { createMeta } from "@/db/repos/metas";
import { precargarFeriados } from "@/db/repos/feriados";
import { sumarDias, todayIso } from "@/domain/dates";

const BANCOS = ["Banesco", "Venezuela", "Mercantil", "Provincial", "BNC", "Bancamiga"];
const CUENTAS = ["Inversiones Andina CA", "Comercial El Roble CA"];

/** Números "al azar" pero siempre los mismos (las capturas salen iguales). */
function azar(semilla: number) {
  let s = semilla;
  return () => {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    return s / 2 ** 31;
  };
}

const nacimientoEn = (hoy: string, dias: number, anios: number) => {
  const f = sumarDias(hoy, dias);
  return `${Number(f.slice(0, 4)) - anios}${f.slice(4)}`;
};

export async function sembrar(db: SqlDriver): Promise<void> {
  const hoy = todayIso();
  const r = azar(7);
  await precargarFeriados(db, hoy);
  await precargarFeriados(db, sumarDias(hoy, -60));

  // Tasas de los últimos 45 días hábiles y la que rige hoy (los fines de semana y feriados se saltan solos).
  let valor = 210;
  for (let d = -45; d <= 0; d++) {
    valor += r() * 1.2;
    await createTasa(db, { fecha: sumarDias(hoy, d), valor: valor.toFixed(4), notas: null, imagenPath: null }).catch(() => {});
  }

  const nombres = [
    ["María González", 2, 41],
    ["José Pérez", 0, 35],
    ["Carmen Rodríguez", null, 0],
    ["Luis Hernández", null, 0],
    ["Ana Martínez", 25, 29],
    ["Pedro Ramírez", null, 0],
    ["Rosa Díaz", null, 0],
    ["Carlos Torres", null, 0],
    ["Elena Castillo", null, 0],
  ] as const;
  const gerentes: number[] = [];
  for (const [nombre, dias, anios] of nombres)
    gerentes.push(
      await createGerente(db, { nombre, telefono: "0414-555-0101", nacimiento: dias === null ? null : nacimientoEn(hoy, dias, anios) }),
    );

  const inicio = sumarDias(hoy, -40);
  const campana = await createCampana(db, { nombre: "Demostración", fechaInicio: inicio, fechaFin: sumarDias(hoy, 30), notas: null });
  const saldos = ["1500", "1200", "900", "800", "1000", "600", "700", "500", "450"];
  // Estructura: María y José son jefes; los demás cuelgan de ellos (Elena queda sin estructura).
  const jefes = [null, 0, 0, 1, 1, 0, 1, 3, null];
  const asig: number[] = [];
  for (let i = 0; i < gerentes.length; i++) {
    const jefe = jefes[i];
    asig.push(await createAsignacion(db, { campanaId: campana, gerenteId: gerentes[i], saldoUsd: saldos[i], jefeId: jefe === null ? null : asig[jefe] }));
  }

  let ref = 100200300;
  for (let i = 0; i < asig.length; i++) {
    const n = 2 + Math.floor(r() * 6);
    for (let k = 0; k < n; k++) {
      const fecha = sumarDias(hoy, -Math.floor(r() * 38));
      const tasa = await getTasaParaFecha(db, fecha);
      if (!tasa) continue;
      const usd = 40 + Math.floor(r() * 160);
      await createDeposito(db, asig[i], {
        fecha,
        banco: BANCOS[Math.floor(r() * BANCOS.length)],
        referencia: String(ref++),
        cuentaDestino: CUENTAS[k % 2],
        montoBs: (usd * Number(tasa.valor)).toFixed(2),
        tasaId: tasa.id,
        observaciones: null,
        imagenPath: null,
      });
    }
  }
  await createMeta(db, campana, { montoUsd: "2000", fecha: sumarDias(hoy, -10), nota: null });
  await createMeta(db, campana, { montoUsd: "5000", fecha: sumarDias(hoy, 12), nota: null });

  const vieja = await createCampana(db, { nombre: "Temporada anterior", fechaInicio: sumarDias(hoy, -120), fechaFin: sumarDias(hoy, -60), notas: null });
  await createAsignacion(db, { campanaId: vieja, gerenteId: gerentes[0], saldoUsd: "800" });
  await setEstadoCampana(db, vieja, "cerrada");
}
