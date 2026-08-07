// CleanCity SPS — guard de páginas admin
// Requiere token JWT valido con rol 'admin'. Si falta, redirige a login.html.
(function () {
  const token = getToken();
  const payload = token ? decodeJwt(token) : null;

  const expValido = !payload.exp || payload.exp > Date.now() / 1000;
  const esAdmin = payload && payload.rol === "admin" && expValido;

  if (!esAdmin) {
    localStorage.removeItem(SESSION_KEYS.rol);
    location.replace("login.html");
    return;
  }

  if (!localStorage.getItem(SESSION_KEYS.rol)) {
    localStorage.setItem(SESSION_KEYS.rol, payload.rol);
  }
  if (!localStorage.getItem(SESSION_KEYS.usuarioId)) {
    localStorage.setItem(SESSION_KEYS.usuarioId, payload.id || payload.sub || "");
  }
})();
