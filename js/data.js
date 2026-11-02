/* Fronteras del Reino: datos (tropas, monstruos, zonas del mapa, casillas, comandantes y bendiciones). */
'use strict';

var APP_VERSION = '1.0.0';
var APP_NOTES = [
  { v: '1.0.0', items: [
    'Primera versión: el mapa se genera solo y crece tras cada oleada.',
    'Cinco zonas con su losa y su elemento: prado, glaciar, volcán, pantano y ruinas.',
    'Caminos nuevos con su portal cada pocas oleadas, casillas especiales y mapa del día.',
    'Las 29 tropas y los 7 comandantes de Reino de Torres.'
  ] }
];

var MAX_RANK = 7;
// daño de cada rango respecto al rango 1
var RANK_MULT = [0, 1, 2.1, 4, 7.4, 13, 23, 41];
var RANK_COLOR = ['#000', '#c9d2e3', '#6fd86a', '#4fb3ff', '#b57bff', '#ffb02e', '#ff5a5a', '#ffffff'];
// mejora de partida: coste para pasar al nivel 2, 3, 4 y 5
var POWER_COSTS = [0, 0, 100, 220, 380, 600];
var POWER_BONUS = 0.22;
var START_MANA = 100;
var SUMMON_BASE = 10, SUMMON_STEP = 8;
var START_LIVES = 10;
var BLESS_EVERY = 5;
var BOSS_EVERY = 10;
var RANGE_PER_RANK = 0.08;   // alcance extra por rango (en casillas)
var BIOME_BONUS = 0.2;       // daño extra en una losa de su elemento

var ELEMENTS = {
  fuego: { name: 'Fuego', color: '#ff6a3c', icon: 'icons/fuego' },
  hielo: { name: 'Hielo', color: '#5ccaff', icon: 'icons/hielo' },
  naturaleza: { name: 'Naturaleza', color: '#55c96e', icon: 'icons/hoja' },
  arcano: { name: 'Arcano', color: '#9b7bff', icon: 'icons/arcano' },
  metal: { name: 'Metal', color: '#f2b632', icon: 'icons/engranaje' }
};

var RARITY = {
  comun: { name: 'Común', color: '#9fb0c8' },
  rara: { name: 'Rara', color: '#4fb3ff' },
  epica: { name: 'Épica', color: '#b57bff' },
  mitica: { name: 'Mítica', color: '#ff5fa2' },
  legendaria: { name: 'Legendaria', color: '#ffb02e' }
};

/* Tropas. dmg: daño por golpe a rango 1. rate: golpes por segundo. range: alcance en casillas.
   shot: proyectil (assets/fx). hit: impacto. face: hacia dónde mira la pose de ataque. */
