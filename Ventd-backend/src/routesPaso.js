// PASÓ · Los endpoints del modelo de evidencia.
//
// Contrato con el frontend (`src/api/client.ts`): camelCase hacia afuera
// aunque la base use snake_case, y errores siempre como `{error, detalle?}`
// con el código HTTP correcto. Nunca un 200 con un error adentro.
//
// ⚠️ Estos endpoints NO piden token, y es a propósito: el contrato del
// frontend prohíbe `localStorage`, `sessionStorage` y cookies, así que una
// recarga cierra la sesión y no hay dónde guardar una credencial entre
// pantallas. La identidad que se usa para antifraude es el hash del
// dispositivo. Está declarado acá y en el esquema en vez de disimulado: el día
// que haya sesión persistente, se cambia `identificar()` y nada más.

const crypto = require("crypto");
const { Router } = require("express");
const { getStore } = require("./store");

const router = Router();

const TIPOS_REPORTE = ["basura_acumulada", "no_paso_camion", "botadero_ilegal"];
const ESTADOS_REPORTE = ["pendiente", "en_atencion", "resuelto", "descartado"];
const MOTIVOS = ["acceso_bloqueado", "tiempo_insuficiente", "retraso_por_lluvia", "falla_mecanica"];

/**
 * El hash de dispositivo. IP más User-Agent, cortado a 32 caracteres.
 *
 * No identifica a una persona y no pretende hacerlo: evita que el mismo
 * teléfono confirme diez veces la misma colonia el mismo día. Dos vecinos tras
 * el mismo NAT con el mismo navegador cuentan como uno, que es el costo
 * conocido de no tener sesión persistente.
 */
function identificar(req) {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "sin-ip";
  const ua = req.headers["user-agent"] || "sin-ua";
  const dispositivo = crypto.createHash("sha256").update(`${ip}|${ua}`).digest("hex").slice(0, 32);
  // Si el frontend manda la identidad del vecino que tiene en memoria, se
  // anota además de la del dispositivo. Es un dato, no una credencial.
  const usuarioId = req.get("X-Vecino") || null;
  return { dispositivo, usuarioId };
}

function malaPeticion(res, mensaje) {
  return res.status(400).json({ error: mensaje });
}

// ── Diagnóstico ──────────────────────────────────────────────────────────────

router.get("/salud", async (req, res, next) => {
  try {
    res.json(await getStore().salud());
  } catch (e) { next(e); }
});

// ── Catálogo y estado ────────────────────────────────────────────────────────

router.get("/colonias", async (req, res, next) => {
  try {
    res.json(await getStore().listarColonias());
  } catch (e) { next(e); }
});

router.get("/estado/:coloniaId", async (req, res, next) => {
  try {
    res.json(await getStore().estadoHoy(req.params.coloniaId));
  } catch (e) { next(e); }
});

/**
 * La respuesta del vecino. Las dos pesan lo mismo: `paso` es un booleano y no
 * un endpoint distinto por cada lado, porque decir que no pasó tiene que
 * costar exactamente lo mismo que decir que sí.
 */
router.post("/confirmar", async (req, res, next) => {
  try {
    const { coloniaId, paso } = req.body || {};
    if (!coloniaId) return malaPeticion(res, "Falta la colonia.");
    if (typeof paso !== "boolean") return malaPeticion(res, "Falta la respuesta.");
    res.json(await getStore().confirmar(coloniaId, paso, identificar(req)));
  } catch (e) { next(e); }
});

// ── La cuadrilla ─────────────────────────────────────────────────────────────

/**
 * La marca del chofer. Tiene endpoint propio y NO pasa por `/confirmar`:
 * es una señal dura, como el GPS, y sumarla al contador de vecinos inflaría la
 * evidencia ciudadana con un dato de la empresa.
 *
 * La foto se exige solo cuando la marca deja a una colonia en NO PASÓ, que es
 * donde la marca se vuelve una afirmación sobre un barrio.
 */
router.post("/cuadrilla/marcar", async (req, res, next) => {
  try {
    const { camionId, coloniaId, hecho, motivo, fotoUrl } = req.body || {};
    if (!camionId) return malaPeticion(res, "Falta el camión.");
    if (!coloniaId) return malaPeticion(res, "Falta la colonia.");
    if (typeof hecho !== "boolean") return malaPeticion(res, "Falta decir si la parada se hizo.");
    if (!hecho) {
      if (!MOTIVOS.includes(motivo)) return malaPeticion(res, "Elegí por qué no se pudo.");
      if (!fotoUrl) return malaPeticion(res, "Una parada que no se pudo hacer necesita una foto.");
    }
    res.json(await getStore().marcarParada({ camionId, coloniaId, hecho, motivo, fotoUrl }));
  } catch (e) { next(e); }
});

/**
 * El aviso de atraso. No exige foto: no acusa a nadie, no cambia el registro
 * de ninguna colonia y el GPS lo corrobora solo.
 */
