// Formato y geometría del lado del servidor.
//
// Las funciones de fecha y folio son el gemelo exacto de las de
// `Ventd-frontend/src/lib/formato.ts`: el mismo folio tiene que salir del
// mismo número a los dos lados, o el vecino lee un código en pantalla que no
// existe en la bitácora.

/** 1 = lunes … 7 = domingo, como `extract(isodow)` en Postgres. */
function diaIso(fecha) {
  const d = fecha.getDay();
  return d === 0 ? 7 : d;
}

/** '2026-08-07' sin correr riesgo de desfase por zona horaria. */
function claveFecha(fecha) {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  const d = String(fecha.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function desdeClave(clave) {
  const [y, m, d] = String(clave).split("-").map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1);
}

function hoyFecha() {
  return claveFecha(new Date());
}

function hoyDiaIso() {
  return diaIso(new Date());
}

/** Corre `dias` hacia atrás desde hoy y devuelve la clave de esa fecha. */
function fechaHaceDias(dias) {
  const f = new Date();
  f.setDate(f.getDate() - dias);
  return claveFecha(f);
}

/** 'PASO-4F2A9' — corto, legible en voz alta y sin caracteres ambiguos. */
function generarFolio(semilla) {
  const alfabeto = "0123456789ABCDEF";
  let n = Math.abs(Math.floor(semilla));
  let salida = "";
  for (let i = 0; i < 5; i += 1) {
    salida = alfabeto[n % 16] + salida;
    n = Math.floor(n / 16) + 7;
  }
  return `PASO-${salida}`;
}

// ── Geometría aproximada ─────────────────────────────────────────────────────
//
// ⚠️ Los polígonos son APROXIMADOS y están declarados como tales
// (`aproximado: true` en cada colonia). En el sistema real vienen del GeoJSON
// de la alcaldía; mientras no exista, se genera una forma plausible alrededor
// del centro conocido. Es el mismo generador determinista que usaba el
// frontend, movido acá para que la forma la decida el backend.

function pseudoAleatorio(semilla) {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Polígono irregular de 9 lados. Parece un barrio, no un círculo. */
function poligonoAproximado(centro, radioKm, semilla) {
  const azar = pseudoAleatorio(semilla);
  const lados = 9;
  const gradosPorKmLat = 1 / 110.574;
  const gradosPorKmLng = 1 / (111.32 * Math.cos((centro[0] * Math.PI) / 180));
  const puntos = [];
  for (let i = 0; i < lados; i += 1) {
    const angulo = (i / lados) * Math.PI * 2;
    const r = radioKm * (0.68 + azar() * 0.52);
    puntos.push([
      centro[0] + Math.sin(angulo) * r * gradosPorKmLat,
      centro[1] + Math.cos(angulo) * r * gradosPorKmLng,
    ]);
  }
  return puntos;
}

module.exports = {
  diaIso,
  claveFecha,
  desdeClave,
  hoyFecha,
  hoyDiaIso,
  fechaHaceDias,
  generarFolio,
  poligonoAproximado,
};
