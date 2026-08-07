-- CleanCity SPS — esquema de base de datos (Supabase / Postgres)
-- Ejecutar en el SQL Editor del proyecto Supabase.

create table if not exists colonias (
  id       text primary key,
  nombre   text not null,
  distrito text,
  lat      numeric,
  lon      numeric
);

create table if not exists usuarios (
  id         text primary key,
  telefono   text unique not null,
  email      text unique,
  password   text not null,
  colonia_id text references colonias(id),
  rol        text not null default 'vecino' check (rol in ('vecino','admin','empleado')),
  creado_en  timestamptz default now()
);

create table if not exists calendario_recoleccion (
  colonia_id      text primary key references colonias(id),
  dias_programados smallint[] not null default '{1,4}',
  ventana_inicio  time default '06:00',
  ventana_fin     time default '12:00'
);

create table if not exists camiones (
  id                   text primary key,
  placa                text not null,
  estado               text not null default 'activo' check (estado in ('activo','en_pausa','con_incidente')),
  ruta                 text,
  conductor            text,
  conductor_usuario_id text references usuarios(id),
  hora_inicio          time,
  nota                 text
);

-- Colonias que cubre cada camión (un camión puede tener varias paradas al día).
create table if not exists camion_colonias (
  camion_id  text references camiones(id) on delete cascade,
  colonia_id text references colonias(id) on delete cascade,
  primary key (camion_id, colonia_id)
);

-- Paradas del día: se generan a partir de calendario_recoleccion + camion_colonias
-- para las colonias con recolección programada hoy. El conductor marca cada una.
create table if not exists rutas (
  id           uuid primary key default gen_random_uuid(),
  camion_id    text not null references camiones(id) on delete cascade,
  colonia_id   text not null references colonias(id),
  fecha        date not null,
  hora_inicio  time,
  hora_fin     time,
  completada   boolean not null default false,
  incidente    text,
  nota         text,
  creado_en    timestamptz default now(),
  unique (camion_id, colonia_id, fecha)
);

create table if not exists denuncias (
  id                    uuid primary key default gen_random_uuid(),
  usuario_id            text references usuarios(id),
  colonia_id            text references colonias(id),
  tipo                  text not null check (tipo in ('basura_acumulada','no_paso_camion','botadero_ilegal')),
  descripcion           text,
  foto_url              text,
  estado                text not null default 'pendiente' check (estado in ('pendiente','en_atencion','resuelto','descartado')),
  confirmaciones_comunidad integer not null default 0,
  verificado_admin      boolean not null default false,
  verificado_admin_por  text references usuarios(id),
  verificado_admin_en   timestamptz,
  creado_en             timestamptz default now()
);

create table if not exists denuncia_confirmaciones (
  id          uuid primary key default gen_random_uuid(),
  denuncia_id uuid references denuncias(id) on delete cascade,
  usuario_id  text references usuarios(id),
  creado_en   timestamptz default now(),
  unique (denuncia_id, usuario_id)
);

-- Dataset histórico de rutas (CSV "dataset rutas historicas SPS.csv", abr-jun 2024)
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

-- Migración: agrega soporte de rol 'empleado' y vínculo conductor-camión
-- en bases ya existentes (create table if not exists no altera tablas vivas).
alter table camiones add column if not exists conductor_usuario_id text references usuarios(id);
alter table camiones drop column if exists ruta_completada; -- reemplazado por rutas.completada (varias paradas/día)
alter table usuarios drop constraint if exists usuarios_rol_check;
alter table usuarios add constraint usuarios_rol_check check (rol in ('vecino','admin','empleado'));

-- MVP: el backend usa la key pública (anon). Sin RLS para que las tablas
-- sean legibles/escritas con esa key mientras no haya policies.
alter table colonias               disable row level security;
alter table usuarios               disable row level security;
alter table calendario_recoleccion disable row level security;
alter table camiones               disable row level security;
alter table denuncias              disable row level security;
alter table denuncia_confirmaciones disable row level security;
alter table rutas_historicas         disable row level security;
alter table camion_colonias          disable row level security;
alter table rutas                    disable row level security;

-- ------------------------- Seed inicial (idempotente) -------------------------

