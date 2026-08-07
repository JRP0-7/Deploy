// Bloquea el acceso a la página si no hay sesión activa.
// Debe ser el primer <script> del <head>, antes de que se pinte contenido.
(function () {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '../login.html';
  }
})();
