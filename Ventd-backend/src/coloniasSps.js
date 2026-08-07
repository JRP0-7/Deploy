// Catálogo de colonias de San Pedro Sula.
//
// ⚠️ DATOS DECLARADOS COMO APROXIMADOS. Los nombres, distritos y centros son
// reales; los polígonos NO — se generan alrededor del centro con
// `poligonoAproximado()` y cada colonia sale marcada con `aproximado: true`.
// Cuando llegue el GeoJSON de la alcaldía, se reemplaza el generador y nada
// más cambia.
//
// Las seis primeras son las del guion de la demo y tienen que estar sí o sí.
// `radioKm` no se expone por la API: solo alimenta al generador de forma.

const SEMILLAS = [
  // ── Las del guion ─────────────────────────────────────────────────────────
  { id: "col-rivera-hernandez", nombre: "Rivera Hernández", distrito: "Sureste", centro: [15.4712, -87.9741], radioKm: 1.9, poblacion: 42800, dias: [1, 4] },
  { id: "col-barandillas", nombre: "Barandillas", distrito: "Centro", centro: [15.5081, -88.0189], radioKm: 0.8, poblacion: 9400, dias: [2, 5] },
  { id: "col-las-brisas", nombre: "Las Brisas", distrito: "Noroeste", centro: [15.5388, -88.0472], radioKm: 1.1, poblacion: 14200, dias: [1, 4] },
  { id: "col-satelite", nombre: "Satélite", distrito: "Norte", centro: [15.5461, -88.0157], radioKm: 1.0, poblacion: 11800, dias: [3, 6] },
  { id: "col-los-andes", nombre: "Los Andes", distrito: "Noroeste", centro: [15.5297, -88.0521], radioKm: 0.9, poblacion: 10600, dias: [2, 5] },
  { id: "col-trejo", nombre: "Trejo", distrito: "Oeste", centro: [15.5142, -88.0498], radioKm: 0.8, poblacion: 8900, dias: [1, 4] },

  // ── Centro histórico y barrios tradicionales ──────────────────────────────
  { id: "col-guamilito", nombre: "Barrio Guamilito", distrito: "Centro", centro: [15.5089, -88.0301], radioKm: 0.6, poblacion: 7200, dias: [1, 3, 5] },
  { id: "col-medina", nombre: "Barrio Medina", distrito: "Centro", centro: [15.5044, -88.0332], radioKm: 0.6, poblacion: 6800, dias: [1, 3, 5] },
  { id: "col-lempira", nombre: "Barrio Lempira", distrito: "Centro", centro: [15.4998, -88.0221], radioKm: 0.7, poblacion: 8100, dias: [2, 5] },
  { id: "col-rio-de-piedras", nombre: "Barrio Río de Piedras", distrito: "Centro", centro: [15.5127, -88.0244], radioKm: 0.7, poblacion: 7600, dias: [2, 5] },
  { id: "col-suyapa", nombre: "Barrio Suyapa", distrito: "Centro", centro: [15.4961, -88.0289], radioKm: 0.6, poblacion: 6400, dias: [3, 6] },
  { id: "col-cabanas", nombre: "Barrio Cabañas", distrito: "Centro", centro: [15.5008, -88.0387], radioKm: 0.6, poblacion: 5900, dias: [3, 6] },
  { id: "col-el-benque", nombre: "Barrio El Benque", distrito: "Centro", centro: [15.5063, -88.0421], radioKm: 0.7, poblacion: 7100, dias: [1, 4] },
  { id: "col-paz-barahona", nombre: "Barrio Paz Barahona", distrito: "Centro", centro: [15.4932, -88.0198], radioKm: 0.6, poblacion: 5400, dias: [2, 5] },

  // ── Noroeste y norte ──────────────────────────────────────────────────────
  { id: "col-jardines-del-valle", nombre: "Jardines del Valle", distrito: "Noroeste", centro: [15.5241, -88.0389], radioKm: 1.0, poblacion: 12300, dias: [1, 4] },
  { id: "col-bella-vista", nombre: "Bella Vista", distrito: "Noroeste", centro: [15.5342, -88.0338], radioKm: 0.9, poblacion: 9800, dias: [2, 5] },
  { id: "col-zeron", nombre: "Colonia Zerón", distrito: "Noroeste", centro: [15.5188, -88.0442], radioKm: 0.8, poblacion: 8700, dias: [3, 6] },
  { id: "col-moderna", nombre: "Colonia Moderna", distrito: "Norte", centro: [15.5296, -88.0221], radioKm: 0.8, poblacion: 9100, dias: [1, 4] },
  { id: "col-universidad", nombre: "Colonia Universidad", distrito: "Norte", centro: [15.5372, -88.0269], radioKm: 0.9, poblacion: 10200, dias: [2, 5] },
  { id: "col-altamira", nombre: "Altamira", distrito: "Noroeste", centro: [15.5423, -88.0398], radioKm: 0.9, poblacion: 9600, dias: [3, 6] },
  { id: "col-fesitranh", nombre: "Fesitranh", distrito: "Norte", centro: [15.5518, -88.0281], radioKm: 1.0, poblacion: 11400, dias: [1, 4] },
  { id: "col-las-palmas", nombre: "Las Palmas", distrito: "Norte", centro: [15.5566, -88.0402], radioKm: 1.1, poblacion: 13100, dias: [2, 5] },
  { id: "col-santa-martha", nombre: "Santa Martha", distrito: "Norte", centro: [15.5489, -88.0511], radioKm: 0.9, poblacion: 9300, dias: [3, 6] },
  { id: "col-primavera", nombre: "Primavera", distrito: "Noroeste", centro: [15.5411, -88.0594], radioKm: 1.0, poblacion: 10900, dias: [1, 4] },

  // ── Este y sureste ────────────────────────────────────────────────────────
  { id: "col-lopez-arellano", nombre: "López Arellano", distrito: "Sureste", centro: [15.4623, -87.9887], radioKm: 1.6, poblacion: 34200, dias: [1, 4] },
  { id: "col-planeta", nombre: "Planeta", distrito: "Sureste", centro: [15.4551, -88.0021], radioKm: 1.5, poblacion: 28700, dias: [2, 5] },
  { id: "col-smith", nombre: "Colonia Smith", distrito: "Este", centro: [15.4879, -87.9962], radioKm: 1.0, poblacion: 13800, dias: [3, 6] },
  { id: "col-el-pedregal", nombre: "El Pedregal", distrito: "Este", centro: [15.4941, -88.0044], radioKm: 0.9, poblacion: 11200, dias: [1, 4] },
  { id: "col-la-guardia", nombre: "La Guardia", distrito: "Este", centro: [15.5021, -87.9971], radioKm: 0.8, poblacion: 9700, dias: [2, 5] },
  { id: "col-dubon", nombre: "Colonia Dubón", distrito: "Este", centro: [15.5108, -88.0059], radioKm: 0.8, poblacion: 8800, dias: [3, 6] },
  { id: "col-tara", nombre: "Rancho Tara", distrito: "Este", centro: [15.5187, -87.9903], radioKm: 1.0, poblacion: 12600, dias: [1, 4] },
  { id: "col-los-castanos", nombre: "Los Castaños", distrito: "Este", centro: [15.5254, -87.9981], radioKm: 0.9, poblacion: 10400, dias: [2, 5] },
  { id: "col-celeo-gonzales", nombre: "Céleo Gonzáles", distrito: "Sureste", centro: [15.4788, -88.0133], radioKm: 1.1, poblacion: 16800, dias: [3, 6] },
  { id: "col-yulissa", nombre: "Yulissa", distrito: "Sureste", centro: [15.4694, -88.0248], radioKm: 1.0, poblacion: 14900, dias: [1, 4] },

  // ── Sur y suroeste ────────────────────────────────────────────────────────
  { id: "col-municipal", nombre: "Colonia Municipal", distrito: "Sur", centro: [15.4852, -88.0341], radioKm: 0.9, poblacion: 11700, dias: [2, 5] },
  { id: "col-san-juan", nombre: "San Juan", distrito: "Sur", centro: [15.4767, -88.0429], radioKm: 1.0, poblacion: 13400, dias: [3, 6] },
  { id: "col-la-puerta", nombre: "La Puerta", distrito: "Suroeste", centro: [15.4881, -88.0518], radioKm: 1.0, poblacion: 12100, dias: [1, 4] },
  { id: "col-fuerzas-armadas", nombre: "Fuerzas Armadas", distrito: "Suroeste", centro: [15.4958, -88.0592], radioKm: 0.9, poblacion: 9900, dias: [2, 5] },
  { id: "col-villas-del-sol", nombre: "Villas del Sol", distrito: "Suroeste", centro: [15.5049, -88.0648], radioKm: 0.9, poblacion: 10300, dias: [3, 6] },
  { id: "col-sunseri", nombre: "Sunseri", distrito: "Oeste", centro: [15.5163, -88.0611], radioKm: 0.8, poblacion: 8200, dias: [1, 4] },
];

const VENTANA_INICIO = "06:00";
const VENTANA_FIN = "12:00";

module.exports = { SEMILLAS, VENTANA_INICIO, VENTANA_FIN };
