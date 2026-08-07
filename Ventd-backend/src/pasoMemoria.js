// PASÓ · Los métodos de verificación en memoria.
//
// Es el modo demo: sin credenciales de Supabase el backend sigue respondiendo
// el contrato completo, con historia sembrada de 35 días para que las cifras
// del panel no salgan todas en cero.
//
// La siembra es DETERMINISTA a propósito. Una demo que cambia sola en cada
// arranque es una demo que no se puede ensayar.
//
// La lógica de cómo se mueve un estado no está acá: está en `vc3.js`, igual
// que en el modo Supabase. Este archivo solo guarda y busca.

const vc3 = require("./vc3");
const { SEMILLAS, VENTANA_INICIO, VENTANA_FIN } = require("./coloniasSps");
const {
  hoyFecha,
  claveFecha,
  desdeClave,
  diaIso,
  generarFolio,
  poligonoAproximado,
} = require("./formato");

const DIAS_HISTORIA = 35;

/** Cada estado tiene su colonia en el guion, para que se vean los cinco. */
const GUION = {
  "col-barandillas": "cumplido",
  "col-satelite": "en_curso",
  "col-las-brisas": "no_cumplido",
  "col-los-andes": "sin_verificar",
  "col-trejo": "en_disputa",
  "col-rivera-hernandez": "sin_verificar",
};

/** Rachas de abandono del guion. Rivera Hernández es el caso documentado. */
const RACHAS = {
  "col-rivera-hernandez": 30,
  "col-lopez-arellano": 12,
  "col-planeta": 9,
  "col-yulissa": 8,
  "col-celeo-gonzales": 5,
};

