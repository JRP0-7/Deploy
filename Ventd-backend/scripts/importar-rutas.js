// Convierte "dataset rutas historicas SPS.csv" a SQL y/o lo sube a Supabase.
// Uso:
//   node scripts/importar-rutas.js --sql     -> genera db/rutas_historicas.sql
//   node scripts/importar-rutas.js --upload  -> sube a Supabase (usa .env)
//   node scripts/importar-rutas.js           -> hace ambos
// La tabla rutas_historicas debe existir (ver db/schema.sql).

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CSV_PATH = process.env.CSV_PATH || path.join(ROOT, "..", "dataset rutas historicas SPS.csv");
const SQL_PATH = path.join(ROOT, "db", "rutas_historicas.sql");

function parseCsv(file) {
  const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = lines[0].split(",");
  if (header.length !== 11) throw new Error(`Header inesperado (${header.length} campos): ${lines[0]}`);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length !== header.length) {
      console.warn(`Línea ${i + 1} omitida (${cols.length} campos, se esperaban ${header.length})`);
      continue;
    }
    const v = parseInt(cols[10].trim(), 10);
    rows.push({
      fecha: cols[0].trim(),
      diaSemana: cols[1].trim(),
      idCamion: cols[2].trim(),
      colonia: cols[3].trim(),
      horaInicio: cols[4].trim() || null,
      horaFin: cols[5].trim() || null,
      completada: cols[6].trim() === "true",
      incidente: cols[7].trim(),
      lluvia: cols[8].trim() === "true",
      diaFestivo: cols[9].trim() === "true",
      volumen: Number.isNaN(v) ? null : v,
    });
  }
  return rows;
}

function esc(s) {
  return s == null ? "NULL" : `'${String(s).replace(/'/g, "''")}'`;
}

function toSql(rows) {
  const head = `-- Rutas históricas generadas desde "dataset rutas historicas SPS.csv"
-- ${rows.length} filas. Autocontenido e idempotente: crea la tabla y la carga.
-- Pegar completo en el SQL Editor de Supabase.

create table if not exists rutas_historicas (
  fecha              date not null,
  dia_semana         text,
  id_camion          text not null,
  colonia            text not null,
  hora_inicio        time,
  hora_fin           time,
  completada         boolean not null,
  incidente          text not null default 'ninguno',
  lluvia             boolean not null default false,
  dia_festivo        boolean not null default false,
  volumen_estimado_kg integer,
  primary key (fecha, id_camion, colonia)
);

alter table rutas_historicas disable row level security;

`;
  const BATCH = 500;
  const chunks = [];
  for (let i = 0; i < rows.length; i += BATCH) {
    const values = rows
      .slice(i, i + BATCH)
      .map(
        (r) =>
          `(${esc(r.fecha)}, ${esc(r.diaSemana)}, ${esc(r.idCamion)}, ${esc(r.colonia)}, ` +
          `${esc(r.horaInicio)}, ${esc(r.horaFin)}, ${r.completada}, ${esc(r.incidente)}, ` +
          `${r.lluvia}, ${r.diaFestivo}, ${r.volumen == null ? "NULL" : r.volumen})`
      )
      .join(",\n  ");
    chunks.push(
      `insert into rutas_historicas (fecha, dia_semana, id_camion, colonia, hora_inicio, hora_fin, completada, incidente, lluvia, dia_festivo, volumen_estimado_kg) values\n  ${values}\non conflict (fecha, id_camion, colonia) do nothing;`
    );
  }
  return head + chunks.join("\n\n") + "\n";
}

async function upload(rows) {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) {
    console.error("No existe Ventd-backend/.env — sube db/rutas_historicas.sql manualmente en el SQL Editor.");
    return false;
  }
  process.loadEnvFile(envPath);
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error("Faltan SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY en .env");
    return false;
  }
  const api = `${url.replace(/\/+$/, "")}/rest/v1/rutas_historicas`;
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "resolution=ignore-duplicates,return=minimal",
  };
  const BATCH = 1000;
  let total = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH).map((r) => ({
      fecha: r.fecha,
      dia_semana: r.diaSemana,
      id_camion: r.idCamion,
      colonia: r.colonia,
      hora_inicio: r.horaInicio,
      hora_fin: r.horaFin,
      completada: r.completada,
      incidente: r.incidente,
      lluvia: r.lluvia,
      dia_festivo: r.diaFestivo,
      volumen_estimado_kg: r.volumen,
    }));
    const res = await fetch(api, { method: "POST", headers, body: JSON.stringify(batch) });
    if (!res.ok) {
      const body = await res.text();
      console.error(`Batch ${i / BATCH + 1} falló (${res.status}): ${body.slice(0, 400)}`);
      return false;
    }
    total += batch.length;
    console.log(`Subidas ${total}/${rows.length} filas`);
  }
  return true;
}

async function main() {
  const mode = process.argv[2] || "--both";
  if (!fs.existsSync(CSV_PATH)) throw new Error(`CSV no encontrado: ${CSV_PATH}`);
  const rows = parseCsv(CSV_PATH);
  console.log(`CSV: ${rows.length} filas`);
  if (mode === "--sql" || mode === "--both") {
    fs.mkdirSync(path.dirname(SQL_PATH), { recursive: true });
    fs.writeFileSync(SQL_PATH, toSql(rows));
    console.log(`SQL generado: ${SQL_PATH}`);
  }
  if (mode === "--upload" || mode === "--both") {
    const ok = await upload(rows);
    if (ok) console.log("Subida a Supabase completada.");
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
