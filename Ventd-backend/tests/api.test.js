const { test, before, after } = require("node:test");
const assert = require("node:assert");
const app = require("../server");

let server, base;
let tokenVecino, tokenAdmin;
let denunciaId;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = "http://localhost:" + server.address().port;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function req(method, path, { body, token } = {}) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = "Bearer " + token;
  const res = await fetch(base + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

test("health", async () => {
  const { status, data } = await req("GET", "/api/health");
  assert.equal(status, 200);
  assert.equal(data.ok, true);
});

test("registro crea usuario CIU", async () => {
  const { status, data } = await req("POST", "/api/auth/registro", {
    body: { telefono: "99990001", password: "clave123", coloniaId: "col-rivera-hernandez" },
  });
  assert.equal(status, 201);
  assert.match(data.id, /^CIU-\d{5}$/);
  assert.ok(data.token);
  tokenVecino = data.token;
});

test("login admin demo", async () => {
  const { status, data } = await req("POST", "/api/auth/login", {
    body: { id: "VCN-00001", password: "admin123" },
  });
  assert.equal(status, 200);
  assert.ok(data.token);
  tokenAdmin = data.token;
});

test("login rechaza credenciales inválidas", async () => {
  const { status } = await req("POST", "/api/auth/login", {
    body: { id: "VCN-00001", password: "mala" },
  });
  assert.equal(status, 401);
});

test("colonias y calendario público", async () => {
  const colonias = await req("GET", "/api/colonias");
  assert.ok(Array.isArray(colonias.data) && colonias.data.length > 0);

  const cal = await req("GET", "/api/calendario/col-rivera-hernandez");
  assert.equal(cal.status, 200);
  assert.ok(Array.isArray(cal.data.diasProgramados));
});

test("denuncias requieren auth", async () => {
  const { status } = await req("GET", "/api/denuncias");
  assert.equal(status, 401);
});

test("flujo completo de denuncia", async () => {
  const creada = await req("POST", "/api/denuncias", {
    token: tokenVecino,
    body: { coloniaId: "col-rivera-hernandez", tipo: "basura_acumulada", descripcion: "Prueba" },
  });
  assert.equal(creada.status, 201);
  denunciaId = creada.data.id;

  const lista = await req("GET", "/api/denuncias", { token: tokenVecino });
  assert.equal(lista.status, 200);
  assert.ok(lista.data.some((d) => d.id === denunciaId));

  const confirmada = await req("POST", `/api/denuncias/${denunciaId}/confirmar`, { token: tokenVecino });
  assert.equal(confirmada.status, 200);
  assert.equal(confirmada.data.confirmacionesComunidad, 1);

  const duplicada = await req("POST", `/api/denuncias/${denunciaId}/confirmar`, { token: tokenVecino });
  assert.equal(duplicada.status, 409);
});

test("verificar-admin requiere rol admin", async () => {
  const negado = await req("PATCH", `/api/denuncias/${denunciaId}/verificar-admin`, { token: tokenVecino });
  assert.equal(negado.status, 403);

  const ok = await req("PATCH", `/api/denuncias/${denunciaId}/verificar-admin`, { token: tokenAdmin });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.verificadoAdmin, true);
});

test("camiones solo admin", async () => {
  const negado = await req("GET", "/api/camiones", { token: tokenVecino });
  assert.equal(negado.status, 403);

  const ok = await req("GET", "/api/camiones", { token: tokenAdmin });
  assert.equal(ok.status, 200);
  assert.ok(ok.data.length > 0);
});
