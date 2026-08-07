require("dotenv").config();
const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const config = require("./src/config");
const routesPaso = require("./src/routesPaso");
const routes = require("./src/routes");
const { getStore } = require("./src/store");

const app = express();
app.use(cors());
// Las fotos viajan como data URL de JPEG ya reducida en el cliente. El límite
// por defecto de Express (100 kb) rechaza incluso una foto comprimida.
app.use(express.json({ limit: "8mb" }));

// PASÓ va primero: comparte la ruta `/api/colonias` con el router de la
// operación y su versión —con centro, polígono y días contratados— es la que
// el frontend consume. El de abajo mantiene lo que no se solapa: cuentas de
// admin y conductor, el calendario y las paradas del día.
app.use("/api", routesPaso);
app.use("/api", routes);

/**
 * El manejador de errores de la API, a nivel de aplicación.
 *
 * Tiene que estar acá y no dentro de un router: cuando hay un error en vuelo,
 * Express saltea todo el middleware normal y nunca entra a los routers de
 * abajo, así que un manejador declarado adentro de uno de ellos no se alcanza.
 *
 * El contrato es `{error, detalle?}` con el código correcto. Nunca un 200 con
 * un error adentro, y nunca un código de Postgres en el mensaje: eso va al
 * log del servidor, no a la pantalla de un vecino.
 */
app.use("/api", (err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err && err.status) return res.status(err.status).json({ error: err.message });
  console.error(`[api] ${req.method} ${req.originalUrl}`, err && (err.message || err));
  if (err && err.code) console.error("       código:", err.code, "·", err.details || "");
  res.status(500).json({ error: "El sistema no está respondiendo. Volvé a intentar en un minuto." });
});

// ── El frontend ──────────────────────────────────────────────────────────────
// Se sirve el BUILD (`Ventd-frontend/dist`), no el código fuente: es una SPA de
// Vite y sin compilar no hay nada que un navegador pueda leer. Mientras no
// exista el build, el servidor lo dice con el comando exacto en vez de
// responder 404 sin explicación.

const FRONTEND_DIR = process.env.FRONTEND_DIR || path.resolve(__dirname, "../Ventd-frontend/dist");
const HAY_BUILD = fs.existsSync(path.join(FRONTEND_DIR, "index.html"));

if (HAY_BUILD) {
  app.use(express.static(FRONTEND_DIR));
  // React Router resuelve las rutas del lado del cliente: cualquier camino que
  // no sea `/api` ni un archivo del build tiene que devolver el index, o
  // recargar en `/transparencia` da 404.
  app.get(/^\/(?!api\/).*/, (req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, "index.html"));
  });
} else {
  app.get("/", (req, res) => {
    res
      .status(503)
      .type("text/plain")
      .send(
        "El frontend todavía no está compilado.\n\n" +
          "  cd Ventd-frontend\n" +
          "  npm install\n" +
          "  npm run build\n\n" +
          "Para desarrollo con recarga en caliente: npm run dev (Vite en el 5173).\n",
      );
  });
}

if (require.main === module) {
  app.listen(config.PORT, () => {
    const store = getStore();
    console.log(`Ventd-backend escuchando en http://localhost:${config.PORT}`);
    console.log(`Modo de datos: ${store.modo}`);
    if (HAY_BUILD) {
      console.log(`Frontend servido desde: ${FRONTEND_DIR}`);
    } else {
      console.warn(`Aviso: no hay build del frontend en ${FRONTEND_DIR}. Corré "npm run build" en Ventd-frontend.`);
    }
    if (store.esDemo) {
      console.log("  Modo demo: los datos viven en memoria y se pierden al reiniciar.");
      console.log("  Admin: VCN-00001 / admin123 · Conductores: EMP-00001..4 / chofer123");
    }
  });
}

module.exports = app;