var TROOPS = {
  lyra:    { name: 'Lyra', title: 'Arquera del Bosque', el: 'naturaleza', rar: 'comun', dmg: 22, rate: 1.6, range: 2.5, shot: 'lyra-tiro', hit: 'flecha-impacto', face: 1,
             desc: 'Flechas muy rápidas al monstruo que va primero.' },
  brasa:   { name: 'Brasa', title: 'Piromante', el: 'fuego', rar: 'comun', dmg: 24, rate: 0.8, range: 2.1, shot: 'fuego-bola', hit: 'fuego-impacto', splash: 0.9, face: -1,
             desc: 'Bolas de fuego que dañan a los de alrededor.' },
  nivea:   { name: 'Nívea', title: 'Hechicera de Escarcha', el: 'hielo', rar: 'comun', dmg: 20, rate: 1.0, range: 2.3, shot: 'hielo-bola', hit: 'hielo-impacto', slow: 0.12, face: -1,
             desc: 'Cada golpe frena un poco más al monstruo, hasta la mitad.' },
  doblon:  { name: 'Doblón', title: 'Mercader', el: 'metal', rar: 'comun', mana: 8, every: 6, face: 1,
             desc: 'No ataca. Cada 6 segundos te da maná, más cuanto más rango.' },
  marea:   { name: 'Marea', title: 'Sacerdotisa del Oleaje', el: 'hielo', rar: 'comun', dmg: 24, rate: 0.75, range: 2.1, shot: 'marea-tiro', hit: 'hielo-impacto', push: 0.35, spin: true, face: 1,
             desc: 'Su ola empuja a los monstruos hacia atrás, tres veces como mucho a cada uno.' },
  rocco:   { name: 'Rocco', title: 'Cañonero Enano', el: 'fuego', rar: 'rara', dmg: 44, rate: 0.5, range: 2.7, shot: 'rocco-tiro', hit: 'canon-impacto', splash: 1.3, spin: true, face: 1,
             desc: 'Bombas lentas que revientan en una zona grande.' },
  volta:   { name: 'Volta', title: 'Ingeniera Tesla', el: 'arcano', rar: 'rara', dmg: 16, rate: 1.0, range: 2.4, shot: 'rayo-bola', hit: 'rayo-impacto', chain: 3, face: -1,
             desc: 'Rayos que saltan entre tres monstruos, y uno más cada dos rangos.' },
  mirra:   { name: 'Mirra', title: 'Alquimista', el: 'naturaleza', rar: 'rara', dmg: 6, rate: 1.0, range: 2.3, shot: 'veneno-bola', hit: 'veneno-impacto', poison: 18, splash: 0.8, spin: true, face: -1,
             desc: 'Frascos que envenenan una zona durante 4 segundos.' },
  melodia: { name: 'Melodía', title: 'Bardo', el: 'arcano', rar: 'rara', buff: 'speed', buffVal: 0.18, face: 1,
             desc: 'No ataca. Las tropas de alrededor disparan un 18% más rápido, más con rango.' },
  kaia:    { name: 'Kaia', title: 'Exploradora', el: 'naturaleza', rar: 'rara', dmg: 36, rate: 1.2, range: 2.8, shot: 'kaia-tiro', hit: 'flecha-impacto', lone: 0.8, face: 1,
             desc: 'Sin ninguna tropa alrededor pega un 80% más.' },
  frida:   { name: 'Frida', title: 'Druida de Espinas', el: 'naturaleza', rar: 'rara', dmg: 18, rate: 1.1, range: 2.3, shot: 'frida-tiro', hit: 'veneno-impacto', thorns: 0.2, face: 1,
             desc: 'Enreda al monstruo: 3 segundos recibiendo un 20% más de daño.' },
  hilda:   { name: 'Hilda', title: 'Afiladora', el: 'metal', rar: 'rara', buff: 'dmg', buffVal: 0.22, face: 1,
             desc: 'No ataca. Las tropas de alrededor pegan un 22% más, más con rango.' },
  elian:   { name: 'Elian', title: 'Inquisidor', el: 'arcano', rar: 'rara', buff: 'crit', buffVal: 0.15, face: 1,
             desc: 'No ataca. Las tropas de alrededor ganan un 15% de crítico doble.' },
  tilo:    { name: 'Tilo', title: 'Químico', el: 'naturaleza', rar: 'rara', buff: 'acid', buffVal: 0.12, face: 1,
             desc: 'No ataca. Los golpes de las tropas de alrededor quitan la armadura y hacen recibir un 12% más de daño 3 segundos.' },
  sombra:  { name: 'Sombra', title: 'Asesina', el: 'arcano', rar: 'epica', dmg: 24, rate: 1.3, range: 1.9, shot: 'sombra-tiro', hit: 'sombra-impacto', crit: 0.3, critX: 3, face: -1,
             desc: 'Puñales rápidos con un 30% de crítico triple. Alcance corto.' },
  cronos:  { name: 'Cronos', title: 'Relojero', el: 'metal', rar: 'epica', dmg: 32, rate: 0.9, range: 2.3, shot: 'cronos-tiro', hit: 'engranaje-impacto', stun: 0.12, spin: true, face: 1,
             desc: 'Sus engranajes paran en seco al monstruo un momento.' },
  halcon:  { name: 'Halcón', title: 'Francotirador', el: 'metal', rar: 'epica', dmg: 120, rate: 0.32, range: 4.2, shot: 'halcon-tiro', hit: 'bala-impacto', target: 'strong', face: 1,
             desc: 'Lento y demoledor, con muchísimo alcance. Apunta al monstruo con más vida.' },
  eco:     { name: 'Eco', title: 'Imitadora', el: 'arcano', rar: 'epica', wild: 0.1, face: -1,
             desc: 'No ataca. Se fusiona con cualquier tropa de su rango y se convierte en ella. A veces sube dos rangos.' },
  oria:    { name: 'Oria', title: 'Banquera', el: 'metal', rar: 'epica', interest: 0.03, every: 5, face: 1,
             desc: 'No ataca. Cada 5 segundos te da un 3% del maná guardado, con un tope que sube con el rango.' },
  ulric:   { name: 'Ulric', title: 'Paladín', el: 'hielo', rar: 'legendaria', dmg: 60, rate: 0.9, range: 2.3, shot: 'luz-bola', hit: 'luz-impacto', boss: 4, spin: true, target: 'strong', face: 1,
             desc: 'Golpes sagrados que hacen el cuádruple a los jefes.' },
  fenix:   { name: 'Ígnea', title: 'Ave Fénix', el: 'fuego', rar: 'legendaria', dmg: 44, rate: 0.75, range: 2.5, shot: 'fenix-tiro', hit: 'fuego-impacto', splash: 1.1, burn: 20, face: -1,
             desc: 'Llamaradas que arrasan una zona y dejan ardiendo.' },
  aurora:  { name: 'Aurora', title: 'Archimaga', el: 'arcano', rar: 'legendaria', dmg: 22, rate: 0.9, range: 2.7, shot: 'aurora-rayo', hit: 'rayo-impacto', chain: 4, stun: 0.1, face: 1,
             desc: 'Rayos que saltan entre cuatro y a veces aturden.' },
  titan:   { name: 'Titán', title: 'Gólem del Bosque', el: 'naturaleza', rar: 'legendaria', dmg: 85, rate: 0.45, range: 2, shot: 'titan-tiro', hit: 'canon-impacto', splash: 0.7, pierce: true, target: 'strong', face: -1,
             desc: 'Martillazos que ignoran la armadura. Va a por el más fuerte.' },
  valka:   { name: 'Valka', title: 'General de Acero', el: 'metal', rar: 'legendaria', dmg: 50, rate: 0.75, range: 2.5, shot: 'valka-tiro', hit: 'bala-impacto', army: 0.04, face: 1,
             desc: 'Un 4% más de daño por cada tropa que tengas en el mapa.' },
  boreas:  { name: 'Bóreas', title: 'Dragón del Invierno', el: 'hielo', rar: 'mitica', dmg: 32, rate: 0.85, range: 2.6, shot: 'hielo-bola', hit: 'hielo-impacto', splash: 1.0, slow: 0.3, freeze: 0.08, face: 1,
             desc: 'Aliento helado en zona que frena muchísimo y a veces congela.' },
  midas:   { name: 'Midas', title: 'Rey Dorado', el: 'metal', rar: 'mitica', dmg: 58, rate: 0.7, range: 2.6, shot: 'moneda', hit: 'bala-impacto', pierce: true, crit: 0.2, critX: 2.5, bounty: 3, spin: true, face: 1,
             desc: 'Monedas que atraviesan la armadura. Cada baja suya da 3 de maná.' },
  seren:   { name: 'Seren', title: 'Guardiana Astral', el: 'arcano', rar: 'mitica', dmg: 54, rate: 0.9, range: 2.7, shot: 'seren-tiro', hit: 'luz-impacto', execute: 0.25, face: 1,
             desc: 'Remata a cualquier monstruo que no sea jefe por debajo del 25%.' },
  pyra:    { name: 'Pyra', title: 'Reina de Ceniza', el: 'fuego', rar: 'mitica', dmg: 28, rate: 1.1, range: 2.3, shot: 'pyra-tiro', hit: 'fuego-impacto', embers: 4, spin: true, face: 1,
             desc: 'Cada golpe deja una ascua. Con 4, el monstruo estalla y pierde un 15% de su vida.' },
  garra:   { name: 'Garra', title: 'Domadora de Lobos', el: 'naturaleza', rar: 'mitica', dmg: 70, rate: 0.3, wolves: 3, face: 1,
             desc: 'No dispara: suelta lobos desde el castillo que corren por un camino y muerden a los monstruos que se cruzan.' }
};
var TROOP_ORDER = ['lyra', 'brasa', 'nivea', 'doblon', 'marea', 'rocco', 'volta', 'mirra', 'melodia', 'kaia', 'frida', 'hilda', 'elian', 'tilo',
  'sombra', 'cronos', 'halcon', 'eco', 'oria', 'ulric', 'fenix', 'aurora', 'titan', 'valka', 'boreas', 'midas', 'seren', 'pyra', 'garra'];