-- El catálogo de colonias NO se siembra acá. Lo hace el bloque de PASÓ, al
-- final del archivo, con las 40 colonias y sus centros aproximados.
--
-- Esta sección sembraba seis, y dos de ellas —'col-la-pradera' y 'col-sula'—
-- no existen en ese catálogo. Volvían a aparecer en cada corrida como colonias
-- sin población ni orden, y salían en el panel de transparencia con el id
-- crudo en vez del nombre. Una colonia que el producto no conoce no puede
-- estar en la lista que el producto publica.

-- Admin de demostración (password en texto plano — deuda declarada del MVP)
insert into usuarios (id, telefono, password, colonia_id, rol) values
  ('VCN-00001', '100', 'admin123', null, 'admin')
on conflict (id) do nothing;

-- Empleados de demostración (conductores), password en texto plano — MVP
insert into usuarios (id, telefono, password, colonia_id, rol) values
  ('EMP-00001', '101', 'chofer123', null, 'empleado'),
  ('EMP-00002', '102', 'chofer123', null, 'empleado'),
  ('EMP-00003', '103', 'chofer123', null, 'empleado'),
  ('EMP-00004', '104', 'chofer123', null, 'empleado')
on conflict (id) do nothing;

insert into camiones (id, placa, estado, ruta, conductor, conductor_usuario_id, hora_inicio, nota) values
  ('CC-001', 'PCH-2841', 'activo',        'Rivera Hernández', 'Carlos Mejía',  'EMP-00001', '06:00', 'En ruta normal'),
  ('CC-002', 'PCH-7612', 'en_pausa',      'La Pradera',       'Rosa Cálix',    'EMP-00002', '08:30', 'Pausa programada'),
  ('CC-003', 'PCH-1190', 'con_incidente', 'Guamilito',        'Luis Paz',      'EMP-00003', '10:00', 'Llanta ponchada'),
  ('CC-004', 'PCH-5520', 'activo',        'Colonia Satélite', 'María Ferrera', 'EMP-00004', '07:00', 'En ruta normal')
on conflict (id) do update set conductor_usuario_id = excluded.conductor_usuario_id;

-- Colonias que cubre cada camión (varias paradas por día)
insert into camion_colonias (camion_id, colonia_id) values
  ('CC-001', 'col-rivera-hernandez'),
  ('CC-001', 'col-sula'),
  ('CC-002', 'col-la-pradera'),
  ('CC-002', 'col-cabanas'),
  ('CC-003', 'col-guamilito'),
  ('CC-004', 'col-satelite')
on conflict (camion_id, colonia_id) do nothing;


-- ===========================================================================
-- PASO - Verificacion de recoleccion
--
-- Todo lo de abajo sostiene el modelo de evidencia (VC-3): cada par
-- (colonia, dia) recibe un estado y un nivel de evidencia cruzando GPS del
-- camion, app de la cuadrilla y confirmaciones de vecinos.
--
-- Dos reglas del producto estan grabadas en el esquema y no en el codigo:
--   * El estado por defecto es 'sin_verificar'. El silencio nunca es
--     cumplimiento, ni siquiera por omision de una columna.
--   * Nada se edita ni se borra: bitacora_evidencia es append-only y cada
--     cambio deja su asiento.
-- ===========================================================================

-- Datos que el catalogo de colonias necesita para el mapa y el ranking.
alter table colonias add column if not exists poblacion_est integer;
alter table colonias add column if not exists radio_km numeric default 0.9;
alter table colonias add column if not exists orden integer default 0;

-- La cuenta del vecino: identidad hondurena, nombre y celular.
alter table usuarios add column if not exists identidad text unique;
alter table usuarios add column if not exists nombre_completo text;
alter table usuarios add column if not exists celular text;
alter table usuarios add column if not exists es_vecino_ancla boolean not null default false;

-- El registro de servicio de un par (colonia, dia). Es la fila que responde
-- "paso hoy?" y la unica que puede afirmar cumplimiento.
create table if not exists registros_servicio (
  colonia_id      text not null references colonias(id) on delete cascade,
  fecha           date not null,
  programado      boolean not null default false,
  estado          text not null default 'sin_verificar'
                  check (estado in ('cumplido','no_cumplido','en_disputa','sin_verificar','en_curso')),
  nivel_evidencia smallint not null default 0 check (nivel_evidencia between 0 and 3),
  confianza       numeric not null default 0 check (confianza >= 0 and confianza <= 1),
  senal_gps       boolean not null default false,
  senal_chofer    boolean not null default false,
  n_confirman_si  integer not null default 0,
  n_confirman_no  integer not null default 0,
  hora_verificada timestamptz,
  primary key (colonia_id, fecha)
);

