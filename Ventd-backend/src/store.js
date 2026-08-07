// Capa de datos: usa Supabase (service role) si hay credenciales,
// si no, cae a un store en memoria con datos demo.
//
// Los métodos del modelo de evidencia de PASÓ viven aparte —`pasoSupabase.js`
// y `pasoMemoria.js`— y se componen sobre el store base al final del archivo.
// Se separaron porque son otra cosa: acá está el CRUD de la operación
// (usuarios, camiones, paradas del día), allá está lo que decide si una
// colonia puede declararse cumplida.
const config = require("./config");
const { crearPasoSupabase } = require("./pasoSupabase");
const { crearPasoMemoria } = require("./pasoMemoria");
const { crearCuentasSupabase, crearCuentasMemoria } = require("./cuentas");

// El catálogo sale de `coloniasSps.js`, que es la misma fuente que siembra la
// base. Antes había seis colonias escritas acá a mano y el modo demo mostraba
// una ciudad distinta de la de producción.
const { SEMILLAS, VENTANA_INICIO, VENTANA_FIN } = require("./coloniasSps");

const COLONIAS_SEED = SEMILLAS.map((s) => ({
  id: s.id, nombre: s.nombre, distrito: s.distrito, lat: s.centro[0], lon: s.centro[1],
}));

// Seis camiones, los mismos que el histórico de la empresa numera CAM-001..006
// y que `idEnFlota()` del frontend traduce. Los dos últimos no tienen chofer
// asignado, que es un estado real de la operación.
const CAMIONES_SEED = [
  { id: "CAM-01", placa: "HAB 3100", estado: "activo", conductor: "José Cárcamo", conductorUsuarioId: "EMP-00001", horaInicio: "06:00", nota: "En ruta normal" },
  { id: "CAM-02", placa: "HAB 3137", estado: "activo", conductor: "Wilmer Paz", conductorUsuarioId: "EMP-00002", horaInicio: "06:00", nota: "En ruta normal" },
  { id: "CAM-03", placa: "HAB 3174", estado: "con_incidente", conductor: "Óscar Mejía", conductorUsuarioId: "EMP-00003", horaInicio: "06:00", nota: "Llanta ponchada" },
  { id: "CAM-04", placa: "HAB 3211", estado: "activo", conductor: "Selvin Amaya", conductorUsuarioId: "EMP-00004", horaInicio: "06:00", nota: "En ruta normal" },
  { id: "CAM-05", placa: "HAB 3248", estado: "activo", conductor: "Denis Zelaya", conductorUsuarioId: null, horaInicio: "06:00", nota: "En ruta normal" },
  { id: "CAM-06", placa: "HAB 3285", estado: "en_pausa", conductor: "Marvin Portillo", conductorUsuarioId: null, horaInicio: "06:00", nota: "Pausa programada" },
];

// Colonias que cubre cada camión (un camión puede tener varias paradas al día).
// El reparto por índice es el mismo que usa el seed de la base.
const CAMION_COLONIAS_SEED = (() => {
  const porCamion = Math.ceil(SEMILLAS.length / CAMIONES_SEED.length);
  const pares = [];
  CAMIONES_SEED.forEach((c, i) => {
    SEMILLAS.slice(i * porCamion, (i + 1) * porCamion).forEach((s) => {
      pares.push({ camionId: c.id, coloniaId: s.id });
    });
  });
  return pares;
})();

const EMPLEADOS_SEED = [
  { id: "EMP-00001", telefono: "101", password: "chofer123", coloniaId: null, rol: "empleado", creadoEn: new Date().toISOString() },
  { id: "EMP-00002", telefono: "102", password: "chofer123", coloniaId: null, rol: "empleado", creadoEn: new Date().toISOString() },
  { id: "EMP-00003", telefono: "103", password: "chofer123", coloniaId: null, rol: "empleado", creadoEn: new Date().toISOString() },
  { id: "EMP-00004", telefono: "104", password: "chofer123", coloniaId: null, rol: "empleado", creadoEn: new Date().toISOString() },
];

function hoyDiaIso() {
  const d = new Date().getDay(); // 0=Dom..6=Sáb
  return d === 0 ? 7 : d;
}