var DEFAULT_DECK = ['lyra', 'brasa', 'nivea', 'doblon', 'halcon'];
function isAttacker(id) { return !!TROOPS[id].dmg; }

/* Monstruos. hp: vida respecto a la de la oleada. speed: casillas por segundo. */
var MOBS = {
  blob:     { name: 'Gelatina', hp: 1, speed: 1.15, size: 0.62, reward: 6, from: 1 },
  orco:     { name: 'Orco', hp: 1.8, speed: 1.0, size: 0.72, reward: 9, from: 4 },
  ghost:    { name: 'Espectro', hp: 0.8, speed: 1.6, size: 0.6, reward: 7, dodge: 0.15, from: 6 },
  brute:    { name: 'Ogro', hp: 3.2, speed: 0.72, size: 0.82, reward: 14, armor: 0.25, from: 8 },
  escudado: { name: 'Ogro escudado', hp: 2.2, speed: 0.85, size: 0.8, reward: 13, barrier: 0.6, from: 12 },
  rocoso:   { name: 'Rocoso', hp: 4.4, speed: 0.6, size: 0.8, reward: 18, armor: 0.4, from: 15 },
  escarcha: { name: 'Gólem de escarcha', hp: 2.6, speed: 0.9, size: 0.78, reward: 13, slowRes: 0.6, from: 18 }
};
var BOSSES = {
  rey:    { name: 'Rey Gelatina', img: 'blob', hp: 26, speed: 0.55, size: 1.35, ability: 'split', desc: 'Al morir se parte en gelatinas.' },
  gelido: { name: 'Señor Gélido', img: 'gelido', hp: 24, speed: 0.56, size: 1.3, ability: 'freeze', desc: 'Congela tus tropas a ratos.' },
  coloso: { name: 'Coloso', img: 'coloso', hp: 32, speed: 0.46, size: 1.4, ability: 'shield', desc: 'Se blinda con un escudo cada poco.' },
  nigro:  { name: 'Nigromante', img: 'nigro', hp: 24, speed: 0.55, size: 1.3, ability: 'summon', desc: 'Llama espectros sin parar.' },
  dragon: { name: 'Dragón Carmesí', img: 'dragon', hp: 30, speed: 0.62, size: 1.4, ability: 'burn', desc: 'Quema una tropa, que pierde un rango.' }
};
var BOSS_ORDER = ['rey', 'gelido', 'coloso', 'nigro', 'dragon'];