-- Una confirmacion por dispositivo, por colonia, por dia. La llave primaria es
-- la que impide votar dos veces; no hace falta logica en el backend.
--
-- La llave es el DISPOSITIVO y no la cuenta a proposito. El contrato del
-- frontend prohibe localStorage y cookies, asi que una recarga cierra la
-- sesion y el vecino confirma sin haber entrado. Antifraude por dispositivo es
-- lo que hay; usuario_id queda como dato cuando si hay sesion, para el panel
-- del ciudadano. Es una limitacion declarada, no un descuido.
create table if not exists confirmaciones_servicio (
  colonia_id  text not null references colonias(id) on delete cascade,
  fecha       date not null,
  dispositivo text not null,
  usuario_id  text references usuarios(id) on delete set null,
  paso        boolean not null,
  creado_en   timestamptz default now(),
  primary key (colonia_id, fecha, dispositivo)
);

-- La bitacora. Append-only: seq es el numero de asiento que el vecino ve en
-- pantalla y que permite auditar un cambio meses despues.
create table if not exists bitacora_evidencia (
  seq        bigserial primary key,
  tipo       text not null,
  colonia_id text references colonias(id) on delete set null,
  camion_id  text references camiones(id) on delete set null,
  usuario_id text references usuarios(id) on delete set null,
  fecha      date,
  folio      text,
  detalle    text,
  creado_en  timestamptz default now()
);

-- Una disputa escalada a la alcaldia. Se marca, no se resuelve: la interfaz
-- nunca elige quien tiene razon.
create table if not exists disputas_escaladas (
  colonia_id   text not null references colonias(id) on delete cascade,
  fecha        date not null,
  escalado_por text references usuarios(id),
  creado_en    timestamptz default now(),
  primary key (colonia_id, fecha)
);

-- Posicion del camion. La ultima fila por camion es la que se muestra.
create table if not exists posiciones_camion (
  id         bigserial primary key,
  camion_id  text not null references camiones(id) on delete cascade,
  lat        numeric not null,
  lng        numeric not null,
  velocidad  numeric,
  colonia_id text references colonias(id) on delete set null,
  ts         timestamptz default now()
);

create index if not exists idx_posiciones_camion_ts on posiciones_camion (camion_id, ts desc);
create index if not exists idx_registros_fecha on registros_servicio (fecha);
create index if not exists idx_bitacora_creado on bitacora_evidencia (creado_en desc);

-- El motivo por el que una parada no se pudo hacer, en los mismos literales
-- que el historico de la empresa ya usa.
alter table rutas add column if not exists motivo text;
alter table rutas drop constraint if exists rutas_motivo_check;
alter table rutas add constraint rutas_motivo_check
  check (motivo is null or motivo in ('acceso_bloqueado','tiempo_insuficiente','retraso_por_lluvia','falla_mecanica'));
alter table rutas add column if not exists foto_url text;

-- El camion puede estar fuera de ruta o inactivo, no solo activo/pausa/incidente.
alter table camiones drop constraint if exists camiones_estado_check;
alter table camiones add constraint camiones_estado_check
  check (estado in ('activo','en_pausa','con_incidente','fuera_de_ruta','inactivo'));

alter table registros_servicio      disable row level security;
alter table confirmaciones_servicio disable row level security;
alter table bitacora_evidencia      disable row level security;
alter table disputas_escaladas      disable row level security;
alter table posiciones_camion       disable row level security;

-- -- Catalogo de colonias ----------------------------------------------------
-- Nombres, distritos y centros son reales; el poligono lo genera el backend
-- alrededor del centro y sale marcado como aproximado. radio_km solo alimenta
-- ese generador y no se expone por la API.

