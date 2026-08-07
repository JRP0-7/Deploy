const { Router } = require("express");
const jwt = require("jsonwebtoken");
const config = require("./config");
const { getStore } = require("./store");

const router = Router();
const TIPOS = ["basura_acumulada", "no_paso_camion", "botadero_ilegal"];

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Se requiere autenticación" });
  try {
    req.usuario = jwt.verify(token, config.JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: "Token inválido o expirado" });
  }
}

function requireAdmin(req, res, next) {
  if (req.usuario.rol !== "admin") {
    return res.status(403).json({ error: "Requiere rol admin" });
  }
  next();
}

function requireEmpleado(req, res, next) {
  if (req.usuario.rol !== "empleado") {
    return res.status(403).json({ error: "Requiere rol empleado" });
  }
  next();
}

// ------------------------------- Auth -------------------------------
router.post("/auth/registro", async (req, res, next) => {
  try {
    const { telefono, password, coloniaId, correo } = req.body || {};
    if (!telefono || !/^\d{8,15}$/.test(String(telefono))) {
      return res.status(400).json({ error: "Teléfono inválido (8-15 dígitos)" });
    }
    if (!password || String(password).length < 4) {
      return res.status(400).json({ error: "Contraseña debe tener al menos 4 caracteres" });
    }
    const { id } = await getStore().registro({ telefono: String(telefono), password: String(password), coloniaId, email: correo});
    const token = jwt.sign({ id, rol: "vecino" }, config.JWT_SECRET, { expiresIn: "24h" });
    res.status(201).json({ id, token });
  } catch (e) { next(e); }
});

router.post("/auth/login", async (req, res, next) => {
  try {
    const { id, password } = req.body || {};
    if (!id || !password) return res.status(400).json({ error: "ID y contraseña requeridos" });
    const usuario = await getStore().validarLogin({ id: String(id), password: String(password) });
    const token = jwt.sign({ id: usuario.id, rol: usuario.rol, coloniaId: usuario.coloniaId }, config.JWT_SECRET, { expiresIn: "24h" });
    res.json({ token });
  } catch (e) { next(e); }
});

// ------------------------------ Colonias ------------------------------
router.get("/colonias", async (req, res, next) => {
  try {
    res.json(await getStore().listarColonias());
  } catch (e) { next(e); }
});

router.get("/calendario/:coloniaId", async (req, res, next) => {
  try {
    const cal = await getStore().obtenerCalendario(req.params.coloniaId);
    if (!cal) return res.status(404).json({ error: "Calendario no encontrado para esa colonia" });
    res.json(cal);
  } catch (e) { next(e); }
});

// ------------------------------ Denuncias ------------------------------
router.post("/denuncias", requireAuth, async (req, res, next) => {
  try {
    const { coloniaId, tipo, descripcion, fotoUrl } = req.body || {};
    if (!coloniaId) return res.status(400).json({ error: "coloniaId requerido" });
    if (!TIPOS.includes(tipo)) return res.status(400).json({ error: "tipo inválido" });
    const { id } = await getStore().crearDenuncia({
      usuarioId: req.usuario.id, coloniaId, tipo, descripcion, fotoUrl,
    });
    res.status(201).json({ id });
  } catch (e) { next(e); }
});

router.get("/denuncias", requireAuth, async (req, res, next) => {
  try {
    const usuario = await getStore().buscarUsuario(req.usuario.id);
    const denuncias = await getStore().listarDenuncias({
      usuarioId: req.query.usuarioId || undefined,
      rol: req.usuario.rol,
      usuarioColoniaId: usuario ? usuario.colonia_id || usuario.coloniaId : null,
    });
    res.json(denuncias);
  } catch (e) { next(e); }
});

router.post("/denuncias/:id/confirmar", requireAuth, async (req, res, next) => {
  try {
    const result = await getStore().confirmarDenuncia(req.params.id, req.usuario.id);
    res.json(result);
  } catch (e) { next(e); }
});

router.patch("/denuncias/:id/verificar-admin", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const result = await getStore().verificarAdmin(req.params.id, req.usuario.id);
    res.json(result);
  } catch (e) { next(e); }
});

// ------------------------------ Camiones ------------------------------
router.get("/camiones", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    res.json(await getStore().listarCamiones());
  } catch (e) { next(e); }
});

router.patch("/camiones/:id/asignar-conductor", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { usuarioId } = req.body || {};
    if (!usuarioId) return res.status(400).json({ error: "usuarioId requerido" });
    res.json(await getStore().asignarCamionAConductor(req.params.id, usuarioId));
  } catch (e) { next(e); }
});

router.patch("/camiones/:id/desasignar-conductor", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    res.json(await getStore().desasignarCamion(req.params.id));
  } catch (e) { next(e); }
});

router.patch("/camiones/:id/asignar-colonias", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { coloniaIds } = req.body || {};
    if (!Array.isArray(coloniaIds) || !coloniaIds.length) return res.status(400).json({ error: "coloniaIds[] requerido" });
    res.json(await getStore().asignarColoniasACamion(req.params.id, coloniaIds));
  } catch (e) { next(e); }
});

// ------------------------------ Empleado (conductor) ------------------------------
router.get("/empleado/camion", requireAuth, requireEmpleado, async (req, res, next) => {
  try {
    const camion = await getStore().obtenerCamionPorConductor(req.usuario.id);
    if (!camion) return res.status(404).json({ error: "No tienes un camión asignado" });
    res.json(camion);
  } catch (e) { next(e); }
});

router.get("/empleado/rutas", requireAuth, requireEmpleado, async (req, res, next) => {
  try {
    res.json(await getStore().obtenerRutasHoyPorConductor(req.usuario.id));
  } catch (e) { next(e); }
});

router.post("/empleado/rutas/:id/completar", requireAuth, requireEmpleado, async (req, res, next) => {
  try {
    res.json(await getStore().completarRuta(req.params.id, req.usuario.id));
  } catch (e) { next(e); }
});

router.post("/empleado/rutas/:id/problema", requireAuth, requireEmpleado, async (req, res, next) => {
  try {
    const { nota } = req.body || {};
    if (!nota || !String(nota).trim()) return res.status(400).json({ error: "Describe el problema" });
    res.json(await getStore().reportarProblemaRuta(req.params.id, req.usuario.id, String(nota).trim()));
  } catch (e) { next(e); }
});

router.get("/health", (req, res) => {
  res.json({ ok: true, modo: getStore().modo });
});

// Manejo central de errores
router.use((err, req, res, next) => {
  if (err && err.status) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: "Error interno del servidor" });
});

module.exports = router;