function generador(semilla) {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const COLONIAS = SEMILLAS.map((s, i) => ({
  id: s.id,
  nombre: s.nombre,
  distrito: s.distrito,
  poblacionEst: s.poblacion,
  frecuenciaContratada: s.dias.length,
  diasProgramados: s.dias,
  ventanaInicio: VENTANA_INICIO,
  ventanaFin: VENTANA_FIN,
  centro: s.centro,
  poligono: poligonoAproximado(s.centro, s.radioKm, 1000 + i * 97),
  aproximado: true,
}));

const COLONIAS_POR_ID = new Map(COLONIAS.map((c) => [c.id, c]));

/** Un registro con las señales que ese estado implica, y ninguna más. */
function construir(coloniaId, fecha, estado, programado, r) {
  const base = vc3.registroVacio(coloniaId, fecha, programado);
  const dia = desdeClave(fecha);
  const conHora = (h, m) => {
    const d = new Date(dia);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };

  if (estado === "cumplido") {
    const soloVecinos = r > 0.82;
    if (soloVecinos) {
      return { ...base, estado, nivelEvidencia: 1, nConfirmanSi: 3 + Math.floor(r * 4), confianza: 0.75, horaVerificada: conHora(6 + Math.floor(r * 5), Math.floor(r * 59)) };
    }
    const senalGps = r > 0.35;
    return {
      ...base, estado, senalGps, senalChofer: !senalGps || r > 0.7,
      nivelEvidencia: senalGps ? 3 : 2, confianza: senalGps ? 0.95 : 0.75,
      nConfirmanSi: Math.floor(r * 9), horaVerificada: conHora(6 + Math.floor(r * 5), Math.floor(r * 59)),
    };
  }
  if (estado === "en_curso") {
    return { ...base, estado, senalGps: true, nivelEvidencia: 3, confianza: 0.95, horaVerificada: new Date().toISOString() };
  }
  if (estado === "no_cumplido") {
    const n = 3 + Math.floor(r * 5);
    return { ...base, estado, nivelEvidencia: 1, nConfirmanNo: n, confianza: Math.min(0.85, 0.55 + 0.1 * (n - 3)), horaVerificada: conHora(11, 30) };
  }
  if (estado === "en_disputa") {
    return { ...base, estado, senalGps: true, nivelEvidencia: 3, confianza: 0.95, nConfirmanSi: 1, nConfirmanNo: 5 + Math.floor(r * 4), horaVerificada: conHora(8, 15) };
  }
  return base; // sin_verificar: el silencio no lleva señales
}

function estadoHistorico(coloniaId, programado, r) {
  if (!programado) return "sin_verificar";
  const abandono = (RACHAS[coloniaId] || 0) / 30;
  const umbral = 0.18 + abandono * 0.55;
  if (r < umbral) return "sin_verificar";
  if (r < umbral + 0.12 + abandono * 0.2) return "no_cumplido";
  if (r > 0.97) return "en_disputa";
  return "cumplido";
}

function crearPasoMemoria(estado) {
  const registros = new Map();
  const bitacora = [];
  const confirmaciones = new Set();
  const escaladas = new Set();
  const llave = (coloniaId, fecha) => `${coloniaId}|${fecha}`;

  function anotar(entrada) {
    const seq = 4800 + bitacora.length + 1;
    bitacora.push({ seq, creadoEn: new Date().toISOString(), ...entrada });
    return seq;
  }

  (function sembrar() {
    const azar = generador(20260807);
    for (const colonia of COLONIAS) {
      const racha = RACHAS[colonia.id] || 0;
      for (let atras = DIAS_HISTORIA; atras >= 0; atras -= 1) {
        const f = new Date();
        f.setDate(f.getDate() - atras);
        const fecha = claveFecha(f);
        const programado = colonia.diasProgramados.includes(diaIso(f));
        const r = azar();

        let est;
        let semilla = r;
        if (racha > 0 && atras === racha) {
          // El ancla verificada justo después de la racha. Sin ella, una racha
          // de 30 días en una ventana de 35 es indistinguible de una de 300.
          est = "cumplido";
          semilla = 0.5;
        } else if (atras === 0) {
          est = GUION[colonia.id] || estadoHistorico(colonia.id, programado, r);
        } else if (atras < racha) {
          est = "sin_verificar";
        } else {
          est = estadoHistorico(colonia.id, programado, r);
        }

        const forzado = (atras === 0 && colonia.id in GUION) || est === "cumplido";
        registros.set(llave(colonia.id, fecha), construir(colonia.id, fecha, est, programado || forzado, semilla));
      }
    }
  })();

  function registroDe(coloniaId, fecha) {
    const actual = registros.get(llave(coloniaId, fecha));
    if (actual) return actual;
    const colonia = COLONIAS_POR_ID.get(coloniaId);
    const programado = !!colonia && colonia.diasProgramados.includes(diaIso(desdeClave(fecha)));
    const nuevo = vc3.registroVacio(coloniaId, fecha, programado);
    registros.set(llave(coloniaId, fecha), nuevo);
    return nuevo;
  }

  function historia(coloniaId) {
    const salida = [];
    for (let atras = 0; atras <= DIAS_HISTORIA; atras += 1) {
      const f = new Date();
      f.setDate(f.getDate() - atras);
      const reg = registros.get(llave(coloniaId, claveFecha(f)));
      if (reg) salida.push(reg);
    }
    return salida;
  }

  function contarDiasSinServicio(coloniaId) {
    let dias = 0;
    for (const reg of historia(coloniaId)) {
      if (vc3.cuentaComoVerificado(reg)) return dias;
      dias += 1;
    }
    return dias;
  }

  function camionesPaso() {
    return estado.camiones.map((c) => ({
      id: c.id,
      placa: c.placa,
      estado: c.estado,
      choferNombre: c.conductor,
      coloniaActualId: null,
      avanceRuta: undefined,
      ultimoEvento: c.nota ? { tipo: "incidente", ts: new Date().toISOString(), detalle: c.nota } : undefined,
    }));
  }

  return {
    async salud() {
      return { ok: true, version: "0.1.0", db: "memoria" };
    },

    async listarColonias() {
      return COLONIAS;
    },

    async estadoHoy(coloniaId) {
      const colonia = COLONIAS_POR_ID.get(coloniaId);
      if (!colonia) throw Object.assign(new Error("No encontramos esa colonia."), { status: 404 });
      const fecha = hoyFecha();

      const semana = [];
      for (let d = -3; d <= 3; d += 1) {
        const f = new Date();
        f.setDate(f.getDate() + d);
        const clave = claveFecha(f);
        const reg = registros.get(llave(coloniaId, clave));
        semana.push({
          fecha: clave,
          diaSemana: diaIso(f),
          programado: colonia.diasProgramados.includes(diaIso(f)),
          estado: d > 0 ? null : reg ? reg.estado : null,
          esHoy: d === 0,
        });
      }

      return {
        colonia,
        registro: registroDe(coloniaId, fecha),
        asiento: 4800 + registros.size - COLONIAS.indexOf(colonia),
        semana,
        diasSinServicioVerificado: contarDiasSinServicio(coloniaId),
      };
    },

    async confirmar(coloniaId, paso, { dispositivo, usuarioId }) {
      if (!COLONIAS_POR_ID.has(coloniaId)) {
        throw Object.assign(new Error("No encontramos esa colonia."), { status: 404 });
      }
      const fecha = hoyFecha();
      const voto = `${coloniaId}|${fecha}|${dispositivo}`;
      if (confirmaciones.has(voto)) {
        throw Object.assign(new Error("Ya habías respondido hoy en esta colonia."), { status: 409 });
      }
      confirmaciones.add(voto);

      const actualizado = vc3.aplicarConfirmacion(registroDe(coloniaId, fecha), paso);
      registros.set(llave(coloniaId, fecha), actualizado);
      const asiento = anotar({ tipo: paso ? "confirmacion_si" : "confirmacion_no", coloniaId, usuarioId, fecha });

      return {
        folio: generarFolio(asiento * 31),
        asiento,
        estado: actualizado.estado,
        nivelEvidencia: actualizado.nivelEvidencia,
        nConfirmanSi: actualizado.nConfirmanSi,
        nConfirmanNo: actualizado.nConfirmanNo,
        posicion: paso ? actualizado.nConfirmanSi : actualizado.nConfirmanNo,
      };
    },

    async marcarParada({ camionId, coloniaId, hecho, motivo, fotoUrl }) {
      if (!COLONIAS_POR_ID.has(coloniaId)) {
        throw Object.assign(new Error("No encontramos esa colonia."), { status: 404 });
      }
      const fecha = hoyFecha();
      const actualizado = vc3.aplicarMarcaChofer(registroDe(coloniaId, fecha), hecho);
      registros.set(llave(coloniaId, fecha), actualizado);

      const parada = estado.rutas.find((r) => r.camionId === camionId && r.coloniaId === coloniaId && r.fecha === fecha);
      if (parada) {
        parada.completada = !!hecho;
        parada.horaFin = new Date().toTimeString().slice(0, 5);
        parada.incidente = hecho ? null : "reportado_conductor";
        parada.motivo = hecho ? null : motivo || null;
      }

      const asiento = anotar({ tipo: hecho ? "cuadrilla_paso" : "cuadrilla_no_pudo", coloniaId, camionId, fecha });

      if (!hecho && motivo) {
        estado.denuncias.unshift({
          id: "den-" + String(estado.denuncias.length + 1001),
          folio: generarFolio(asiento * 23),
          usuarioId: null,
          coloniaId,
          tipo: "no_paso_camion",
          descripcion: `${motivo} — lo reportó la cuadrilla de ${camionId}.`,
          fotoUrl: fotoUrl || null,
          estado: "pendiente",
          confirmacionesComunidad: 0,
          verificadoAdmin: false,
          creadoEn: new Date().toISOString(),
        });
      }

      return { folio: generarFolio(asiento * 23), asiento, estado: actualizado.estado, nivelEvidencia: actualizado.nivelEvidencia };
    },

    async reportarIncidente({ camionId, motivo, detalle }) {
      const c = estado.camiones.find((x) => x.id === camionId);
      if (!c) throw Object.assign(new Error("No encontramos ese camión."), { status: 404 });
      c.estado = "con_incidente";
      c.nota = detalle && detalle.trim() ? `${motivo} · ${detalle.trim()}` : motivo;
      anotar({ tipo: "incidente", camionId, fecha: hoyFecha(), detalle: c.nota });
    },

    async crearReporte({ coloniaId, tipo, descripcion, fotoUrl }, { dispositivo, usuarioId }) {
      const asiento = anotar({ tipo: "queja", coloniaId, usuarioId, fecha: hoyFecha() });
      const reporte = {
        id: "den-" + String(estado.denuncias.length + 1001),
        folio: generarFolio(asiento * 17),
        usuarioId: usuarioId || null,
        dispositivo,
        coloniaId,
        tipo,
        descripcion: descripcion || null,
        fotoUrl: fotoUrl || null,
        estado: "pendiente",
        severidad: 3,
        confirmacionesComunidad: 0,
        verificadoAdmin: false,
        creadoEn: new Date().toISOString(),
        atendidoEn: null,
      };
      estado.denuncias.unshift(reporte);
      return { folio: reporte.folio, asiento, reporte };
    },

    async listarReportesPaso(filtros) {
      return estado.denuncias.filter(
        (d) =>
          (!filtros || !filtros.estado || d.estado === filtros.estado) &&
          (!filtros || !filtros.tipo || d.tipo === filtros.tipo) &&
          (!filtros || !filtros.coloniaId || d.coloniaId === filtros.coloniaId),
      );
    },

    async misReportes({ dispositivo, usuarioId }) {
      return estado.denuncias.filter((d) => d.dispositivo === dispositivo || (usuarioId && d.usuarioId === usuarioId));
    },

    async cambiarEstadoReporte(id, est, resolucion) {
      const d = estado.denuncias.find((x) => x.id === id);
      if (!d) throw Object.assign(new Error("Ese reporte ya no está en la bandeja."), { status: 404 });
      d.estado = est;
      d.atendidoEn = est === "pendiente" ? null : new Date().toISOString();
      if (resolucion) d.resolucion = resolucion;
      anotar({ tipo: "queja_" + est, coloniaId: d.coloniaId, fecha: hoyFecha(), folio: d.folio });
      return d;
    },

    async flotaPaso() {
      return camionesPaso();
    },

    async posiciones() {
      // Sin GPS no se inventa una posición: el mapa lo dice con palabras.
      return [];
    },

    async cobertura() {
      const fecha = hoyFecha();
      return COLONIAS.map((c) => registroDe(c.id, fecha));
    },

    async resumenCiudad() {
      const fecha = hoyFecha();
      const resumen = { cumplido: 0, en_curso: 0, no_cumplido: 0, sin_verificar: 0, en_disputa: 0 };
      for (const c of COLONIAS) resumen[registroDe(c.id, fecha).estado] += 1;
      return resumen;
    },

    async kpis() {
      const fecha = hoyFecha();
      const hoy = COLONIAS.map((c) => registroDe(c.id, fecha));
      const verificados = hoy.filter(vc3.cuentaComoVerificado);
      const conSenal = hoy.filter((r) => r.nivelEvidencia > 0);
      return {
        coberturaVerificada: hoy.length === 0 ? 0 : verificados.length / hoy.length,
        confianzaDelDia: conSenal.length === 0 ? 0 : conSenal.reduce((s, r) => s + r.confianza, 0) / conSenal.length,
        reportesActivos: estado.denuncias.filter((d) => d.estado === "pendiente" || d.estado === "en_atencion").length,
        coloniasSinServicio7d: COLONIAS.filter((c) => contarDiasSinServicio(c.id) >= 7).length,
      };
    },

    async ranking() {
      return COLONIAS.map((c) => ({
        coloniaId: c.id,
        nombreColonia: c.nombre,
        diasSinServicio: contarDiasSinServicio(c.id),
        ics: vc3.calcularIcs(historia(c.id)),
        poblacionEst: c.poblacionEst,
      })).sort((a, b) => b.diasSinServicio - a.diasSinServicio || a.ics - b.ics);
    },

    async disputas() {
      const salida = [];
      for (const colonia of COLONIAS) {
        for (let atras = 0; atras <= 7; atras += 1) {
          const f = new Date();
          f.setDate(f.getDate() - atras);
          const fecha = claveFecha(f);
          const reg = registros.get(llave(colonia.id, fecha));
          if (!reg || reg.estado !== "en_disputa") continue;
          salida.push({
            coloniaId: colonia.id,
            nombreColonia: colonia.nombre,
            fecha,
            senalDura: { tipo: reg.senalGps ? "gps" : "chofer", hora: reg.horaVerificada },
            senalCiudadana: {
              nConfirmanNo: reg.nConfirmanNo,
              primeraHora: reg.horaVerificada,
              ultimaHora: reg.horaVerificada,
            },
            escalada: escaladas.has(`${colonia.id}|${fecha}`),
          });
        }
      }
      return salida.sort((a, b) => b.fecha.localeCompare(a.fecha));
    },

    async escalarDisputa(coloniaId, fecha, usuarioId) {
      escaladas.add(`${coloniaId}|${fecha}`);
      anotar({ tipo: "disputa_escalada", coloniaId, fecha, usuarioId });
    },
  };
}

module.exports = { crearPasoMemoria, COLONIAS };