router.post("/cuadrilla/incidente", async (req, res, next) => {
  try {
    const { camionId, motivo, detalle } = req.body || {};
    if (!camionId) return malaPeticion(res, "Falta el camión.");
    if (!MOTIVOS.includes(motivo)) return malaPeticion(res, "Elegí el motivo del atraso.");
    await getStore().reportarIncidente({ camionId, motivo, detalle });
    res.status(204).end();
  } catch (e) { next(e); }
});

// ── Quejas ───────────────────────────────────────────────────────────────────

/**
 * Poner una queja exige comentario Y foto: es la misma regla que "el silencio
 * nunca es cumplimiento". Una queja sin evidencia es casi silencio y no
 * sostiene nada frente a la empresa.
 */
router.post("/reportes", async (req, res, next) => {
  try {
    const { coloniaId, tipo, descripcion, fotoUrl } = req.body || {};
    if (!coloniaId) return malaPeticion(res, "Falta la colonia.");
    if (!TIPOS_REPORTE.includes(tipo)) return malaPeticion(res, "Elegí de qué se trata.");
    if (!descripcion || !String(descripcion).trim()) return malaPeticion(res, "Contanos qué viste.");
    if (!fotoUrl) return malaPeticion(res, "Una queja necesita una foto.");
    const acuse = await getStore().crearReporte(
      { coloniaId, tipo, descripcion: String(descripcion).trim(), fotoUrl },
      identificar(req),
    );
    res.status(201).json(acuse);
  } catch (e) { next(e); }
});

router.get("/reportes/mios", async (req, res, next) => {
  try {
    res.json(await getStore().misReportes(identificar(req)));
  } catch (e) { next(e); }
});

router.get("/reportes", async (req, res, next) => {
  try {
    res.json(await getStore().listarReportesPaso({
      estado: req.query.estado,
      tipo: req.query.tipo,
      coloniaId: req.query.colonia,
    }));
  } catch (e) { next(e); }
});

router.patch("/reportes/:id", async (req, res, next) => {
  try {
    const { estado, resolucion } = req.body || {};
    if (!ESTADOS_REPORTE.includes(estado)) return malaPeticion(res, "Ese estado no existe.");
    res.json(await getStore().cambiarEstadoReporte(req.params.id, estado, resolucion));
  } catch (e) { next(e); }
});

// ── Flota y cifras ───────────────────────────────────────────────────────────

router.get("/flota/posiciones", async (req, res, next) => {
  try {
    res.json(await getStore().posiciones());
  } catch (e) { next(e); }
});

router.get("/flota", async (req, res, next) => {
  try {
    res.json(await getStore().flotaPaso());
  } catch (e) { next(e); }
});

router.get("/cobertura/resumen", async (req, res, next) => {
  try {
    res.json(await getStore().resumenCiudad());
  } catch (e) { next(e); }
});

router.get("/cobertura", async (req, res, next) => {
  try {
    res.json(await getStore().cobertura());
  } catch (e) { next(e); }
});

router.get("/kpis/ranking", async (req, res, next) => {
  try {
    res.json(await getStore().ranking());
  } catch (e) { next(e); }
});

router.get("/kpis", async (req, res, next) => {
  try {
    res.json(await getStore().kpis());
  } catch (e) { next(e); }
});

// ── Disputas ─────────────────────────────────────────────────────────────────

router.get("/disputas", async (req, res, next) => {
  try {
    res.json(await getStore().disputas());
  } catch (e) { next(e); }
});

/** Escalar MARCA la disputa. No la resuelve: acá nadie elige quién tiene razón. */
router.post("/disputas/escalar", async (req, res, next) => {
  try {
    const { coloniaId, fecha } = req.body || {};
    if (!coloniaId || !fecha) return malaPeticion(res, "Falta la colonia o la fecha.");
    await getStore().escalarDisputa(coloniaId, fecha, identificar(req).usuarioId);
    res.status(204).end();
  } catch (e) { next(e); }
});

// ── Cuenta del vecino ────────────────────────────────────────────────────────
//
// La sesión la sostiene el frontend en memoria; una recarga la cierra. Acá no
// se emite token ni cookie porque no habría dónde guardarlo.

router.post("/vecinos", async (req, res, next) => {
  try {
    res.status(201).json(await getStore().registrarVecino(req.body || {}));
  } catch (e) { next(e); }
});

router.post("/sesion", async (req, res, next) => {
  try {
    const { identidad, contrasena } = req.body || {};
    if (!identidad || !contrasena) return malaPeticion(res, "Faltan la identidad o la contraseña.");
    res.json(await getStore().iniciarSesionVecino({ identidad, contrasena }));
  } catch (e) { next(e); }
});

router.delete("/sesion", (req, res) => {
  // Nada que invalidar del lado del servidor: la sesión vive en la memoria del
  // navegador. Se responde 204 para que el frontend cierre la suya.
  res.status(204).end();
});

module.exports = router;