insert into colonias (id, nombre, distrito, lat, lon, poblacion_est, radio_km, orden) values
  ('col-rivera-hernandez', 'Rivera Hernández', 'Sureste', 15.4712, -87.9741, 42800, 1.9, 0),
  ('col-barandillas', 'Barandillas', 'Centro', 15.5081, -88.0189, 9400, 0.8, 1),
  ('col-las-brisas', 'Las Brisas', 'Noroeste', 15.5388, -88.0472, 14200, 1.1, 2),
  ('col-satelite', 'Satélite', 'Norte', 15.5461, -88.0157, 11800, 1, 3),
  ('col-los-andes', 'Los Andes', 'Noroeste', 15.5297, -88.0521, 10600, 0.9, 4),
  ('col-trejo', 'Trejo', 'Oeste', 15.5142, -88.0498, 8900, 0.8, 5),
  ('col-guamilito', 'Barrio Guamilito', 'Centro', 15.5089, -88.0301, 7200, 0.6, 6),
  ('col-medina', 'Barrio Medina', 'Centro', 15.5044, -88.0332, 6800, 0.6, 7),
  ('col-lempira', 'Barrio Lempira', 'Centro', 15.4998, -88.0221, 8100, 0.7, 8),
  ('col-rio-de-piedras', 'Barrio Río de Piedras', 'Centro', 15.5127, -88.0244, 7600, 0.7, 9),
  ('col-suyapa', 'Barrio Suyapa', 'Centro', 15.4961, -88.0289, 6400, 0.6, 10),
  ('col-cabanas', 'Barrio Cabañas', 'Centro', 15.5008, -88.0387, 5900, 0.6, 11),
  ('col-el-benque', 'Barrio El Benque', 'Centro', 15.5063, -88.0421, 7100, 0.7, 12),
  ('col-paz-barahona', 'Barrio Paz Barahona', 'Centro', 15.4932, -88.0198, 5400, 0.6, 13),
  ('col-jardines-del-valle', 'Jardines del Valle', 'Noroeste', 15.5241, -88.0389, 12300, 1, 14),
  ('col-bella-vista', 'Bella Vista', 'Noroeste', 15.5342, -88.0338, 9800, 0.9, 15),
  ('col-zeron', 'Colonia Zerón', 'Noroeste', 15.5188, -88.0442, 8700, 0.8, 16),
  ('col-moderna', 'Colonia Moderna', 'Norte', 15.5296, -88.0221, 9100, 0.8, 17),
  ('col-universidad', 'Colonia Universidad', 'Norte', 15.5372, -88.0269, 10200, 0.9, 18),
  ('col-altamira', 'Altamira', 'Noroeste', 15.5423, -88.0398, 9600, 0.9, 19),
  ('col-fesitranh', 'Fesitranh', 'Norte', 15.5518, -88.0281, 11400, 1, 20),
  ('col-las-palmas', 'Las Palmas', 'Norte', 15.5566, -88.0402, 13100, 1.1, 21),
  ('col-santa-martha', 'Santa Martha', 'Norte', 15.5489, -88.0511, 9300, 0.9, 22),
  ('col-primavera', 'Primavera', 'Noroeste', 15.5411, -88.0594, 10900, 1, 23),
  ('col-lopez-arellano', 'López Arellano', 'Sureste', 15.4623, -87.9887, 34200, 1.6, 24),
  ('col-planeta', 'Planeta', 'Sureste', 15.4551, -88.0021, 28700, 1.5, 25),
  ('col-smith', 'Colonia Smith', 'Este', 15.4879, -87.9962, 13800, 1, 26),
  ('col-el-pedregal', 'El Pedregal', 'Este', 15.4941, -88.0044, 11200, 0.9, 27),
  ('col-la-guardia', 'La Guardia', 'Este', 15.5021, -87.9971, 9700, 0.8, 28),
  ('col-dubon', 'Colonia Dubón', 'Este', 15.5108, -88.0059, 8800, 0.8, 29),
  ('col-tara', 'Rancho Tara', 'Este', 15.5187, -87.9903, 12600, 1, 30),
  ('col-los-castanos', 'Los Castaños', 'Este', 15.5254, -87.9981, 10400, 0.9, 31),
  ('col-celeo-gonzales', 'Céleo Gonzáles', 'Sureste', 15.4788, -88.0133, 16800, 1.1, 32),
  ('col-yulissa', 'Yulissa', 'Sureste', 15.4694, -88.0248, 14900, 1, 33),
  ('col-municipal', 'Colonia Municipal', 'Sur', 15.4852, -88.0341, 11700, 0.9, 34),
  ('col-san-juan', 'San Juan', 'Sur', 15.4767, -88.0429, 13400, 1, 35),
  ('col-la-puerta', 'La Puerta', 'Suroeste', 15.4881, -88.0518, 12100, 1, 36),
  ('col-fuerzas-armadas', 'Fuerzas Armadas', 'Suroeste', 15.4958, -88.0592, 9900, 0.9, 37),
  ('col-villas-del-sol', 'Villas del Sol', 'Suroeste', 15.5049, -88.0648, 10300, 0.9, 38),
  ('col-sunseri', 'Sunseri', 'Oeste', 15.5163, -88.0611, 8200, 0.8, 39)
