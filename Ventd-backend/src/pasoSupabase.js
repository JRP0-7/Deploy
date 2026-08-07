// PASÓ · Los métodos de verificación contra Supabase.
//
// Se compone con el store base en `store.js`. Acá vive todo lo que toca el
// modelo de evidencia; la lógica de cómo se mueve un estado NO está acá, está
// en `vc3.js`, para que la implementación en memoria y ésta no puedan divergir.
//
// Dos cosas que este archivo hace y conviene no perder de vista:
//   · Los registros del día se crean en lote, no de a uno. Cuarenta colonias
//     con una consulta por colonia son cuarenta viajes a la base cada vez que
//     alguien abre el panel.
//   · Cada escritura deja su asiento en `bitacora_evidencia` ANTES de
//     responder, porque el número de asiento es parte del acuse que el vecino
//     ve en pantalla.

const vc3 = require("./vc3");
const {
  hoyFecha,
  diaIso,
  desdeClave,
  claveFecha,
  generarFolio,
  poligonoAproximado,
} = require("./formato");

const DIAS_HISTORIA = 35;

function mapColonia(c, cal) {
  const dias = (cal && cal.dias_programados) || [];
  return {
    id: c.id,
    nombre: c.nombre,
    distrito: c.distrito,
    poblacionEst: c.poblacion_est,
    frecuenciaContratada: dias.length,
    diasProgramados: dias,
    ventanaInicio: (cal && cal.ventana_inicio) || "06:00",
    ventanaFin: (cal && cal.ventana_fin) || "12:00",
    centro: [Number(c.lat), Number(c.lon)],
    poligono: poligonoAproximado([Number(c.lat), Number(c.lon)], Number(c.radio_km) || 0.9, 1000 + (c.orden || 0) * 97),
    aproximado: true,
  };
}

function mapRegistro(r) {
  return {
    coloniaId: r.colonia_id,
    fecha: r.fecha,
    programado: r.programado,
    estado: r.estado,
    nivelEvidencia: r.nivel_evidencia,
    confianza: Number(r.confianza),
    senalGps: r.senal_gps,
    senalChofer: r.senal_chofer,
    nConfirmanSi: r.n_confirman_si,
    nConfirmanNo: r.n_confirman_no,
    horaVerificada: r.hora_verificada,
  };
}

function aFilaRegistro(reg) {
  return {
    colonia_id: reg.coloniaId,
    fecha: reg.fecha,
    programado: reg.programado,
    estado: reg.estado,
    nivel_evidencia: reg.nivelEvidencia,
    confianza: reg.confianza,
    senal_gps: reg.senalGps,
    senal_chofer: reg.senalChofer,
    n_confirman_si: reg.nConfirmanSi,
    n_confirman_no: reg.nConfirmanNo,
    hora_verificada: reg.horaVerificada,
  };
}

function mapReporte(d) {
  return {
    id: d.id,
    folio: d.folio,
    coloniaId: d.colonia_id,
    tipo: d.tipo,
    descripcion: d.descripcion || undefined,
    fotoUrl: d.foto_url || undefined,
    estado: d.estado,
    severidad: d.severidad || undefined,
    creadoEn: d.creado_en,
    atendidoEn: d.atendido_en,
    resolucion: d.resolucion || undefined,
  };
}

function mapCamionPaso(c, evento) {
  return {
    id: c.id,
    placa: c.placa,
    estado: c.estado,
    choferNombre: c.conductor || undefined,
    coloniaActualId: c.colonia_actual_id || null,
    avanceRuta: c.avance_ruta == null ? undefined : Number(c.avance_ruta),
    ultimoEvento: evento,
  };
}