/* Zonas del mapa. Cada una tiene sus losas (assets/tiles), su suelo y el
   elemento que pega más encima de sus losas. */
var BIOMES = {
  prado:   { name: 'Prado', el: 'naturaleza', slabs: ['bosque-1', 'bosque-2', 'bosque-3', 'bosque-4', 'bosque-5', 'bosque-6'],
             ground: ['#5fa83f', '#67b046'], spot: '#4f9535', fog: '#16301a', deco: 'tree' },
  hielo:   { name: 'Glaciar', el: 'hielo', slabs: ['hielo-1', 'hielo-2'],
             ground: ['#cfe5f1', '#d9edf6'], spot: '#b4d3e6', fog: '#1a2c44', deco: 'pine' },
  volcan:  { name: 'Volcán', el: 'fuego', slabs: ['lava-1', 'lava-2', 'lava-3', 'lava-4', 'lava-5', 'lava-6'],
             ground: ['#4a3631', '#523b34'], spot: '#3a2824', fog: '#2a1210', deco: 'ember' },
  pantano: { name: 'Pantano', el: 'arcano', slabs: ['veneno-1', 'veneno-2', 'veneno-3', 'veneno-4', 'veneno-5', 'veneno-6'],
             ground: ['#4d5b40', '#556447'], spot: '#3e4a33', fog: '#1c1830', deco: 'shroom' },
  ruinas:  { name: 'Ruinas', el: 'metal', slabs: ['musgo-1', 'musgo-2', 'musgo-3', 'piedra-1', 'piedra-2', 'piedra-3'],
             ground: ['#a6926d', '#ae9b77'], spot: '#8f7c5a', fog: '#2b2418', deco: 'rock' }
};
var BIOME_ORDER = ['prado', 'hielo', 'volcan', 'pantano', 'ruinas'];

/* Casillas especiales: salen a veces entre las losas nuevas. */
var SPECIALS = {
  altar:   { name: 'Altar', desc: 'La tropa de encima pega un 35% más.' },
  atalaya: { name: 'Atalaya', desc: 'La tropa de encima dispara un 30% más rápido.' },
  diana:   { name: 'Diana', desc: 'La tropa de encima llega un 50% más lejos.' },
  fuente:  { name: 'Fuente', desc: 'Con una tropa encima, te da maná cada 8 segundos.' }
};
var SPECIAL_ORDER = ['altar', 'atalaya', 'diana', 'fuente'];

/* Nombres de los mapas generados. */
var MAP_A = ['Valle', 'Marca', 'Llanura', 'Tierras', 'Cañada', 'Frontera', 'Vega', 'Páramo', 'Comarca', 'Senda'];
var MAP_B = ['de los Lobos', 'del Rey Perdido', 'de Ceniza', 'Helada', 'Susurrante', 'de las Brujas', 'del Alba', 'Sin Fin',
  'de los Gigantes', 'Dorada', 'de Niebla', 'del Dragón', 'Olvidada', 'de las Mil Torres', 'Esmeralda', 'del Eclipse'];