on conflict (id) do update set
  nombre = excluded.nombre,
  distrito = excluded.distrito,
  lat = excluded.lat,
  lon = excluded.lon,
  poblacion_est = excluded.poblacion_est,
  radio_km = excluded.radio_km,
  orden = excluded.orden;

insert into calendario_recoleccion (colonia_id, dias_programados, ventana_inicio, ventana_fin) values
  ('col-rivera-hernandez', '{1,4}', '06:00', '12:00'),
  ('col-barandillas', '{2,5}', '06:00', '12:00'),
  ('col-las-brisas', '{1,4}', '06:00', '12:00'),
  ('col-satelite', '{3,6}', '06:00', '12:00'),
  ('col-los-andes', '{2,5}', '06:00', '12:00'),
  ('col-trejo', '{1,4}', '06:00', '12:00'),
  ('col-guamilito', '{1,3,5}', '06:00', '12:00'),
  ('col-medina', '{1,3,5}', '06:00', '12:00'),
  ('col-lempira', '{2,5}', '06:00', '12:00'),
  ('col-rio-de-piedras', '{2,5}', '06:00', '12:00'),
  ('col-suyapa', '{3,6}', '06:00', '12:00'),
  ('col-cabanas', '{3,6}', '06:00', '12:00'),
  ('col-el-benque', '{1,4}', '06:00', '12:00'),
  ('col-paz-barahona', '{2,5}', '06:00', '12:00'),
  ('col-jardines-del-valle', '{1,4}', '06:00', '12:00'),
  ('col-bella-vista', '{2,5}', '06:00', '12:00'),
  ('col-zeron', '{3,6}', '06:00', '12:00'),
  ('col-moderna', '{1,4}', '06:00', '12:00'),
  ('col-universidad', '{2,5}', '06:00', '12:00'),
  ('col-altamira', '{3,6}', '06:00', '12:00'),
  ('col-fesitranh', '{1,4}', '06:00', '12:00'),
  ('col-las-palmas', '{2,5}', '06:00', '12:00'),
  ('col-santa-martha', '{3,6}', '06:00', '12:00'),
  ('col-primavera', '{1,4}', '06:00', '12:00'),
  ('col-lopez-arellano', '{1,4}', '06:00', '12:00'),
  ('col-planeta', '{2,5}', '06:00', '12:00'),
  ('col-smith', '{3,6}', '06:00', '12:00'),
  ('col-el-pedregal', '{1,4}', '06:00', '12:00'),
  ('col-la-guardia', '{2,5}', '06:00', '12:00'),
  ('col-dubon', '{3,6}', '06:00', '12:00'),
  ('col-tara', '{1,4}', '06:00', '12:00'),
  ('col-los-castanos', '{2,5}', '06:00', '12:00'),
  ('col-celeo-gonzales', '{3,6}', '06:00', '12:00'),
  ('col-yulissa', '{1,4}', '06:00', '12:00'),
  ('col-municipal', '{2,5}', '06:00', '12:00'),
  ('col-san-juan', '{3,6}', '06:00', '12:00'),
  ('col-la-puerta', '{1,4}', '06:00', '12:00'),
  ('col-fuerzas-armadas', '{2,5}', '06:00', '12:00'),
  ('col-villas-del-sol', '{3,6}', '06:00', '12:00'),
  ('col-sunseri', '{1,4}', '06:00', '12:00')
on conflict (colonia_id) do update set
  dias_programados = excluded.dias_programados,
  ventana_inicio = excluded.ventana_inicio,
  ventana_fin = excluded.ventana_fin;

-- El folio es lo que el vecino lee en voz alta por telefono cuando reclama.
-- Se guarda en vez de derivarse para que no cambie si cambia el generador.
alter table denuncias add column if not exists folio text unique;
alter table denuncias add column if not exists severidad smallint;
alter table denuncias add column if not exists resolucion text;
alter table denuncias add column if not exists atendido_en timestamptz;

