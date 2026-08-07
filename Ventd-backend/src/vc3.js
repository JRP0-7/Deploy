// VC-3 — el modelo de evidencia de PASÓ.
//
// Tres reglas gobiernan todo lo que sale de acá:
//   1. El silencio nunca es cumplimiento. Sin señal, el estado es
//      `sin_verificar`; jamás `cumplido`.
//   2. `en_disputa` es un estado real. Cuando la señal dura y la ciudadana se
//      contradicen, el sistema NO elige ganador: registra el desacuerdo.
//   3. El nivel de evidencia cuenta FUENTES, no marcas. Quince vecinos siguen
//      siendo una sola fuente, y por eso NE >= 2 exige de verdad que dos partes
//      distintas digan lo mismo.
//
// Este archivo es puro: no toca la base ni el reloj. Las dos implementaciones
// del store (memoria y Supabase) lo comparten, así que un cambio de umbral se
// hace una sola vez y las dos se mueven juntas.

/** Mínimo de vecinos que dicen lo mismo para que su voz cuente como fuente. */
const UMBRAL_VECINOS = 3;

/** Confianza que aporta la evidencia puramente ciudadana. Nunca llega a 1. */
function confianzaCiudadana(n) {
  return Math.min(0.85, 0.55 + 0.1 * (n - UMBRAL_VECINOS));
}

/** ¿Los vecinos alcanzaron a formar una fuente? Da igual hacia qué lado. */
function vecinosCuentanComoFuente(nSi, nNo) {
  return nSi >= UMBRAL_VECINOS || nNo >= UMBRAL_VECINOS;
}

/** Los vecinos dicen que NO pasó, y son mayoría sobre los que dicen que sí. */
function vecinosNiegan(nSi, nNo) {
  return nNo >= UMBRAL_VECINOS && nNo > nSi;
}

/**
 * NE-1 es una fuente, NE-2 son dos, NE-3 son las tres: GPS, cuadrilla y
 * vecinos. Se cuentan fuentes distintas, no marcas acumuladas.
 */
function nivelEvidencia({ senalGps, senalChofer, nConfirmanSi, nConfirmanNo }) {
  const fuentes =
    (senalGps ? 1 : 0) +
    (senalChofer ? 1 : 0) +
    (vecinosCuentanComoFuente(nConfirmanSi, nConfirmanNo) ? 1 : 0);
  return Math.min(3, fuentes);
}

/**
 * Verificado de verdad = cumplido con al menos dos fuentes independientes.
 * Es la regla que impide que un montón de confirmaciones ciudadanas emitan un
 * certificado de cumplimiento por sí solas.
 */
function cuentaComoVerificado(registro) {
  return registro.estado === "cumplido" && registro.nivelEvidencia >= 2;
}

/**
 * Recalcula el registro después de una confirmación ciudadana.
 *
 * `previo` es el registro tal como estaba; `paso` es lo que dijo el vecino.
 * Devuelve un registro nuevo — nada se muta, porque nada se edita ni se borra.
 */
function aplicarConfirmacion(previo, paso) {
  const nConfirmanSi = previo.nConfirmanSi + (paso ? 1 : 0);
  const nConfirmanNo = previo.nConfirmanNo + (paso ? 0 : 1);
  const senalDura = previo.senalGps || previo.senalChofer;

  let estado;
  let nivel = nivelEvidencia({ ...previo, nConfirmanSi, nConfirmanNo });
  let confianza = previo.confianza;

  if (senalDura && vecinosNiegan(nConfirmanSi, nConfirmanNo)) {
    // La señal dura dice que pasó y el barrio dice que no. No se elige ganador.
    estado = "en_disputa";
  } else if (senalDura) {
    estado = previo.estado === "en_curso" ? "en_curso" : "cumplido";
  } else if (vecinosNiegan(nConfirmanSi, nConfirmanNo)) {
    estado = "no_cumplido";
    nivel = 1;
    confianza = confianzaCiudadana(nConfirmanNo);
  } else if (nConfirmanSi >= UMBRAL_VECINOS) {
    estado = "cumplido";
    nivel = 1;
    confianza = confianzaCiudadana(nConfirmanSi);
  } else {
    // Dos confirmaciones no alcanzan. El silencio sigue siendo silencio.
    estado = "sin_verificar";
  }

  return {
    ...previo,
    estado,
    nivelEvidencia: nivel,
    confianza,
    nConfirmanSi,
    nConfirmanNo,
    horaVerificada: estado === "sin_verificar" ? null : new Date().toISOString(),
  };
}

