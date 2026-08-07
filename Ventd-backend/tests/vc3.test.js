// Las reglas del modelo de evidencia, probadas donde viven: en la función
// pura. Acá no hay servidor ni base, así que un fallo señala la regla y no la
// infraestructura.

const test = require("node:test");
const assert = require("node:assert/strict");
const vc3 = require("../src/vc3");

const enBlanco = () => vc3.registroVacio("col-x", "2026-08-07", true);

// ── El silencio nunca es cumplimiento ────────────────────────────────────────

test("un registro sin señales es sin_verificar, nunca cumplido", () => {
  const r = enBlanco();
  assert.equal(r.estado, "sin_verificar");
  assert.equal(r.nivelEvidencia, 0);
  assert.equal(r.confianza, 0);
});

test("una sola confirmación no alcanza para declarar cumplimiento", () => {
  const r = vc3.aplicarConfirmacion(enBlanco(), true);
  assert.equal(r.estado, "sin_verificar");
  assert.equal(r.nConfirmanSi, 1);
  assert.equal(r.horaVerificada, null);
});

test("dos confirmaciones tampoco alcanzan", () => {
  let r = vc3.aplicarConfirmacion(enBlanco(), true);
  r = vc3.aplicarConfirmacion(r, true);
  assert.equal(r.estado, "sin_verificar");
});

test("tres vecinos que dicen que sí dan cumplido, pero solo con NE-1", () => {
  let r = enBlanco();
  for (let i = 0; i < 3; i += 1) r = vc3.aplicarConfirmacion(r, true);
  assert.equal(r.estado, "cumplido");
  assert.equal(r.nivelEvidencia, 1);
  // NE-1 no cuenta como verificado: hace falta una segunda fuente.
  assert.equal(vc3.cuentaComoVerificado(r), false);
});

test("quince vecinos siguen siendo UNA fuente", () => {
  let r = enBlanco();
  for (let i = 0; i < 15; i += 1) r = vc3.aplicarConfirmacion(r, true);
  assert.equal(r.nivelEvidencia, 1);
  assert.equal(vc3.cuentaComoVerificado(r), false);
});

test("tres vecinos que dicen que no dan no_cumplido", () => {
  let r = enBlanco();
  for (let i = 0; i < 3; i += 1) r = vc3.aplicarConfirmacion(r, false);
  assert.equal(r.estado, "no_cumplido");
  assert.equal(r.nConfirmanNo, 3);
});

// ── en_disputa es un estado real ─────────────────────────────────────────────

test("señal dura contra tres vecinos que niegan da en_disputa, no un ganador", () => {
  let r = vc3.aplicarMarcaChofer(enBlanco(), true); // la cuadrilla dice que pasó
  assert.equal(r.estado, "cumplido");
  for (let i = 0; i < 3; i += 1) r = vc3.aplicarConfirmacion(r, false);
  assert.equal(r.estado, "en_disputa");
  // Las dos versiones quedan anotadas. Ninguna se borra.
  assert.equal(r.senalChofer, true);
  assert.equal(r.nConfirmanNo, 3);
});

test("la cuadrilla marcando sobre un barrio que ya negó también da en_disputa", () => {
  let r = enBlanco();
  for (let i = 0; i < 3; i += 1) r = vc3.aplicarConfirmacion(r, false);
  const conMarca = vc3.aplicarMarcaChofer(r, true);
  assert.equal(conMarca.estado, "en_disputa");
});

test("si los que dicen que sí empatan a los que dicen que no, no hay disputa", () => {
  let r = vc3.aplicarMarcaChofer(enBlanco(), true);
  for (let i = 0; i < 3; i += 1) r = vc3.aplicarConfirmacion(r, false);
  assert.equal(r.estado, "en_disputa");
  for (let i = 0; i < 3; i += 1) r = vc3.aplicarConfirmacion(r, true);
  // 3 sí contra 3 no: los que niegan ya no son mayoría, así que la señal dura
  // vuelve a sostener el cumplimiento.
  assert.equal(r.estado, "cumplido");
});

// ── La cuadrilla admitiendo que no pasó ──────────────────────────────────────