function hoyFecha() {
  return new Date().toISOString().slice(0, 10);
}

function siguienteId(existentes) {
  let max = 0;
  existentes.forEach((id) => {
    const m = /^CIU-(\d+)$/.exec(id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return "CIU-" + String(max + 1).padStart(5, "0");
}

function mapDenuncia(r) {
  return {
    id: r.id,
    usuarioId: r.usuario_id,
    coloniaId: r.colonia_id,
    coloniaNombre: r.colonias ? r.colonias.nombre : null,
    tipo: r.tipo,
    descripcion: r.descripcion,
    fotoUrl: r.foto_url,
    estado: r.estado,
    confirmacionesComunidad: r.confirmaciones_comunidad,
    verificadoAdmin: r.verificado_admin,
    verificadoAdminPor: r.verificado_admin_por,
    verificadoAdminEn: r.verificado_admin_en,
    creadoEn: r.creado_en,
  };
}

function mapCamion(c) {
  return {
    id: c.id, placa: c.placa, estado: c.estado, ruta: c.ruta,
    conductor: c.conductor, conductorUsuarioId: c.conductor_usuario_id,
    horaInicio: c.hora_inicio, nota: c.nota,
  };
}

function mapRuta(r) {
  return {
    id: r.id, camionId: r.camion_id, coloniaId: r.colonia_id,
    coloniaNombre: r.colonias ? r.colonias.nombre : null,
    fecha: r.fecha, horaInicio: r.hora_inicio, horaFin: r.hora_fin,
    completada: r.completada, incidente: r.incidente, nota: r.nota,
  };
}

// ------------------------- Store en memoria (demo) -------------------------
function crearMemoryStore() {
  const estado = {
    usuarios: [
      { id: "VCN-00001", telefono: "100", password: "admin123", coloniaId: null, rol: "admin", creadoEn: new Date().toISOString() },
      ...EMPLEADOS_SEED,
    ],
    colonias: COLONIAS_SEED,
    calendarios: new Map(
      SEMILLAS.map((s) => [
        s.id,
        { diasProgramados: s.dias, ventanaInicio: VENTANA_INICIO, ventanaFin: VENTANA_FIN },
      ]),
    ),
    camiones: CAMIONES_SEED,
    camionColonias: CAMION_COLONIAS_SEED,
    rutas: [],
    denuncias: [],
    confirmaciones: new Set(),
  };

  function generarRutasHoySiFaltan(camionId) {
    const fecha = hoyFecha();
    const yaExisten = estado.rutas.some((r) => r.camionId === camionId && r.fecha === fecha);
    if (yaExisten) return;
    const diaHoy = hoyDiaIso();
    const coloniasCamion = estado.camionColonias.filter((cc) => cc.camionId === camionId).map((cc) => cc.coloniaId);
    coloniasCamion.forEach((coloniaId) => {
      const cal = estado.calendarios.get(coloniaId);
      if (cal && cal.diasProgramados.includes(diaHoy)) {
        estado.rutas.push({
          id: "rt-" + camionId + "-" + coloniaId + "-" + fecha,
          camionId, coloniaId, fecha,
          horaInicio: cal.ventanaInicio, horaFin: null,
          completada: false, incidente: null, nota: null,
        });
      }
    });
  }

  const store = {
    esDemo: true,
    modo: "demo",

    async registro({ telefono, password, coloniaId }) {
      if (estado.usuarios.some((u) => u.telefono === telefono)) {
        throw Object.assign(new Error("El teléfono ya está registrado"), { status: 409 });
      }
      const id = siguienteId(estado.usuarios.map((u) => u.id));
      const usuario = { id, telefono, password, coloniaId: coloniaId || null, rol: "vecino", creadoEn: new Date().toISOString() };
      estado.usuarios.push(usuario);
      return { id };
    },

    async validarLogin({ id, password }) {
      const u = estado.usuarios.find((x) => x.id === id);
      if (!u || u.password !== password) {
        throw Object.assign(new Error("ID o contraseña inválidos"), { status: 401 });
      }
      return { id: u.id, rol: u.rol, coloniaId: u.coloniaId };
    },

    async buscarUsuario(id) {
      return estado.usuarios.find((u) => u.id === id) || null;
    },

    async listarColonias() {
      return estado.colonias.map((c) => ({ ...c }));
    },

    async obtenerCalendario(coloniaId) {
      const cal = estado.calendarios.get(coloniaId);
      return cal ? { ...cal } : null;
    },

    async listarDenuncias({ usuarioId, rol, usuarioColoniaId }) {
      let lista = estado.denuncias;
      if (usuarioId && rol !== "admin") lista = lista.filter((d) => d.usuarioId === usuarioId);
      else if (rol !== "admin" && usuarioColoniaId) lista = lista.filter((d) => d.usuarioId === usuarioId || d.coloniaId === usuarioColoniaId);
      return lista.map((d) => {
        const colonia = estado.colonias.find((c) => c.id === d.coloniaId);
        return { ...d, coloniaNombre: colonia ? colonia.nombre : null };
      });
    },

    async crearDenuncia({ usuarioId, coloniaId, tipo, descripcion, fotoUrl }) {
      if (!estado.colonias.some((c) => c.id === coloniaId)) {
        throw Object.assign(new Error("Colonia no válida"), { status: 400 });
      }
      const d = {
        id: "den-" + String(estado.denuncias.length + 1001),
        usuarioId, coloniaId, tipo, descripcion: descripcion || null, fotoUrl: fotoUrl || null,
        estado: "pendiente", confirmacionesComunidad: 0,
        verificadoAdmin: false, verificadoAdminPor: null, verificadoAdminEn: null,
        creadoEn: new Date().toISOString(),
      };
      estado.denuncias.push(d);
      return { id: d.id };
    },

    async confirmarDenuncia(denunciaId, usuarioId) {
      const d = estado.denuncias.find((x) => x.id === denunciaId);
      if (!d) throw Object.assign(new Error("Denuncia no encontrada"), { status: 404 });
      const clave = denunciaId + ":" + usuarioId;
      if (estado.confirmaciones.has(clave)) {
        throw Object.assign(new Error("Ya confirmaste esta denuncia"), { status: 409 });
      }
      estado.confirmaciones.add(clave);
      d.confirmacionesComunidad += 1;
      return { confirmacionesComunidad: d.confirmacionesComunidad };
    },

    async verificarAdmin(denunciaId, adminId) {
      const d = estado.denuncias.find((x) => x.id === denunciaId);
      if (!d) throw Object.assign(new Error("Denuncia no encontrada"), { status: 404 });
      d.verificadoAdmin = true;
      d.verificadoAdminPor = adminId;
      d.verificadoAdminEn = new Date().toISOString();
      return { verificadoAdmin: true };
    },

    async listarCamiones() {
      return estado.camiones.map((c) => ({ ...c }));
    },

    async asignarCamionAConductor(camionId, usuarioId) {
      const u = estado.usuarios.find((x) => x.id === usuarioId);
      if (!u) throw Object.assign(new Error("Usuario no encontrado"), { status: 404 });
      const c = estado.camiones.find((x) => x.id === camionId);
      if (!c) throw Object.assign(new Error("Camión no encontrado"), { status: 404 });
      c.conductorUsuarioId = usuarioId;
      c.conductor = u.telefono;
      return { ok: true };
    },

    async desasignarCamion(camionId) {
      const c = estado.camiones.find((x) => x.id === camionId);
      if (!c) throw Object.assign(new Error("Camión no encontrado"), { status: 404 });
      c.conductorUsuarioId = null;
      c.conductor = null;
      return { ok: true };
    },

    async asignarColoniasACamion(camionId, coloniaIds) {
      const c = estado.camiones.find((x) => x.id === camionId);
      if (!c) throw Object.assign(new Error("Camión no encontrado"), { status: 404 });
      for (const coloniaId of coloniaIds) {
        if (!estado.colonias.some((col) => col.id === coloniaId)) {
          throw Object.assign(new Error(`Colonia ${coloniaId} no existe`), { status: 400 });
        }
        const existe = estado.camionColonias.some((cc) => cc.camionId === camionId && cc.coloniaId === coloniaId);
        if (!existe) estado.camionColonias.push({ camionId, coloniaId });
      }
      return { ok: true, asignadas: coloniaIds.length };
    },

    async obtenerCamionPorConductor(usuarioId) {
      const c = estado.camiones.find((x) => x.conductorUsuarioId === usuarioId);
      return c ? { ...c } : null;
    },

    async obtenerRutasHoyPorConductor(usuarioId) {
      const c = estado.camiones.find((x) => x.conductorUsuarioId === usuarioId);
      if (!c) throw Object.assign(new Error("No tienes un camión asignado"), { status: 404 });
      generarRutasHoySiFaltan(c.id);
      const fecha = hoyFecha();
      return estado.rutas
        .filter((r) => r.camionId === c.id && r.fecha === fecha)
        .sort((a, b) => (a.horaInicio || "").localeCompare(b.horaInicio || ""))
        .map((r) => {
          const colonia = estado.colonias.find((x) => x.id === r.coloniaId);
          return { ...r, coloniaNombre: colonia ? colonia.nombre : null };
        });
    },

    async completarRuta(rutaId, usuarioId) {
      const c = estado.camiones.find((x) => x.conductorUsuarioId === usuarioId);
      if (!c) throw Object.assign(new Error("No tienes un camión asignado"), { status: 404 });
      const r = estado.rutas.find((x) => x.id === rutaId && x.camionId === c.id);
      if (!r) throw Object.assign(new Error("Parada no encontrada"), { status: 404 });
      r.completada = true;
      r.horaFin = new Date().toTimeString().slice(0, 5);
      return { id: r.id, completada: true, horaFin: r.horaFin };
    },

    async reportarProblemaRuta(rutaId, usuarioId, nota) {
      const c = estado.camiones.find((x) => x.conductorUsuarioId === usuarioId);
      if (!c) throw Object.assign(new Error("No tienes un camión asignado"), { status: 404 });
      const r = estado.rutas.find((x) => x.id === rutaId && x.camionId === c.id);
      if (!r) throw Object.assign(new Error("Parada no encontrada"), { status: 404 });
      r.incidente = "reportado_conductor";
      r.nota = nota;
      c.estado = "con_incidente";
      c.nota = nota;
      return { id: r.id, incidente: r.incidente, nota: r.nota };
    },
  };
  return Object.assign(
    store,
    crearPasoMemoria(estado),
    crearCuentasMemoria(estado, siguienteId),
  );
}

// ------------------------- Store Supabase (producción) -------------------------
function crearSupabaseStore() {
  const { createClient } = require("@supabase/supabase-js");
  const clave = config.SUPABASE_SERVICE_ROLE_KEY || config.SUPABASE_PUBLISHABLE_KEY;
  const sb = createClient(config.SUPABASE_URL, clave, { auth: { persistSession: false } });

  const store = {
    esDemo: false,
    modo: "supabase",

    async registro({ telefono, password, coloniaId, email }) {
      const { data: existentes } = await sb.from("usuarios").select("id").order("id", { ascending: false }).limit(50);
      const id = siguienteId((existentes || []).map((u) => u.id));
      const { error } = await sb.from("usuarios").insert({ id, telefono, password, colonia_id: coloniaId || null, email: email || null });
      if (error) {
        if (error.code === "23505") throw Object.assign(new Error("El teléfono ya está registrado"), { status: 409 });
        throw error;
      }
      return { id };
    },

    async validarLogin({ id, password }) {
      const { data, error } = await sb.from("usuarios").select("id, password, rol, colonia_id, email").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data || data.password !== password) {
        throw Object.assign(new Error("ID o contraseña inválidos"), { status: 401 });
      }
      return { id: data.id, rol: data.rol, coloniaId: data.colonia_id, email: data.email };
    },

    async buscarUsuario(id) {
      const { data, error } = await sb.from("usuarios").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },

    async listarColonias() {
      const { data, error } = await sb.from("colonias").select("id, nombre, distrito, lat, lon").order("nombre");
      if (error) throw error;
      return data || [];
    },

    async obtenerCalendario(coloniaId) {
      const { data, error } = await sb.from("calendario_recoleccion").select("*").eq("colonia_id", coloniaId).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return { diasProgramados: data.dias_programados, ventanaInicio: data.ventana_inicio, ventanaFin: data.ventana_fin };
    },

    async listarDenuncias({ usuarioId, rol, usuarioColoniaId }) {
      let query = sb.from("denuncias").select("*, colonias(nombre)").order("creado_en", { ascending: false });
      if (usuarioId && rol !== "admin") query = query.eq("usuario_id", usuarioId);
      else if (rol !== "admin" && usuarioColoniaId) query = query.or(`usuario_id.eq.${usuarioId},colonia_id.eq.${usuarioColoniaId}`);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map(mapDenuncia);
    },

    async crearDenuncia({ usuarioId, coloniaId, tipo, descripcion, fotoUrl }) {
      const { data, error } = await sb.from("denuncias").insert({
        usuario_id: usuarioId, colonia_id: coloniaId, tipo,
        descripcion: descripcion || null, foto_url: fotoUrl || null,
      }).select("id").single();
      if (error) throw error;
      return { id: data.id };
    },

    async confirmarDenuncia(denunciaId, usuarioId) {
      const { data: d, error: err0 } = await sb.from("denuncias").select("id").eq("id", denunciaId).maybeSingle();
      if (err0) throw err0;
      if (!d) throw Object.assign(new Error("Denuncia no encontrada"), { status: 404 });

      const { error: err1 } = await sb.from("denuncia_confirmaciones").insert({ denuncia_id: denunciaId, usuario_id: usuarioId });
      if (err1) {
        if (err1.code === "23505") throw Object.assign(new Error("Ya confirmaste esta denuncia"), { status: 409 });
        throw err1;
      }

      const { count, error: err2 } = await sb.from("denuncia_confirmaciones").select("id", { count: "exact" }).eq("denuncia_id", denunciaId);
      if (err2) throw err2;

      const { error: err3 } = await sb.from("denuncias")
        .update({ confirmaciones_comunidad: count }).eq("id", denunciaId);
      if (err3) throw err3;
      return { confirmacionesComunidad: count };
    },

    async verificarAdmin(denunciaId, adminId) {
      const { error } = await sb.from("denuncias")
        .update({ verificado_admin: true, verificado_admin_por: adminId, verificado_admin_en: new Date().toISOString() })
        .eq("id", denunciaId);
      if (error) throw error;
      return { verificadoAdmin: true };
    },

    async listarCamiones() {
      const { data, error } = await sb.from("camiones").select("*").order("id");
      if (error) throw error;
      return (data || []).map(mapCamion);
    },

    async asignarCamionAConductor(camionId, usuarioId) {
      const { data: u, error: errU } = await sb.from("usuarios").select("id, telefono").eq("id", usuarioId).maybeSingle();
      if (errU) throw errU;
      if (!u) throw Object.assign(new Error("Usuario no encontrado"), { status: 404 });
      const { data: c, error: errC } = await sb.from("camiones").select("id").eq("id", camionId).maybeSingle();
      if (errC) throw errC;
      if (!c) throw Object.assign(new Error("Camión no encontrado"), { status: 404 });
      const { error } = await sb.from("camiones").update({ conductor_usuario_id: usuarioId, conductor: u.telefono }).eq("id", camionId);
      if (error) throw error;
      return { ok: true };
    },

    async desasignarCamion(camionId) {
      const { error } = await sb.from("camiones").update({ conductor_usuario_id: null, conductor: null }).eq("id", camionId);
      if (error) throw error;
      return { ok: true };
    },

    async asignarColoniasACamion(camionId, coloniaIds) {
      const { data: c, error: errC } = await sb.from("camiones").select("id").eq("id", camionId).maybeSingle();
      if (errC) throw errC;
      if (!c) throw Object.assign(new Error("Camión no encontrado"), { status: 404 });
      for (const coloniaId of coloniaIds) {
        const { data: col, error: errCol } = await sb.from("colonias").select("id").eq("id", coloniaId).maybeSingle();
        if (errCol) throw errCol;
        if (!col) throw Object.assign(new Error(`Colonia ${coloniaId} no existe`), { status: 400 });
        const { data: existe, error: errEx } = await sb.from("camion_colonias").select("id").eq("camion_id", camionId).eq("colonia_id", coloniaId).maybeSingle();
        if (errEx) throw errEx;
        if (!existe) {
          const { error } = await sb.from("camion_colonias").insert({ camion_id: camionId, colonia_id: coloniaId });
          if (error) throw error;
        }
      }
      return { ok: true, asignadas: coloniaIds.length };
    },

    async obtenerCamionPorConductor(usuarioId) {
      const { data, error } = await sb.from("camiones").select("*").eq("conductor_usuario_id", usuarioId).maybeSingle();
      if (error) throw error;
      return data ? mapCamion(data) : null;
    },

    async obtenerRutasHoyPorConductor(usuarioId) {
      const { data: c, error: err0 } = await sb.from("camiones").select("id").eq("conductor_usuario_id", usuarioId).maybeSingle();
      if (err0) throw err0;
      if (!c) throw Object.assign(new Error("No tienes un camión asignado"), { status: 404 });

      const fecha = hoyFecha();
      const { data: existentes, error: err1 } = await sb.from("rutas")
        .select("*, colonias(nombre)").eq("camion_id", c.id).eq("fecha", fecha).order("hora_inicio");
      if (err1) throw err1;
      if (existentes && existentes.length) return existentes.map(mapRuta);

      const diaHoy = hoyDiaIso();
      const { data: coloniasCamion, error: err2 } = await sb.from("camion_colonias").select("colonia_id").eq("camion_id", c.id);
      if (err2) throw err2;

      const filas = [];
      for (const cc of coloniasCamion || []) {
        const { data: cal, error: errCal } = await sb.from("calendario_recoleccion")
          .select("dias_programados, ventana_inicio").eq("colonia_id", cc.colonia_id).maybeSingle();
        if (errCal) throw errCal;
        if (cal && cal.dias_programados.includes(diaHoy)) {
          filas.push({ camion_id: c.id, colonia_id: cc.colonia_id, fecha, hora_inicio: cal.ventana_inicio });
        }
      }
      if (!filas.length) return [];

      const { error: err3 } = await sb.from("rutas").insert(filas);
      if (err3) throw err3;

      const { data: creadas, error: err4 } = await sb.from("rutas")
        .select("*, colonias(nombre)").eq("camion_id", c.id).eq("fecha", fecha).order("hora_inicio");
      if (err4) throw err4;
      return (creadas || []).map(mapRuta);
    },

    async completarRuta(rutaId, usuarioId) {
      const { data: r, error: err0 } = await sb.from("rutas").select("id, camiones(conductor_usuario_id)").eq("id", rutaId).maybeSingle();
      if (err0) throw err0;
      if (!r || !r.camiones || r.camiones.conductor_usuario_id !== usuarioId) {
        throw Object.assign(new Error("Parada no encontrada"), { status: 404 });
      }
      const horaFin = new Date().toTimeString().slice(0, 5);
      const { error } = await sb.from("rutas").update({ completada: true, hora_fin: horaFin }).eq("id", rutaId);
      if (error) throw error;
      return { id: rutaId, completada: true, horaFin };
    },

    async reportarProblemaRuta(rutaId, usuarioId, nota) {
      const { data: r, error: err0 } = await sb.from("rutas").select("id, camion_id, camiones(conductor_usuario_id)").eq("id", rutaId).maybeSingle();
      if (err0) throw err0;
      if (!r || !r.camiones || r.camiones.conductor_usuario_id !== usuarioId) {
        throw Object.assign(new Error("Parada no encontrada"), { status: 404 });
      }
      const { error: errR } = await sb.from("rutas").update({ incidente: "reportado_conductor", nota }).eq("id", rutaId);
      if (errR) throw errR;
      const { error: errC } = await sb.from("camiones").update({ estado: "con_incidente", nota }).eq("id", r.camion_id);
      if (errC) throw errC;
      return { id: rutaId, incidente: "reportado_conductor", nota };
    },
  };
  return Object.assign(
    store,
    crearPasoSupabase(sb),
    crearCuentasSupabase(sb, siguienteId),
  );
}

let instancia = null;
function getStore() {
  if (instancia) return instancia;
  const claveSupabase = config.SUPABASE_SERVICE_ROLE_KEY || config.SUPABASE_PUBLISHABLE_KEY;
  if (config.SUPABASE_URL && claveSupabase) {
    instancia = crearSupabaseStore();
  } else {
    instancia = crearMemoryStore();
  }
  return instancia;
}

module.exports = { getStore };
