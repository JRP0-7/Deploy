// CleanCity SPS — guard de páginas empleado (conductor)
// Requiere token JWT válido con rol 'empleado'. Si falta, redirige a login.html.
(function () {
  const token = localStorage.getItem('token');
  const payload = token ? decodeJwt(token) : null;
  const expValido = !payload || !payload.exp || payload.exp > Date.now() / 1000;
  const esEmpleado = payload && payload.rol === 'empleado' && expValido;

  if (!esEmpleado) {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    location.replace('login.html');
  }
})();