/**
 * Recalcula el registro después de una marca de la cuadrilla.
 *
 * ⚠️ Esto NO pasa por `aplicarConfirmacion`. La marca del chofer es una señal
 * DURA, como el GPS, y sumarla a `nConfirmanSi` inflaría la evidencia
 * ciudadana con un dato de la empresa: el panel diría "confirmado por 4
 * vecinos" cuando fueron 3 vecinos y un empleado.
 *
 * Cuando el chofer marca que NO pudo, la colonia queda en `no_cumplido` y no
 * en disputa: es la propia empresa la que declara el incumplimiento, y esa
 * declaración va en contra de su interés. No hay dos versiones que enfrentar.
 */
function aplicarMarcaChofer(previo, hecho) {
  const nivel = nivelEvidencia({ ...previo, senalChofer: true });

  let estado;
  if (!hecho) {
    estado = "no_cumplido";
  } else if (vecinosNiegan(previo.nConfirmanSi, previo.nConfirmanNo)) {
    estado = "en_disputa";
  } else {
    estado = "cumplido";
  }

  return {
    ...previo,
    estado,
    senalChofer: true,
    nivelEvidencia: nivel,
    confianza: Math.min(0.98, 0.6 + 0.15 * nivel),
    horaVerificada: new Date().toISOString(),
  };
}

/**
 * El camión entró a la colonia y el GPS lo registró.
 *
 * Solo mueve lo que estaba en silencio: una colonia que ya tiene estado no se
 * pisa, y una disputa no se resuelve sola porque pase un camión.
 */
function aplicarPasoDeCamion(previo) {
  if (previo.estado !== "sin_verificar" && previo.estado !== "en_curso") return previo;
  return {
    ...previo,
    estado: previo.estado === "en_curso" ? "cumplido" : "en_curso",
    senalGps: true,
    nivelEvidencia: nivelEvidencia({ ...previo, senalGps: true }),
    confianza: 0.95,
    horaVerificada: new Date().toISOString(),
  };
}

/** Un registro en blanco: programado o no, sin una sola señal. */
function registroVacio(coloniaId, fecha, programado) {
  return {
    coloniaId,
    fecha,
    programado,
    estado: "sin_verificar",
    nivelEvidencia: 0,
    confianza: 0,
    senalGps: false,
    senalChofer: false,
    nConfirmanSi: 0,
    nConfirmanNo: 0,
    horaVerificada: null,
  };
}

/**
 * El Índice de Cumplimiento del Servicio de una colonia.
 *
 * Es la fracción de ciclos contratados que se pudieron verificar, ponderada
 * por la confianza de esas verificaciones. Cuando no hay ciclos contratados
 * devuelve 0 y no un promedio inventado: sin contrato no hay nada que medir.
 */
function calcularIcs(registros) {
  const programados = registros.filter((r) => r.programado);
  if (programados.length === 0) return 0;
  const verificados = programados.filter(cuentaComoVerificado);
  if (verificados.length === 0) return 0;
  const confianzaMedia =
    verificados.reduce((suma, r) => suma + r.confianza, 0) / verificados.length;
  return (verificados.length / programados.length) * confianzaMedia;
}

module.exports = {
  UMBRAL_VECINOS,
  nivelEvidencia,
  cuentaComoVerificado,
  vecinosNiegan,
  aplicarConfirmacion,
  aplicarMarcaChofer,
  aplicarPasoDeCamion,
  registroVacio,
  calcularIcs,
};