function crearPasoSupabase(sb) {
  // ── Bitácora ──────────────────────────────────────────────────────────────
  // Nada se edita ni se borra: cada cambio entra como una fila nueva y su
  // `seq` es el número de asiento que se devuelve en el acuse.

  async function anotar(entrada) {
    const { data, error } = await sb
      .from("bitacora_evidencia")
      .insert(entrada)
      .select("seq")
      .single();
    if (error) throw error;
    return data.seq;
  }

  async function ultimoAsiento(coloniaId, fecha) {
    const { data, error } = await sb
      .from("bitacora_evidencia")
      .select("seq")
      .eq("colonia_id", coloniaId)
      .eq("fecha", fecha)
      .order("seq", { ascending: false })
      .limit(1);
    if (error) throw error;
    return data && data.length ? data[0].seq : 0;
  }

  // ── Catálogo ──────────────────────────────────────────────────────────────

  async function catalogo() {
    const { data: cols, error: e1 } = await sb
      .from("colonias")
      .select("id, nombre, distrito, lat, lon, poblacion_est, radio_km, orden")
      .order("orden");
    if (e1) throw e1;
    const { data: cals, error: e2 } = await sb
      .from("calendario_recoleccion")
      .select("colonia_id, dias_programados, ventana_inicio, ventana_fin");
    if (e2) throw e2;
    const porId = new Map((cals || []).map((c) => [c.colonia_id, c]));
    return (cols || []).map((c) => mapColonia(c, porId.get(c.id)));
  }

  /**
   * Los registros de una fecha, creando los que falten.
   *
   * En lote a propósito: cuarenta colonias con una consulta cada una son
   * cuarenta viajes a la base cada vez que alguien abre el panel.
   */
  async function registrosDe(fecha, colonias) {
    const { data, error } = await sb.from("registros_servicio").select("*").eq("fecha", fecha);
    if (error) throw error;
    const existentes = new Map((data || []).map((r) => [r.colonia_id, mapRegistro(r)]));

    const dia = diaIso(desdeClave(fecha));
    const faltantes = colonias
      .filter((c) => !existentes.has(c.id))
      .map((c) => vc3.registroVacio(c.id, fecha, c.diasProgramados.includes(dia)));

    if (faltantes.length) {
      const { error: e2 } = await sb.from("registros_servicio").insert(faltantes.map(aFilaRegistro));
      if (e2) throw e2;
      faltantes.forEach((r) => existentes.set(r.coloniaId, r));
    }
    return colonias.map((c) => existentes.get(c.id));
  }

  async function registroDe(coloniaId, fecha, colonia) {
    const { data, error } = await sb
      .from("registros_servicio")
      .select("*")
      .eq("colonia_id", coloniaId)
      .eq("fecha", fecha)
      .maybeSingle();
    if (error) throw error;
    if (data) return mapRegistro(data);

    const programado = colonia.diasProgramados.includes(diaIso(desdeClave(fecha)));
    const nuevo = vc3.registroVacio(coloniaId, fecha, programado);
    const { error: e2 } = await sb.from("registros_servicio").insert(aFilaRegistro(nuevo));
    if (e2) throw e2;
    return nuevo;
  }

  async function guardarRegistro(reg) {
    const { error } = await sb
      .from("registros_servicio")
      .update(aFilaRegistro(reg))
      .eq("colonia_id", reg.coloniaId)
      .eq("fecha", reg.fecha);
    if (error) throw error;
  }

  /** Historia reciente de una colonia, para la tira semanal y el ranking. */
  async function historia(coloniaId, dias = DIAS_HISTORIA) {
    const desde = new Date();
    desde.setDate(desde.getDate() - dias);
    const { data, error } = await sb
      .from("registros_servicio")
      .select("*")
      .eq("colonia_id", coloniaId)
      .gte("fecha", claveFecha(desde))
      .order("fecha", { ascending: false });
    if (error) throw error;
    return (data || []).map(mapRegistro);
  }

  function contarDiasSinServicio(registros) {
    // Los registros vienen de la más reciente a la más vieja. Se cuenta hasta
    // encontrar una verificación real; si no hay ninguna, se devuelve la
    // ventana entera y la pantalla dice "más de N días" en vez de mentir.
    let dias = 0;
    for (const r of registros) {
      if (vc3.cuentaComoVerificado(r)) return dias;
      dias += 1;
    }
    return dias;
  }

  return {
    async salud() {
      const { error } = await sb.from("colonias").select("id").limit(1);
      return { ok: !error, version: "0.1.0", db: error ? "sin conexión" : "supabase" };
    },

    listarColonias: catalogo,

    async estadoHoy(coloniaId) {
      const colonias = await catalogo();
      const colonia = colonias.find((c) => c.id === coloniaId);
      if (!colonia) throw Object.assign(new Error("No encontramos esa colonia."), { status: 404 });

      const fecha = hoyFecha();
      const registro = await registroDe(coloniaId, fecha, colonia);
      const previos = await historia(coloniaId);
      const porFecha = new Map(previos.map((r) => [r.fecha, r]));

      // Tres días atrás, hoy y tres adelante: la semana se lee como historial
      // y como calendario a la vez. Lo que todavía no ocurrió va en `null`.
      const semana = [];
      for (let desplazamiento = -3; desplazamiento <= 3; desplazamiento += 1) {
        const f = new Date();
        f.setDate(f.getDate() + desplazamiento);
        const clave = claveFecha(f);
        const reg = clave === fecha ? registro : porFecha.get(clave);
        semana.push({
          fecha: clave,
          diaSemana: diaIso(f),
          programado: colonia.diasProgramados.includes(diaIso(f)),
          estado: desplazamiento > 0 ? null : (reg ? reg.estado : null),
          esHoy: desplazamiento === 0,
        });
      }

      let asiento = await ultimoAsiento(coloniaId, fecha);
      if (!asiento) {
        asiento = await anotar({
          tipo: "apertura_del_dia",
          colonia_id: coloniaId,
          fecha,
          detalle: registro.programado ? "Ciclo contratado para hoy" : "Sin ciclo contratado hoy",
        });
      }

      return {
        colonia,
        registro,
        asiento,
        semana,
        diasSinServicioVerificado: contarDiasSinServicio([registro, ...previos.filter((r) => r.fecha !== fecha)]),
      };
    },

    async confirmar(coloniaId, paso, { dispositivo, usuarioId }) {
      const colonias = await catalogo();
      const colonia = colonias.find((c) => c.id === coloniaId);
      if (!colonia) throw Object.assign(new Error("No encontramos esa colonia."), { status: 404 });

      const fecha = hoyFecha();
      const { error: eIns } = await sb.from("confirmaciones_servicio").insert({
        colonia_id: coloniaId,
        fecha,
        dispositivo,
        usuario_id: usuarioId || null,
        paso,
      });
      if (eIns) {
        if (eIns.code === "23505") {
          throw Object.assign(new Error("Ya habías respondido hoy en esta colonia."), { status: 409 });
        }
        throw eIns;
      }

      const previo = await registroDe(coloniaId, fecha, colonia);
      const actualizado = vc3.aplicarConfirmacion(previo, paso);
      await guardarRegistro(actualizado);

      const asiento = await anotar({
        tipo: paso ? "confirmacion_si" : "confirmacion_no",
        colonia_id: coloniaId,
        usuario_id: usuarioId || null,
        fecha,
        detalle: `Vecino respondió ${paso ? "que sí pasó" : "que no pasó"}`,
      });

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
      const colonias = await catalogo();
      const colonia = colonias.find((c) => c.id === coloniaId);
      if (!colonia) throw Object.assign(new Error("No encontramos esa colonia."), { status: 404 });

      const fecha = hoyFecha();
      const previo = await registroDe(coloniaId, fecha, colonia);
      const actualizado = vc3.aplicarMarcaChofer(previo, hecho);
      await guardarRegistro(actualizado);

      // La parada del día, si existe, queda marcada con lo mismo. Es la vista
      // que el conductor tiene de su recorrido.
      await sb
        .from("rutas")
        .update({
          completada: !!hecho,
          hora_fin: new Date().toTimeString().slice(0, 5),
          incidente: hecho ? null : "reportado_conductor",
          motivo: hecho ? null : motivo || null,
          foto_url: hecho ? null : fotoUrl || null,
        })
        .eq("camion_id", camionId)
        .eq("colonia_id", coloniaId)
        .eq("fecha", fecha);

      const asiento = await anotar({
        tipo: hecho ? "cuadrilla_paso" : "cuadrilla_no_pudo",
        colonia_id: coloniaId,
        camion_id: camionId,
        fecha,
        detalle: hecho ? "La cuadrilla marcó la parada como hecha" : `No se pudo: ${motivo || "sin motivo"}`,
      });

      // Una parada que no se pudo hacer entra además como queja en la bandeja
      // del panel. Si solo cambiara el estado, el supervisor vería NO PASÓ sin
      // saber por qué, y el chofer se habría tomado el trabajo de explicarlo
      // para nadie.
      if (!hecho && motivo) {
        await sb.from("denuncias").insert({
          folio: generarFolio(asiento * 23),
          colonia_id: coloniaId,
          tipo: "no_paso_camion",
          descripcion: `${motivo} — lo reportó la cuadrilla de ${camionId}.`,
          foto_url: fotoUrl || null,
          estado: "pendiente",
        });
      }

      return {
        folio: generarFolio(asiento * 23),
        asiento,
        estado: actualizado.estado,
        nivelEvidencia: actualizado.nivelEvidencia,
      };
    },

    /**
     * Un atraso NO es un reporte: no afirma nada sobre una colonia, afirma que
     * el camión va tarde. Por eso mueve `camiones.estado` y deja su asiento,
     * y por eso tampoco exige foto.
     */
    async reportarIncidente({ camionId, motivo, detalle }) {
      const { data: c, error: e0 } = await sb.from("camiones").select("id").eq("id", camionId).maybeSingle();
      if (e0) throw e0;
      if (!c) throw Object.assign(new Error("No encontramos ese camión."), { status: 404 });

      const texto = detalle && detalle.trim() ? `${motivo} · ${detalle.trim()}` : motivo;
      const { error } = await sb
        .from("camiones")
        .update({ estado: "con_incidente", nota: texto })
        .eq("id", camionId);
      if (error) throw error;

      await anotar({ tipo: "incidente", camion_id: camionId, fecha: hoyFecha(), detalle: texto });
    },

    // ── Quejas ────────────────────────────────────────────────────────────────

    async crearReporte({ coloniaId, tipo, descripcion, fotoUrl }, { dispositivo, usuarioId }) {
      const asiento = await anotar({
        tipo: "queja",
        colonia_id: coloniaId,
        usuario_id: usuarioId || null,
        fecha: hoyFecha(),
        detalle: tipo,
      });
      const folio = generarFolio(asiento * 17);
      const { data, error } = await sb
        .from("denuncias")
        .insert({
          folio,
          usuario_id: usuarioId || null,
          dispositivo,
          colonia_id: coloniaId,
          tipo,
          descripcion: descripcion || null,
          foto_url: fotoUrl || null,
          severidad: 3,
        })
        .select("*")
        .single();
      if (error) throw error;
      await sb.from("bitacora_evidencia").update({ folio }).eq("seq", asiento);
      return { folio, asiento, reporte: mapReporte(data) };
    },

    async listarReportesPaso(filtros) {
      let q = sb.from("denuncias").select("*").order("creado_en", { ascending: false });
      if (filtros && filtros.estado) q = q.eq("estado", filtros.estado);
      if (filtros && filtros.tipo) q = q.eq("tipo", filtros.tipo);
      if (filtros && filtros.coloniaId) q = q.eq("colonia_id", filtros.coloniaId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map(mapReporte);
    },

    async misReportes({ dispositivo, usuarioId }) {
      let q = sb.from("denuncias").select("*").order("creado_en", { ascending: false });
      q = usuarioId ? q.or(`dispositivo.eq.${dispositivo},usuario_id.eq.${usuarioId}`) : q.eq("dispositivo", dispositivo);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map(mapReporte);
    },

    async cambiarEstadoReporte(id, estado, resolucion) {
      const { data, error } = await sb
        .from("denuncias")
        .update({
          estado,
          resolucion: resolucion || null,
          atendido_en: estado === "pendiente" ? null : new Date().toISOString(),
        })
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw Object.assign(new Error("Ese reporte ya no está en la bandeja."), { status: 404 });
      // El cambio se anota, no sobrescribe: la bandeja puede reconstruirse.
      await anotar({ tipo: "queja_" + estado, colonia_id: data.colonia_id, fecha: hoyFecha(), folio: data.folio, detalle: resolucion || estado });
      return mapReporte(data);
    },

    // ── Flota ─────────────────────────────────────────────────────────────────

    async flotaPaso() {
      const { data, error } = await sb.from("camiones").select("*").order("id");
      if (error) throw error;
      const { data: eventos } = await sb
        .from("bitacora_evidencia")
        .select("camion_id, tipo, creado_en, detalle")
        .not("camion_id", "is", null)
        .order("seq", { ascending: false })
        .limit(200);
      const ultimo = new Map();
      for (const e of eventos || []) {
        if (!ultimo.has(e.camion_id)) {
          ultimo.set(e.camion_id, { tipo: e.tipo === "incidente" ? "incidente" : "llegada_zona", ts: e.creado_en, detalle: e.detalle });
        }
      }
      return (data || []).map((c) => mapCamionPaso(c, ultimo.get(c.id)));
    },

    async posiciones() {
      const { data, error } = await sb
        .from("posiciones_camion")
        .select("camion_id, lat, lng, velocidad, colonia_id, ts")
        .order("ts", { ascending: false })
        .limit(200);
      if (error) throw error;
      const vistos = new Set();
      const salida = [];
      for (const p of data || []) {
        if (vistos.has(p.camion_id)) continue;
        vistos.add(p.camion_id);
        salida.push({
          camionId: p.camion_id,
          lat: Number(p.lat),
          lng: Number(p.lng),
          ts: p.ts,
          velocidad: p.velocidad == null ? undefined : Number(p.velocidad),
          coloniaId: p.colonia_id,
        });
      }
      return salida;
    },

    // ── Cifras de la ciudad ───────────────────────────────────────────────────

    async cobertura() {
      const colonias = await catalogo();
      return registrosDe(hoyFecha(), colonias);
    },

    async resumenCiudad() {
      const colonias = await catalogo();
      const registros = await registrosDe(hoyFecha(), colonias);
      const resumen = { cumplido: 0, en_curso: 0, no_cumplido: 0, sin_verificar: 0, en_disputa: 0 };
      for (const r of registros) resumen[r.estado] += 1;
      return resumen;
    },

    async kpis() {
      const colonias = await catalogo();
      const hoy = await registrosDe(hoyFecha(), colonias);
      const verificados = hoy.filter(vc3.cuentaComoVerificado).length;
      const conSenal = hoy.filter((r) => r.nivelEvidencia > 0);

      const { count: activos } = await sb
        .from("denuncias")
        .select("id", { count: "exact", head: true })
        .in("estado", ["pendiente", "en_atencion"]);

      const desde = new Date();
      desde.setDate(desde.getDate() - 7);
      const { data: ultimos } = await sb
        .from("registros_servicio")
        .select("colonia_id, estado, nivel_evidencia")
        .gte("fecha", claveFecha(desde));
      const conVerificacion = new Set(
        (ultimos || []).filter((r) => r.estado === "cumplido" && r.nivel_evidencia >= 2).map((r) => r.colonia_id),
      );

      return {
        coberturaVerificada: hoy.length === 0 ? 0 : verificados / hoy.length,
        confianzaDelDia:
          conSenal.length === 0 ? 0 : conSenal.reduce((s, r) => s + r.confianza, 0) / conSenal.length,
        reportesActivos: activos || 0,
        coloniasSinServicio7d: colonias.filter((c) => !conVerificacion.has(c.id)).length,
      };
    },

    async ranking() {
      const colonias = await catalogo();
      const desde = new Date();
      desde.setDate(desde.getDate() - DIAS_HISTORIA);
      const { data, error } = await sb
        .from("registros_servicio")
        .select("*")
        .gte("fecha", claveFecha(desde))
        .order("fecha", { ascending: false });
      if (error) throw error;

      const porColonia = new Map();
      for (const fila of data || []) {
        const lista = porColonia.get(fila.colonia_id) || [];
        lista.push(mapRegistro(fila));
        porColonia.set(fila.colonia_id, lista);
      }

      return colonias
        .map((c) => {
          const registros = porColonia.get(c.id) || [];
          return {
            coloniaId: c.id,
            nombreColonia: c.nombre,
            diasSinServicio: contarDiasSinServicio(registros),
            ics: vc3.calcularIcs(registros),
            poblacionEst: c.poblacionEst,
          };
        })
        .sort((a, b) => b.diasSinServicio - a.diasSinServicio || a.ics - b.ics);
    },

    async disputas() {
      const colonias = await catalogo();
      const porId = new Map(colonias.map((c) => [c.id, c]));
      const desde = new Date();
      desde.setDate(desde.getDate() - 7);

      const { data, error } = await sb
        .from("registros_servicio")
        .select("*")
        .eq("estado", "en_disputa")
        .gte("fecha", claveFecha(desde))
        .order("fecha", { ascending: false });
      if (error) throw error;

      const { data: escaladas } = await sb.from("disputas_escaladas").select("colonia_id, fecha");
      const marcadas = new Set((escaladas || []).map((e) => `${e.colonia_id}|${e.fecha}`));

      const salida = [];
      for (const fila of data || []) {
        const colonia = porId.get(fila.colonia_id);
        if (!colonia) continue;
        const { data: votos } = await sb
          .from("confirmaciones_servicio")
          .select("creado_en")
          .eq("colonia_id", fila.colonia_id)
          .eq("fecha", fila.fecha)
          .eq("paso", false)
          .order("creado_en");
        const horas = (votos || []).map((v) => v.creado_en);
        salida.push({
          coloniaId: fila.colonia_id,
          nombreColonia: colonia.nombre,
          fecha: fila.fecha,
          senalDura: { tipo: fila.senal_gps ? "gps" : "chofer", hora: fila.hora_verificada },
          senalCiudadana: {
            nConfirmanNo: fila.n_confirman_no,
            primeraHora: horas[0] || fila.hora_verificada,
            ultimaHora: horas[horas.length - 1] || fila.hora_verificada,
          },
          escalada: marcadas.has(`${fila.colonia_id}|${fila.fecha}`),
        });
      }
      return salida;
    },

    /** Escalar marca la disputa; NO la resuelve. Nadie gana acá. */
    async escalarDisputa(coloniaId, fecha, usuarioId) {
      const { error } = await sb
        .from("disputas_escaladas")
        .upsert({ colonia_id: coloniaId, fecha, escalado_por: usuarioId || null });
      if (error) throw error;
      await anotar({ tipo: "disputa_escalada", colonia_id: coloniaId, fecha, usuario_id: usuarioId || null });
    },
  };
}

module.exports = { crearPasoSupabase, mapReporte, mapRegistro, mapColonia };
