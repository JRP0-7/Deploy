// La cuenta del vecino.
//
// La llave es la IDENTIDAD hondureña (13 dígitos), no el teléfono ni el
// correo: es el único dato que una persona no cambia y que la alcaldía ya usa
// para todo lo demás. El celular se guarda en `usuarios.telefono` porque es la
// misma cosa con otro nombre, y el correo en `usuarios.email`.
//
// ⚠️ La contraseña se guarda en texto plano. Es deuda declarada del MVP, la
// misma que ya tenían el admin y los conductores de demostración; no se
// esconde para que no se olvide. La sesión la sostiene el frontend en memoria
// y una recarga la cierra, así que acá no hay token ni cookie que emitir.

/** Deja solo dígitos. Identidad y celular se escriben con guiones. */
function soloDigitos(valor) {
  return String(valor || "").replace(/\D/g, "");
}

function validarEntrada({ identidad, nombreCompleto, correo, celular, coloniaId, contrasena }) {
  const id13 = soloDigitos(identidad);
  const cel8 = soloDigitos(celular);
  if (!/^\d{13}$/.test(id13)) throw Object.assign(new Error("La identidad son 13 números."), { status: 400 });
  if (!nombreCompleto || !String(nombreCompleto).trim()) {
    throw Object.assign(new Error("Falta tu nombre completo."), { status: 400 });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(correo || ""))) {
    throw Object.assign(new Error("Ese correo no se ve bien."), { status: 400 });
  }
  if (!/^\d{8}$/.test(cel8)) throw Object.assign(new Error("El celular son 8 números."), { status: 400 });
  if (!coloniaId) throw Object.assign(new Error("Elegí tu colonia."), { status: 400 });
  if (!contrasena || String(contrasena).length < 4) {
    throw Object.assign(new Error("La contraseña necesita al menos 4 caracteres."), { status: 400 });
  }
  return {
    identidad: id13,
    nombreCompleto: String(nombreCompleto).trim(),
    correo: String(correo).trim(),
    celular: cel8,
    coloniaId,
    contrasena: String(contrasena),
  };
}

function mapVecino(u) {
  return {
    identidad: u.identidad,
    nombreCompleto: u.nombre_completo || u.nombreCompleto || "",
    correo: u.email || u.correo || "",
    celular: u.telefono || u.celular || "",
    coloniaId: u.colonia_id || u.coloniaId || "",
    esVecinoAncla: !!(u.es_vecino_ancla || u.esVecinoAncla),
  };
}

function sesion(vecino, usuarioId) {
  return { vecino, creadoEn: new Date().toISOString(), usuarioId };
}

function crearCuentasSupabase(sb, siguienteId) {
  return {
    async registrarVecino(entrada) {
      const v = validarEntrada(entrada);

      const { data: yaEsta } = await sb.from("usuarios").select("id").eq("identidad", v.identidad).maybeSingle();
      if (yaEsta) throw Object.assign(new Error("Ya hay una cuenta con esa identidad."), { status: 409 });

      const { data: existentes } = await sb
        .from("usuarios")
        .select("id")
        .order("id", { ascending: false })
        .limit(200);
      const id = siguienteId((existentes || []).map((u) => u.id));

      const { data, error } = await sb
        .from("usuarios")
        .insert({
          id,
          identidad: v.identidad,
          nombre_completo: v.nombreCompleto,
          email: v.correo,
          telefono: v.celular,
          colonia_id: v.coloniaId,
          password: v.contrasena,
          rol: "vecino",
        })
        .select("*")
        .single();
      if (error) {
        if (error.code === "23505") {
          throw Object.assign(new Error("Ya hay una cuenta con esos datos."), { status: 409 });
        }
        throw error;
      }
      return sesion(mapVecino(data), data.id);
    },

    async iniciarSesionVecino({ identidad, contrasena }) {
      const id13 = soloDigitos(identidad);
      const { data, error } = await sb.from("usuarios").select("*").eq("identidad", id13).maybeSingle();
      if (error) throw error;
      if (!data) throw Object.assign(new Error("No encontramos una cuenta con esa identidad."), { status: 404 });
      if (data.password !== String(contrasena)) {
        throw Object.assign(new Error("La contraseña no coincide."), { status: 401 });
      }
      return sesion(mapVecino(data), data.id);
    },
  };
}

function crearCuentasMemoria(estado, siguienteId) {
  return {
    async registrarVecino(entrada) {
      const v = validarEntrada(entrada);
      if (estado.usuarios.some((u) => u.identidad === v.identidad)) {
        throw Object.assign(new Error("Ya hay una cuenta con esa identidad."), { status: 409 });
      }
      const id = siguienteId(estado.usuarios.map((u) => u.id));
      const usuario = {
        id,
        identidad: v.identidad,
        nombreCompleto: v.nombreCompleto,
        correo: v.correo,
        telefono: v.celular,
        coloniaId: v.coloniaId,
        password: v.contrasena,
        rol: "vecino",
        esVecinoAncla: false,
        creadoEn: new Date().toISOString(),
      };
      estado.usuarios.push(usuario);
      return sesion(mapVecino(usuario), id);
    },

    async iniciarSesionVecino({ identidad, contrasena }) {
      const id13 = soloDigitos(identidad);
      const u = estado.usuarios.find((x) => x.identidad === id13);
      if (!u) throw Object.assign(new Error("No encontramos una cuenta con esa identidad."), { status: 404 });
      if (u.password !== String(contrasena)) {
        throw Object.assign(new Error("La contraseña no coincide."), { status: 401 });
      }
      return sesion(mapVecino(u), u.id);
    },
  };
}

module.exports = { crearCuentasSupabase, crearCuentasMemoria, soloDigitos };