test("cuando la empresa declara que no pasó, no hay nada que disputar", () => {
  let r = enBlanco();
  for (let i = 0; i < 4; i += 1) r = vc3.aplicarConfirmacion(r, true); // vecinos dicen que sí
  const conMarca = vc3.aplicarMarcaChofer(r, false);
  // La cuadrilla va en contra de su propio interés: es la señal más confiable.
  assert.equal(conMarca.estado, "no_cumplido");
});

// ── El nivel de evidencia cuenta fuentes ─────────────────────────────────────

test("NE cuenta fuentes distintas, no marcas acumuladas", () => {
  assert.equal(vc3.nivelEvidencia({ senalGps: false, senalChofer: false, nConfirmanSi: 0, nConfirmanNo: 0 }), 0);
  assert.equal(vc3.nivelEvidencia({ senalGps: true, senalChofer: false, nConfirmanSi: 0, nConfirmanNo: 0 }), 1);
  assert.equal(vc3.nivelEvidencia({ senalGps: true, senalChofer: true, nConfirmanSi: 0, nConfirmanNo: 0 }), 2);
  assert.equal(vc3.nivelEvidencia({ senalGps: true, senalChofer: true, nConfirmanSi: 3, nConfirmanNo: 0 }), 3);
  // Los vecinos cuentan como fuente hacia cualquier lado.
  assert.equal(vc3.nivelEvidencia({ senalGps: true, senalChofer: true, nConfirmanSi: 0, nConfirmanNo: 3 }), 3);
  // Y dos vecinos todavía no forman una fuente.
  assert.equal(vc3.nivelEvidencia({ senalGps: true, senalChofer: true, nConfirmanSi: 2, nConfirmanNo: 0 }), 2);
});

test("verificado exige dos fuentes independientes y estado cumplido", () => {
  assert.equal(vc3.cuentaComoVerificado({ estado: "cumplido", nivelEvidencia: 2 }), true);
  assert.equal(vc3.cuentaComoVerificado({ estado: "cumplido", nivelEvidencia: 1 }), false);
  assert.equal(vc3.cuentaComoVerificado({ estado: "en_disputa", nivelEvidencia: 3 }), false);
  assert.equal(vc3.cuentaComoVerificado({ estado: "sin_verificar", nivelEvidencia: 0 }), false);
});

// ── El paso del camión ───────────────────────────────────────────────────────

test("el camión entrando mueve el silencio a en_curso y después a cumplido", () => {
  const enCurso = vc3.aplicarPasoDeCamion(enBlanco());
  assert.equal(enCurso.estado, "en_curso");
  assert.equal(enCurso.senalGps, true);
  assert.equal(vc3.aplicarPasoDeCamion(enCurso).estado, "cumplido");
});

test("una disputa no se resuelve sola porque pase un camión", () => {
  let r = vc3.aplicarMarcaChofer(enBlanco(), true);
  for (let i = 0; i < 3; i += 1) r = vc3.aplicarConfirmacion(r, false);
  assert.equal(r.estado, "en_disputa");
  assert.equal(vc3.aplicarPasoDeCamion(r).estado, "en_disputa");
});

// ── El índice de cumplimiento ────────────────────────────────────────────────

test("sin ciclos contratados el ICS es 0, no un promedio inventado", () => {
  assert.equal(vc3.calcularIcs([]), 0);
  assert.equal(vc3.calcularIcs([{ programado: false, estado: "cumplido", nivelEvidencia: 3, confianza: 1 }]), 0);
});

test("el ICS solo cuenta los cumplidos con dos fuentes", () => {
  const registros = [
    { programado: true, estado: "cumplido", nivelEvidencia: 3, confianza: 1 },
    { programado: true, estado: "cumplido", nivelEvidencia: 1, confianza: 0.8 }, // NE-1 no cuenta
    { programado: true, estado: "sin_verificar", nivelEvidencia: 0, confianza: 0 },
    { programado: true, estado: "cumplido", nivelEvidencia: 2, confianza: 1 },
  ];
  // 2 de 4 ciclos verificados, con confianza media 1.
  assert.equal(vc3.calcularIcs(registros), 0.5);
});

test("nada se muta: aplicar una regla devuelve un registro nuevo", () => {
  const original = enBlanco();
  const copia = { ...original };
  vc3.aplicarConfirmacion(original, true);
  vc3.aplicarMarcaChofer(original, false);
  vc3.aplicarPasoDeCamion(original);
  assert.deepEqual(original, copia);
});