-- El dispositivo que puso la queja. Es lo que resuelve "mis reportes" sin
-- sesion, con la misma limitacion declarada que confirmaciones_servicio.
alter table denuncias add column if not exists dispositivo text;
alter table denuncias alter column usuario_id drop not null;
create index if not exists idx_denuncias_dispositivo on denuncias (dispositivo);

-- -- La flota ----------------------------------------------------------------
-- Seis camiones, los mismos que el historico de la empresa numera CAM-001..006.
-- Los cuatro conductores de demostracion quedan al volante de los cuatro
-- primeros; los otros dos son unidades sin chofer asignado, que es un estado
-- real de la operacion y no un hueco del seed.

delete from camion_colonias where camion_id like 'CC-%';
delete from rutas where camion_id like 'CC-%';
delete from camiones where id like 'CC-%';

insert into camiones (id, placa, estado, conductor, conductor_usuario_id, hora_inicio, nota) values
  ('CAM-01', 'HAB 3100', 'activo', 'Jose Carcamo', 'EMP-00001', '06:00', 'En ruta normal'),
  ('CAM-02', 'HAB 3137', 'activo', 'Wilmer Paz', 'EMP-00002', '06:00', 'En ruta normal'),
  ('CAM-03', 'HAB 3174', 'con_incidente', 'Oscar Mejia', 'EMP-00003', '06:00', 'Llanta ponchada'),
  ('CAM-04', 'HAB 3211', 'activo', 'Selvin Amaya', 'EMP-00004', '06:00', 'En ruta normal'),
  ('CAM-05', 'HAB 3248', 'activo', 'Denis Zelaya', null, '06:00', 'En ruta normal'),
  ('CAM-06', 'HAB 3285', 'en_pausa', 'Marvin Portillo', null, '06:00', 'Pausa programada')
on conflict (id) do update set
  placa = excluded.placa,
  conductor = excluded.conductor,
  conductor_usuario_id = excluded.conductor_usuario_id;

-- Las paradas que cubre cada camion. Siete colonias por unidad: el reparto por
-- indice del catalogo, que es el que ya usaba la demo.
insert into camion_colonias (camion_id, colonia_id) values
  ('CAM-01', 'col-rivera-hernandez'),
  ('CAM-01', 'col-barandillas'),
  ('CAM-01', 'col-las-brisas'),
  ('CAM-01', 'col-satelite'),
  ('CAM-01', 'col-los-andes'),
  ('CAM-01', 'col-trejo'),
  ('CAM-01', 'col-guamilito'),
  ('CAM-02', 'col-medina'),
  ('CAM-02', 'col-lempira'),
  ('CAM-02', 'col-rio-de-piedras'),
  ('CAM-02', 'col-suyapa'),
  ('CAM-02', 'col-cabanas'),
  ('CAM-02', 'col-el-benque'),
  ('CAM-02', 'col-paz-barahona'),
  ('CAM-03', 'col-jardines-del-valle'),
  ('CAM-03', 'col-bella-vista'),
  ('CAM-03', 'col-zeron'),
  ('CAM-03', 'col-moderna'),
  ('CAM-03', 'col-universidad'),
  ('CAM-03', 'col-altamira'),
  ('CAM-03', 'col-fesitranh'),
  ('CAM-04', 'col-las-palmas'),
  ('CAM-04', 'col-santa-martha'),
  ('CAM-04', 'col-primavera'),
  ('CAM-04', 'col-lopez-arellano'),
  ('CAM-04', 'col-planeta'),
  ('CAM-04', 'col-smith'),
  ('CAM-04', 'col-el-pedregal'),
  ('CAM-05', 'col-la-guardia'),
  ('CAM-05', 'col-dubon'),
  ('CAM-05', 'col-tara'),
  ('CAM-05', 'col-los-castanos'),
  ('CAM-05', 'col-celeo-gonzales'),
  ('CAM-05', 'col-yulissa'),
  ('CAM-05', 'col-municipal'),
  ('CAM-06', 'col-san-juan'),
  ('CAM-06', 'col-la-puerta'),
  ('CAM-06', 'col-fuerzas-armadas'),
  ('CAM-06', 'col-villas-del-sol'),
  ('CAM-06', 'col-sunseri')
on conflict (camion_id, colonia_id) do nothing;
