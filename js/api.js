// Cliente del backend Ventd. Cambiar API_BASE_URL cuando el backend
// esté desplegado (ej: https://ventd-backend.up.railway.app).
const API_BASE_URL = 'http://localhost:3000';

function decodificarJWT(token) {
  const partes = token.split('.');
  if (partes.length !== 3) return {};
  try {
    const payload = partes[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload));
  } catch (err) {
    return {};
  }
}

// Alias compatible con login.html
function decodeJwt(token) {
  return decodificarJWT(token);
}

async function apiFetch(path, opciones = {}) {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', ...(opciones.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const respuesta = await fetch(`${API_BASE_URL}${path}`, { ...opciones, headers });
  const cuerpo = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    throw new Error(cuerpo.error || `Error ${respuesta.status}`);
  }
  return cuerpo;
}

async function apiPost(path, body) {
  return apiFetch(path, { method: 'POST', body: JSON.stringify(body) });
}

// El backend no devuelve el objeto usuario en registro/login (solo id/token
// o token). Reconstruimos el usuario localmente: en registro, con lo que la
// persona puso en el formulario; en login, decodificando el JWT.
async function registrarUsuario({ telefono, password, coloniaId, correo }) {
  const resultado = await apiFetch('/api/auth/registro', {
    method: 'POST',
    body: JSON.stringify({ telefono, password, coloniaId , correo})
  });
  return { token: resultado.token, usuario: { id: resultado.id, rol: 'usuario', coloniaId } };
}

async function iniciarSesion({ id, password }) {
  const resultado = await apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ id, password })
  });
  const payload = decodificarJWT(resultado.token);
  return {
    token: resultado.token,
    usuario: { id: payload.id, rol: payload.rol, coloniaId: payload.coloniaId }
  };
}

function guardarSesion({ token, usuario }) {
  localStorage.setItem('token', token);
  localStorage.setItem('usuario', JSON.stringify(usuario));
}

function obtenerUsuario() {
  const crudo = localStorage.getItem('usuario');
  return crudo ? JSON.parse(crudo) : null;
}

function cerrarSesion() {
  localStorage.removeItem('token');
  localStorage.removeItem('usuario');
}

async function listarColonias() {
  return apiFetch('/api/colonias');
}

async function obtenerCalendario(coloniaId) {
  return apiFetch(`/api/calendario/${coloniaId}`);
}

async function crearDenuncia({ coloniaId, tipo, descripcion, fotoUrl }) {
  return apiFetch('/api/denuncias', {
    method: 'POST',
    body: JSON.stringify({ coloniaId, tipo, descripcion, fotoUrl })
  });
}

async function listarDenuncias() {
  return apiFetch('/api/denuncias');
}

async function confirmarDenuncia(id) {
  return apiFetch(`/api/denuncias/${id}/confirmar`, { method: 'POST' });
}

async function obtenerCamionEmpleado() {
  return apiFetch('/api/empleado/camion');
}

async function obtenerRutasHoyEmpleado() {
  return apiFetch('/api/empleado/rutas');
}

async function completarParadaEmpleado(rutaId) {
  return apiFetch(`/api/empleado/rutas/${rutaId}/completar`, { method: 'POST' });
}

async function reportarProblemaParadaEmpleado(rutaId, nota) {
  return apiFetch(`/api/empleado/rutas/${rutaId}/problema`, { method: 'POST', body: JSON.stringify({ nota }) });
}