/* Comandantes: habilidad que se carga con el tiempo (cd en segundos). */
var COMMANDERS = {
  aria:    { name: 'Aria', skill: 'Ventisca', cd: 25, fx: 'ventisca', desc: 'Todos los monstruos van a la mitad de velocidad 5 segundos.' },
  brann:   { name: 'Brann', skill: 'Meteoro', cd: 30, fx: 'meteoro', desc: 'Siete meteoros caen sobre los monstruos más avanzados.' },
  merlo:   { name: 'Merlo', skill: 'Marea de maná', cd: 32, fx: 'ganancia-mana', desc: 'Te da 60 de maná y 8 más por oleada.' },
  nyx:     { name: 'Nyx', skill: 'Maldición', cd: 30, fx: 'nyx-maldicion', desc: 'Los monstruos reciben un 60% más de daño 8 segundos.' },
  sol:     { name: 'Sol', skill: 'Escudo divino', cd: 40, fx: 'sol-escudo', desc: 'No pierdes vidas en 8 segundos y los monstruos van más lentos.' },
  morgana: { name: 'Morgana', skill: 'Transmutación', cd: 30, fx: 'morgana-ensamblaje', desc: 'Fusiona sola dos tropas del mismo rango, aunque sean distintas.' },
  torvald: { name: 'Torvald', skill: 'Forja', cd: 45, fx: 'torvald-forja', desc: 'Sube un rango a tu tropa más baja.' }
};
var COMMANDER_ORDER = ['aria', 'brann', 'merlo', 'nyx', 'sol', 'morgana', 'torvald'];

/* Bendiciones: cada BLESS_EVERY oleadas eliges una de tres. max: veces que se puede coger. */
var BLESSINGS = [
  { id: 'el_fuego', icon: 'icons/fuego', name: 'Forja ardiente', desc: 'Tropas de fuego: +30% de daño.', max: 5 },
  { id: 'el_hielo', icon: 'icons/hielo', name: 'Invierno largo', desc: 'Tropas de hielo: +30% de daño.', max: 5 },
  { id: 'el_naturaleza', icon: 'icons/hoja', name: 'Savia viva', desc: 'Tropas de naturaleza: +30% de daño.', max: 5 },
  { id: 'el_arcano', icon: 'icons/arcano', name: 'Runas antiguas', desc: 'Tropas arcanas: +30% de daño.', max: 5 },
  { id: 'el_metal', icon: 'icons/engranaje', name: 'Acero templado', desc: 'Tropas de metal: +30% de daño.', max: 5 },
  { id: 'rate', icon: 'icons/rapido', name: 'Tambores de guerra', desc: 'Todas disparan un 15% más rápido.', max: 4 },
  { id: 'range', icon: 'icons/diana', name: 'Catalejos', desc: 'Todas llegan un 15% más lejos.', max: 3 },
  { id: 'cheap', icon: 'icons/gota', name: 'Invocación barata', desc: 'Invocar cuesta 5 de maná menos.', max: 3 },
  { id: 'lucky', icon: 'icons/dado', name: 'Buena estrella', desc: 'Un 15% de las invocaciones salen con rango 2.', max: 3 },
  { id: 'double', icon: 'icons/estrella', name: 'Fusión prodigiosa', desc: 'Un 10% de las fusiones suben dos rangos.', max: 3 },
  { id: 'bounty', icon: 'icons/moneda', name: 'Botín', desc: 'Un 30% más de maná por cada baja.', max: 3 },
  { id: 'crit', icon: 'icons/critico', name: 'Ojo certero', desc: 'Todas: +10% de crítico doble.', max: 3 },
  { id: 'interest', icon: 'icons/gema', name: 'Intereses', desc: 'Al empezar cada oleada, un 10% de tu maná guardado, con un máximo de 80.', max: 2 },
  { id: 'lives', icon: 'icons/escudo', name: 'Murallas', desc: 'Tres vidas más.', max: 3 },
  { id: 'boss', icon: 'icons/corona', name: 'Cazajefes', desc: 'Los jefes reciben un 35% más de daño.', max: 3 },
  { id: 'slow', icon: 'icons/reloj', name: 'Barro', desc: 'Los monstruos van un 8% más lentos.', max: 3 },
  { id: 'native', icon: 'icons/hoja', name: 'Raíces', desc: 'El extra de daño en las losas de tu elemento sube un 20% más.', max: 2 },
  { id: 'cmd', icon: 'icons/chispas', name: 'Mando', desc: 'La habilidad del comandante se carga un 25% antes.', max: 2 },
  { id: 'power', icon: 'icons/mejorar', name: 'Instrucción', desc: 'Las mejoras de partida cuestan un 25% menos.', max: 2 }
];
