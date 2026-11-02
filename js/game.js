/* Fronteras del Reino: motor de la partida (tropas, oleadas, combate, cámara y dibujo). */
'use strict';

var IMG = {}, imgEpoch = 0;
function img(p) {
  var im = IMG[p];
  if (!im) {
    im = IMG[p] = new Image();
    im.onload = function () { imgEpoch++; if (G && G.map && G.map.missing) G.map.dirty = true; };
    im.src = 'assets/' + p + '.webp';
  }
  return im;
}
function ready(im) { return im && im.complete && im.naturalWidth > 0; }
function preloadRun(deck, cmd) {
  img('boards/camino'); img('ui/portal-entrada'); img('ui/portal-salida');
  BIOME_ORDER.forEach(function (b) { BIOMES[b].slabs.forEach(function (s) { img('tiles/' + s); }); });
  SPECIAL_ORDER.forEach(function (s) { img('tiles/' + s); });
  for (var r = 1; r <= 12; r++) img('tiles/roca-' + r);
  deck.forEach(function (id) { preloadTroop(id); });
  Object.keys(MOBS).forEach(function (m) { img('enemies/' + m); });
  BOSS_ORDER.forEach(function (b) { img('enemies/' + BOSSES[b].img); });
  ['muerte-puf', 'muerte-estallido', 'fusion', 'fusion-eco', 'invocar', 'estado-helado', 'estado-veneno', 'estado-aturdido', 'estado-quemado', 'estado-enredado', 'estado-ascuas',
    'ganancia-mana', 'acelerar', 'mover', 'garra-lobo', 'garra-lobo-2', 'oria-interes', COMMANDERS[cmd].fx].forEach(function (f) { img('fx/' + f); });
}
function preloadTroop(id) {
  var T = TROOPS[id];
  img('units/board/' + id + '-idle'); img('units/board/' + id + '-attack');
  if (T.shot) img('fx/' + T.shot); if (T.hit) img('fx/' + T.hit);
}

function mulberry(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

var G = null;
var canvas, ctx, VIEW = { w: 0, h: 0, dpr: 1 };

/* ---------- partida ---------- */
function newRun(opts) {
  var seed = opts.seed || (10000 + Math.floor(Math.random() * 90000));
  G = {
    mode: opts.mode, seed: seed, rng: mulberry(seed * 7 + 13),
    map: new WorldMap(seed), deck: opts.deck.slice(), cmd: opts.cmd,
    units: {},
    mana: START_MANA, lives: START_LIVES, wave: 0, summons: 0,
    state: 'countdown', timer: 10, spawnList: [], spawnT: 0, sinceSpawnEnd: 0, spawnHead: 0,
    mobs: [], shots: [], fxs: [], texts: [], beams: [], wolves: [],
    power: {}, bless: {}, cmdT: 0,
    fx: { slowAll: 0, curse: 0, shield: 0 },
    kills: 0, time: 0, dmgBy: {}, speed: 1, paused: false, over: false, boss: null,
    sel: null, selSlab: null, drag: null, overlay: false,
    cam: { x: 0, y: 0, z: 0.5 }, follow: true, camInit: false
  };
  G.cs = G.cw = G.ch = TS;
  G.deck.forEach(function (id) { G.power[id] = 1; G.dmgBy[id] = 0; });
  preloadRun(G.deck, G.cmd);
  if (opts.resume) restore(opts.resume);
  return G;
}

function tileOf(k) { return G.map.tiles[k]; }
function tileXY(k) { var t = G.map.tiles[k]; return { x: t.x * TS, y: t.y * TS }; }
function neighborUnits(k) {
  var t = tileOf(k), out = [];
  for (var i = 0; i < 8; i++) { var u = G.units[tkey(t.x + D8[i][0], t.y + D8[i][1])]; if (u) out.push(u); }
  return out;
}
function unitCount() { return Object.keys(G.units).length; }
function eachUnit(fn) { for (var k in G.units) fn(G.units[k], k); }
function bl(id) { return G.bless[id] || 0; }
function isFreeSlab(k) { var t = k && G.map.tiles[k]; return !!(t && t.kind === 'slab' && !G.units[k]); }
function freeSlabs() { var out = []; for (var k in G.map.tiles) if (isFreeSlab(k)) out.push(k); return out; }

function summonCost() { return Math.max(5, SUMMON_BASE + SUMMON_STEP * unitCount() - 5 * bl('cheap')); }
function powerCost(id) {
  var lv = G.power[id];
  if (lv >= 5) return 0;
  return Math.round(POWER_COSTS[lv + 1] * (1 - 0.25 * bl('power')));
}
function waveHP(w) { return 36 * Math.pow(1.15, w - 1) * (w > 20 ? Math.pow(1.03, w - 20) : 1); }

function makeUnit(id, rank, k) {
  var t = tileOf(k);
  return { id: id, rank: rank, k: k, x: t.x * TS, y: t.y * TS, cd: 0.3 + Math.random() * 0.5, atk: 0, frozen: 0, gen: 0, face: 1, pop: 0.35 };
}
function placeUnit(u, k) { var t = tileOf(k); u.k = k; u.x = t.x * TS; u.y = t.y * TS; G.units[k] = u; }

// mejor losa libre: la que tiene más camino a su alcance (y más cerca del castillo)
function bestSlab() {
  var list = freeSlabs(), best = null, bv = -1, R = 2.4;
  list.forEach(function (k) {
    var t = tileOf(k), v = 0;
    G.map.pathList.forEach(function (p) {
      var d = Math.hypot(p.x - t.x, p.y - t.y);
      if (d <= R) v += 1 + 6 / (6 + p.d);
    });
    if (Math.hypot(t.x, t.y) <= R + 0.5) v += 2;
    v += G.rng() * 0.3;
    if (v > bv) { bv = v; best = k; }
  });
  return best;
}

function summon() {
  var cost = summonCost();
  if (G.mana < cost || G.over) return false;
  var k = isFreeSlab(G.selSlab) ? G.selSlab : bestSlab();
  if (!k) { toast('No quedan losas libres: fusiona tropas'); return false; }
  G.mana -= cost; G.summons++;
  var id = G.deck[(G.rng() * G.deck.length) | 0];
  var rank = G.rng() < 0.15 * bl('lucky') ? 2 : 1;
  G.units[k] = makeUnit(id, rank, k);
  G.selSlab = null;
  var p = tileXY(k);
  addFx('invocar', p.x, p.y, TS * 1.1, 0.45);
  sfx('summon');
  return true;
}

function canMerge(a, b) {
  var A = G.units[a], B = G.units[b];
  if (!A || !B || a === b || A.rank !== B.rank || A.rank >= MAX_RANK) return false;
  return A.id === B.id || A.id === 'eco' || B.id === 'eco';
}
function merge(a, b, any) {
  var A = G.units[a], B = G.units[b];
  var up = 1, eco = A.id === 'eco' || B.id === 'eco';
  if (G.rng() < 0.1 * bl('double')) up = 2;
  if (eco && A.id !== B.id && G.rng() < TROOPS.eco.wild) up = 2;
  var rank = Math.min(MAX_RANK, A.rank + up);
  var id = any ? G.deck[(G.rng() * G.deck.length) | 0] : (B.id === 'eco' ? A.id : B.id);
  delete G.units[a];
  G.units[b] = makeUnit(id, rank, b);
  if (G.sel === a) G.sel = b;
  var p = tileXY(b);
  addFx(eco ? 'fusion-eco' : 'fusion', p.x, p.y, TS * 1.3, 0.5);
  if (up === 2) floatText(p.x, p.y - TS * 0.6, '¡Doble!', '#ffd84a', 1);
  sfx('merge');
}
function moveUnit(a, b) {
  var A = G.units[a], B = G.units[b];
  delete G.units[a];
  if (B) { delete G.units[b]; placeUnit(B, a); }
  placeUnit(A, b);
  A.pop = 0.2;
  var p = tileXY(b); addFx('mover', p.x, p.y, TS * 0.9, 0.35);
  if (G.sel === a) G.sel = b;
  sfx('tap');
}
function powerUp(id) {
  var cost = powerCost(id);
  if (!cost || G.mana < cost) return false;
  G.mana -= cost; G.power[id]++;
  eachUnit(function (u) { if (u.id === id) addFx('acelerar', u.x, u.y, TS * 0.9, 0.5); });
  sfx('power');
  return true;
}

/* ---------- el mapa crece ---------- */
function expandMap() {
  var r = G.map.expand();
  // tropas que estaban donde ahora pasa el camino: a la losa libre más cercana
  r.lost.forEach(function (k) {
    var u = G.units[k];
    if (!u) return;
    delete G.units[k];
    var t = tileOf(k), best = null, bd = 1e9;
    freeSlabs().forEach(function (f) { var ft = tileOf(f), d = Math.hypot(ft.x - t.x, ft.y - t.y); if (d < bd) { bd = d; best = f; } });
    if (best) { placeUnit(u, best); u.pop = 0.3; toast(TROOPS[u.id].name + ' se aparta del camino nuevo'); }
    else { G.mana += SUMMON_BASE * u.rank; toast(TROOPS[u.id].name + ' vuelve al castillo: te devuelve maná'); }
  });
  if (G.sel && !G.units[G.sel]) G.sel = null;
  if (G.selSlab && !isFreeSlab(G.selSlab)) G.selSlab = null;
  G.expandFx = { t: 0, tiles: r.made.map(function (t) { return t.k; }) };
  var now = G.time;
  G.map.born.forEach(function (k) { G.reveal[k] = now; });
  G.map.born = [];
  return r;
}

/* ---------- oleadas ---------- */
function buildWave(w) {
  var list = [], n = Math.min(8 + Math.floor(w * 1.3), 44), hp = waveHP(w);
  var pool = Object.keys(MOBS).filter(function (k) { return MOBS[k].from <= w; });
  var isBoss = w % BOSS_EVERY === 0;
  if (isBoss) n = Math.round(n * 0.5);
  for (var i = 0; i < n; i++) {
    var k = i < 2 || G.rng() < 0.35 ? 'blob' : pool[(G.rng() * pool.length) | 0];
    list.push({ k: k, hp: hp * MOBS[k].hp });
  }
  if (isBoss) {
    var bk = BOSS_ORDER[(w / BOSS_EVERY - 1) % BOSS_ORDER.length];
    // el jefe sale por el camino más largo
    var far = 0; G.map.routes.forEach(function (r, i) { if (r.len > G.map.routes[far].len) far = i; });
    list.splice(Math.floor(n / 2), 0, { boss: bk, head: far, hp: hp * BOSSES[bk].hp * (1 + Math.floor(w / 50) * 0.5) });
  }
  return list;
}
function startWave() {
  G.wave++;
  G.spawnList = buildWave(G.wave);
  G.spawnT = 0; G.sinceSpawnEnd = 0;
  G.state = 'spawning';
  if (bl('interest')) {
    var gain = Math.min(80 * bl('interest'), Math.floor(G.mana * 0.1 * bl('interest')));
    if (gain > 0) { G.mana += gain; toast('Intereses: +' + gain + ' de maná'); }
  }
  banner(G.wave % BOSS_EVERY === 0 ? 'Oleada ' + G.wave + ': ¡jefe!' : 'Oleada ' + G.wave);
  if (G.wave % BOSS_EVERY === 0) sfx('boss'); else sfx('wave');
}
function spawnMob(e, route) {
  var m;
  if (!route) {
    var hi = e.head != null ? e.head : (G.spawnHead++ % G.map.routes.length);
    route = G.map.routes[hi % G.map.routes.length];
  }
  if (e.boss) {
    var b = BOSSES[e.boss];
    m = { k: b.img, boss: e.boss, name: b.name, hp: e.hp, max: e.hp, speed: b.speed, size: b.size, reward: 60 + G.wave * 3, abT: 4, armor: 0, dodge: 0, slowRes: 0 };
    G.boss = m;
  } else {
    var t = MOBS[e.k];
    m = { k: e.k, hp: e.hp, max: e.hp, speed: t.speed, size: t.size, reward: t.reward, armor: t.armor || 0, dodge: t.dodge || 0, slowRes: t.slowRes || 0 };
    if (t.barrier) m.barrier = m.barrierMax = e.hp * t.barrier;
  }
  m.route = route;
  m.d = e.d || 0; m.slow = 0; m.slowT = 0; m.stun = 0; m.poison = 0; m.poisonT = 0; m.burn = 0; m.burnT = 0; m.acid = 0; m.acidPct = 0;
  m.thorn = 0; m.embers = 0; m.pushes = 0; m.hitT = 0; m.shield = 0; m.dead = false; m.bob = Math.random() * 6;
  mobPos(m);
  G.mobs.push(m);
  return m;
}
function mobPos(m) { var p = routePos(m.route, m.d); m.x = p.x; m.y = p.y; m.dx = p.dx; m.dy = p.dy; }

/* ---------- daño ---------- */
function unitStats(u) {
  var T = TROOPS[u.id], pw = G.power[u.id] || 1, t = tileOf(u.k);
  var dmg = (T.dmg || 0) * RANK_MULT[u.rank] * (1 + POWER_BONUS * (pw - 1));
  dmg *= 1 + 0.3 * bl('el_' + T.el);
  var native = BIOMES[t.biome].el === T.el;
  if (native) dmg *= 1 + BIOME_BONUS * (1 + bl('native'));
  var rate = (T.rate || 0) * (1 + 0.05 * (u.rank - 1)) * (1 + 0.15 * bl('rate'));
  var range = ((T.range || 2) + RANGE_PER_RANK * (u.rank - 1)) * (1 + 0.15 * bl('range'));
  if (t.special === 'altar') dmg *= 1.35;
  if (t.special === 'atalaya') rate *= 1.3;
  if (t.special === 'diana') range *= 1.5;
  var crit = (T.crit || 0) + 0.1 * bl('crit'), critX = T.critX || 2, acid = 0;
  var near = neighborUnits(u.k);
  near.forEach(function (v) {
    var V = TROOPS[v.id], vp = 1 + 0.1 * ((G.power[v.id] || 1) - 1);
    if (V.buff === 'speed') rate *= 1 + (V.buffVal + 0.04 * (v.rank - 1)) * vp;
    if (V.buff === 'dmg') dmg *= 1 + (V.buffVal + 0.05 * (v.rank - 1)) * vp;
    if (V.buff === 'crit') crit += (V.buffVal + 0.03 * (v.rank - 1)) * vp;
    if (V.buff === 'acid') acid = Math.max(acid, V.buffVal * v.rank * vp);
  });
  if (T.lone && !near.length) dmg *= 1 + T.lone;
  if (T.army) dmg *= 1 + T.army * unitCount();
  return { dmg: dmg, rate: rate, range: range, crit: Math.min(crit, 0.9), critX: critX, acid: acid, native: native };
}

function pickTarget(u, T, R) {
  var best = null, bv = -Infinity, R2 = R * R * TS * TS;
  for (var i = 0; i < G.mobs.length; i++) {
    var m = G.mobs[i];
    if (m.dead || m.d < TS * 0.3) continue;
    var dx = m.x - u.x, dy = m.y - u.y;
    if (dx * dx + dy * dy > R2) continue;
    var v = T.target === 'strong' ? m.hp : m.d - m.route.len;
    if (v > bv) { bv = v; best = m; }
  }
  return best;
}
function mobXY(m) { return { x: m.x, y: m.y - TS * 0.18 }; }

function hurt(m, amount, src, opts) {
  if (m.dead) return 0;
  opts = opts || {};
  if (!opts.pure && m.dodge && Math.random() < m.dodge) { floatText(m.x, m.y - TS * 0.6, 'Esquiva', '#cfd8ff', 0.7); return 0; }
  var d = amount;
  if (!opts.pierce && m.armor && !(m.acid > 0)) d *= 1 - m.armor;
  if (m.acid > 0) d *= 1 + m.acidPct;
  if (G.fx.curse > 0) d *= 1.6;
  if (m.thorn > 0) d *= 1.2;
  if (m.boss) { d *= 1 + 0.35 * bl('boss'); if (opts.bossX) d *= opts.bossX; }
  if (m.shield > 0) d *= 0.2;
  if (m.barrier > 0) { var a = Math.min(m.barrier, d); m.barrier -= a; d -= a; }
  m.hp -= d; m.hitT = 0.12;
  if (src && G.dmgBy[src] != null) G.dmgBy[src] += d;
  if (SETTINGS.numbers && !opts.quiet && d >= 1) floatText(m.x + (Math.random() - 0.5) * TS * 0.3, m.y - TS * 0.7 + (Math.random() - 0.5) * TS * 0.2, fmt(d), opts.crit ? '#ffd84a' : '#ffffff', opts.crit ? 0.9 : 0.6);
  if (m.hp <= 0) kill(m, src);
  return d;
}
function kill(m, src) {
  if (m.dead) return;
  m.dead = true; m.hp = 0;
  G.kills++;
  var gain = Math.round(m.reward * (1 + G.wave * 0.04) * (1 + 0.3 * bl('bounty')));
  if (src === 'midas') gain += TROOPS.midas.bounty;
  G.mana += gain;
  var p = mobXY(m);
  addFx(m.boss ? 'muerte-estallido' : 'muerte-puf', p.x, p.y, TS * (m.boss ? 2 : 0.9), 0.5);
  if (m.boss) {
    banner('¡' + m.name + ' derrotado!');
    sfx('bossdown');
    if (m.boss === 'rey') for (var i = 0; i < 6; i++) spawnMob({ k: 'blob', hp: waveHP(G.wave) * 1.5, d: Math.max(0, m.d - i * TS * 0.35) }, m.route);
    if (G.boss === m) G.boss = null;
  } else sfx('kill');
}

function hitTarget(s) {
  var T = TROOPS[s.id], m = s.target, pos = { x: s.x, y: s.y };
  var opts = { pierce: T.pierce, bossX: T.boss, crit: s.crit };
  if (T.chain) {
    var chainN = T.chain + Math.floor((s.rank - 1) / 2), hitList = [m], cur = m, dmg = s.dmg;
    if (!m.dead) applyHit(m, dmg, s, opts);
    for (var c = 1; c < chainN; c++) {
      var cp = mobXY(cur), next = null, nd = TS * 2.2;
      G.mobs.forEach(function (o) {
        if (o.dead || hitList.indexOf(o) !== -1) return;
        var op = mobXY(o), dd = Math.hypot(op.x - cp.x, op.y - cp.y);
        if (dd < nd) { nd = dd; next = o; }
      });
      if (!next) break;
      var np = mobXY(next);
      G.beams.push({ x1: cp.x, y1: cp.y, x2: np.x, y2: np.y, t: 0.2, c: s.id === 'aurora' ? '#ffd1ff' : '#c9b8ff' });
      dmg *= 0.85; hitList.push(next); cur = next;
      applyHit(next, dmg, s, opts);
    }
  } else if (T.splash) {
    var r = T.splash * TS;
    G.mobs.forEach(function (o) {
      if (o.dead) return;
      var op = mobXY(o), dd = Math.hypot(op.x - pos.x, op.y - pos.y);
      if (dd <= r) applyHit(o, o === m ? s.dmg : s.dmg * 0.6, s, Object.assign({}, opts, { quiet: o !== m }));
    });
  } else if (!m.dead) applyHit(m, s.dmg, s, opts);
  if (T.hit) addFx(T.hit, pos.x, pos.y, TS * (T.splash ? T.splash * 1.4 : 0.7), 0.3);
}
function applyHit(m, dmg, s, opts) {
  var T = TROOPS[s.id];
  if (s.acid) { m.acid = 3; m.acidPct = Math.max(m.acid > 0 ? m.acidPct : 0, s.acid); }
  if (T.poison) { m.poison = Math.max(m.poison, T.poison * RANK_MULT[s.rank] * (1 + POWER_BONUS * ((G.power[s.id] || 1) - 1))); m.poisonT = 4; m.poisonSrc = s.id; }
  if (T.burn) { m.burn = Math.max(m.burn, T.burn * RANK_MULT[s.rank]); m.burnT = 3; m.burnSrc = s.id; }
  if (T.slow) { var cap = s.id === 'boreas' ? 0.65 : 0.5; m.slow = Math.min(cap, m.slow + T.slow * (1 - m.slowRes)); m.slowT = 2.5; }
  if (T.freeze && Math.random() < T.freeze) m.stun = Math.max(m.stun, m.boss ? 0.4 : 1.2);
  if (T.stun && Math.random() < T.stun * (1 + 0.1 * (s.rank - 1))) m.stun = Math.max(m.stun, m.boss ? 0.3 : 0.8);
  if (T.thorns) m.thorn = 3;
  if (T.push && !m.boss && m.pushes < 3) { m.d = Math.max(0, m.d - T.push * TS * (1 + 0.1 * (s.rank - 1))); m.pushes++; mobPos(m); }
  hurt(m, dmg, s.id, opts);
  if (m.dead) return;
  if (T.embers) {
    m.embers++;
    if (m.embers >= T.embers) { m.embers = 0; hurt(m, m.hp * (m.boss ? 0.05 : 0.15), s.id, { pure: true, pierce: true }); var p = mobXY(m); addFx('fuego-impacto', p.x, p.y, TS, 0.4); }
  }
  if (T.execute && !m.boss && !m.dead && m.hp < m.max * T.execute) hurt(m, m.hp + 1, s.id, { pure: true, pierce: true, quiet: true });
}

/* ---------- habilidades ---------- */
function cmdReady() { return G.cmdT >= COMMANDERS[G.cmd].cd; }
function useCommander() {
  if (!G || !cmdReady() || G.over || G.paused || G.overlay) return;
  var C = COMMANDERS[G.cmd];
  G.cmdT = 0;
  var c = { x: 0, y: 0 };
  switch (G.cmd) {
    case 'aria': G.fx.slowAll = 5; addFx('ventisca', c.x, c.y, TS * 5, 1); break;
    case 'brann':
      var list = G.mobs.filter(function (m) { return !m.dead; }).sort(function (a, b) { return (b.d - b.route.len) - (a.d - a.route.len); }).slice(0, 7);
      list.forEach(function (m, k) {
        G.fxs.push({ delay: k * 0.12, call: function () {
          if (m.dead) return; var p = mobXY(m);
          addFx('meteoro', p.x, p.y, TS * 1.3, 0.5);
          hurt(m, m.boss ? waveHP(G.wave) * 4 : Math.max(m.max * 0.45, waveHP(G.wave) * 2.5), null, { pierce: true });
        } });
      });
      break;
    case 'merlo': var g = 60 + 8 * G.wave; G.mana += g; floatText(c.x, c.y - TS * 0.8, '+' + g + ' de maná', '#7fd6ff', 1.2); addFx('ganancia-mana', c.x, c.y, TS * 1.4, 0.8); break;
    case 'nyx': G.fx.curse = 8; G.mobs.forEach(function (m) { if (!m.dead) addFx('nyx-maldicion', m.x, m.y, TS * 0.8, 0.6); }); break;
    case 'sol': G.fx.shield = 8; break;
    case 'morgana':
      var groups = {};
      eachUnit(function (u, k) { if (u.rank < MAX_RANK) (groups[u.rank] = groups[u.rank] || []).push(k); });
      var ranks = Object.keys(groups).filter(function (r) { return groups[r].length >= 2; }).map(Number).sort(function (a, b) { return a - b; });
      if (!ranks.length) { toast('No hay dos tropas del mismo rango'); G.cmdT = C.cd; return; }
      var gr = groups[ranks[0]];
      var p1 = tileXY(gr[1]); addFx('morgana-ensamblaje', p1.x, p1.y, TS * 1.4, 0.7);
      merge(gr[0], gr[1], true);
      break;
    case 'torvald':
      var low = null;
      eachUnit(function (u) { if (u.rank < 6 && (!low || u.rank < low.rank)) low = u; });
      if (!low) { toast('No hay tropas que forjar'); G.cmdT = C.cd; return; }
      low.rank++;
      addFx('torvald-forja', low.x, low.y - TS * 0.2, TS * 1.2, 0.8);
      break;
  }
  banner(C.skill);
  sfx('skill');
}

/* ---------- bucle ---------- */
function update(dt) {
  if (G.paused || G.over || G.overlay) return;
  G.time += dt;
  var cmdRate = 1 + 0.25 * bl('cmd');
  if (G.cmdT < COMMANDERS[G.cmd].cd) G.cmdT = Math.min(COMMANDERS[G.cmd].cd, G.cmdT + dt * cmdRate);
  for (var k in G.fx) if (G.fx[k] > 0) G.fx[k] = Math.max(0, G.fx[k] - dt);
  if (G.expandFx) { G.expandFx.t += dt; if (G.expandFx.t > 2) G.expandFx = null; }

  // oleadas
  if (G.state === 'countdown') {
    G.timer -= dt;
    if (G.timer <= 0) startWave();
  } else if (G.state === 'spawning') {
    G.spawnT -= dt;
    if (G.spawnList.length && G.spawnT <= 0) {
      spawnMob(G.spawnList.shift());
      G.spawnT = Math.max(0.36, 0.85 - G.wave * 0.012) / Math.sqrt(G.map.routes.length);
    }
    if (!G.spawnList.length) {
      G.sinceSpawnEnd += dt;
      var alive = G.mobs.some(function (m) { return !m.dead; });
      var bless = G.wave % BLESS_EVERY === 0;
      if (!alive || (!bless && G.sinceSpawnEnd > 14)) endWave();
    }
  }

  // tropas
  eachUnit(function (u) {
    if (u.pop > 0) u.pop = Math.max(0, u.pop - dt);
    if (u.atk > 0) u.atk -= dt;
    if (u.frozen > 0) { u.frozen -= dt; return; }
    var T = TROOPS[u.id], t = tileOf(u.k);
    if (t.special === 'fuente') {
      u.font = (u.font || 0) + dt;
      if (u.font >= 8) { u.font = 0; var fg = 5 + 3 * u.rank; G.mana += fg; floatText(u.x, u.y - TS * 0.7, '+' + fg, '#7fd6ff', 0.9); addFx('ganancia-mana', u.x, u.y - TS * 0.2, TS * 0.6, 0.5); }
    }
    if (T.mana) {
      u.gen += dt;
      if (u.gen >= T.every) {
        u.gen = 0;
        var g = Math.round(T.mana * u.rank * (1 + 0.15 * ((G.power[u.id] || 1) - 1)));
        G.mana += g;
        floatText(u.x, u.y - TS * 0.55, '+' + g, '#7fd6ff', 0.9);
        addFx('ganancia-mana', u.x, u.y - TS * 0.2, TS * 0.6, 0.5);
      }
      return;
    }
    if (T.interest) {
      u.gen += dt;
      if (u.gen >= T.every) {
        u.gen = 0;
        var cap = 12 * u.rank * (1 + 0.15 * ((G.power[u.id] || 1) - 1));
        var gi = Math.floor(Math.min(cap, G.mana * T.interest * (1 + 0.1 * (u.rank - 1))));
        if (gi > 0) { G.mana += gi; floatText(u.x, u.y - TS * 0.55, '+' + gi, '#ffe27a', 0.9); addFx('oria-interes', u.x, u.y - TS * 0.3, TS * 0.7, 0.5); }
      }
      return;
    }
    if (!T.dmg) return;
    u.cd -= dt;
    if (u.cd > 0) return;
    var st = unitStats(u);
    if (T.wolves) {
      if (!G.mobs.some(function (m) { return !m.dead; })) { u.cd = 0.3; return; }
      u.cd = 1 / st.rate; u.atk = 0.3;
      releaseWolf(u, st);
      return;
    }
    var tg = pickTarget(u, T, st.range);
    if (!tg) { u.cd = 0.08; return; }
    u.cd = 1 / st.rate;
    var crit = Math.random() < st.crit;
    var tp = mobXY(tg), sx = u.x, sy = u.y - TS * 0.25;
    u.atk = 0.18; u.face = tp.x - sx >= 0 ? 1 : -1;
    G.shots.push({ id: u.id, rank: u.rank, x: sx, y: sy, target: tg, tx: tp.x, ty: tp.y, dmg: st.dmg * (crit ? st.critX : 1), crit: crit, acid: st.acid, spin: 0 });
    if (Math.random() < 0.25) sfx('shot');
  });

  // proyectiles
  var spd = TS * 11 * dt;
  G.shots = G.shots.filter(function (s) {
    if (!s.target.dead) { var tp = mobXY(s.target); s.tx = tp.x; s.ty = tp.y; }
    var dx = s.tx - s.x, dy = s.ty - s.y, d = Math.hypot(dx, dy);
    s.ang = Math.atan2(dy, dx); s.spin += dt * 12;
    if (d <= spd) {
      s.x = s.tx; s.y = s.ty;
      if (!s.target.dead || TROOPS[s.id].splash) hitTarget(s);
      return false;
    }
    s.x += dx / d * spd; s.y += dy / d * spd;
    return true;
  });

  // lobos de Garra
  G.wolves = G.wolves.filter(function (w) {
    w.d += TS * 2.4 * dt;
    var p = routePos(w.route, w.d);
    w.x = p.x; w.y = p.y; w.dir = p.dx;
    for (var i = 0; i < G.mobs.length && w.bites > 0; i++) {
      var m = G.mobs[i];
      if (m.dead || w.hit.indexOf(m) !== -1) continue;
      if (Math.hypot(m.x - w.x, m.y - w.y) < TS * 0.45) {
        w.hit.push(m); w.bites -= m.boss ? 2 : 1;
        hurt(m, w.dmg, 'garra', { crit: false });
        addFx('garra-espiritu', m.x, m.y - TS * 0.2, TS * 0.7, 0.3);
      }
    }
    return w.bites > 0 && w.d < w.route.len;
  });

  // monstruos
  var slowAll = (G.fx.slowAll > 0 ? 0.5 : 0) + (G.fx.shield > 0 ? 0.35 : 0) + 0.08 * bl('slow');
  G.mobs.forEach(function (m) {
    if (m.dead) return;
    m.hitT = Math.max(0, m.hitT - dt);
    if (m.slowT > 0) { m.slowT -= dt; if (m.slowT <= 0) m.slow = 0; }
    if (m.thorn > 0) m.thorn -= dt;
    if (m.acid > 0) m.acid -= dt;
    if (m.shield > 0) m.shield -= dt;
    if (m.poisonT > 0) { m.poisonT -= dt; hurt(m, m.poison * dt, m.poisonSrc, { pure: true, pierce: true, quiet: true }); }
    if (m.burnT > 0 && !m.dead) { m.burnT -= dt; hurt(m, m.burn * dt, m.burnSrc, { pure: true, pierce: true, quiet: true }); }
    if (m.dead) return;
    if (m.boss) bossAbility(m, dt);
    if (m.stun > 0) { m.stun -= dt; return; }
    var sp = m.speed * TS * (1 - Math.min(0.8, m.slow + slowAll));
    m.d += sp * dt;
    mobPos(m);
    if (m.d >= m.route.len) {
      m.dead = true;
      if (G.boss === m) G.boss = null;
      if (G.fx.shield > 0) { floatText(0, -TS * 0.6, 'Bloqueado', '#ffe27a', 1); return; }
      var loss = m.boss ? 5 : 1;
      G.lives -= loss;
      flash();
      sfx('leak');
      if (G.lives <= 0) { G.lives = 0; gameOver(); }
    }
  });
  G.mobs = G.mobs.filter(function (m) { return !m.dead; });

  // efectos
  G.fxs = G.fxs.filter(function (f) {
    if (f.delay != null) { f.delay -= dt; if (f.delay <= 0) { f.call(); return false; } return true; }
    f.t += dt; return f.t < f.life;
  });
  G.texts = G.texts.filter(function (t) { t.t += dt; t.rise += dt * 40; return t.t < t.life; });
  G.beams = G.beams.filter(function (b) { b.t -= dt; return b.t > 0; });
}

function releaseWolf(u, st) {
  var rs = G.map.routes;
  // al camino que más monstruos tiene
  var count = rs.map(function () { return 0; });
  G.mobs.forEach(function (m) { if (!m.dead) { var i = rs.indexOf(m.route); if (i >= 0) count[i]++; } });
  var bi = 0; count.forEach(function (c, i) { if (c > count[bi]) bi = i; });
  var r = rs[bi];
  if (!count[bi]) { var mob = G.mobs.filter(function (m) { return !m.dead; })[0]; r = mob.route; }
  var segs = [], total = 0, src = r.segs;
  for (var i = src.length - 1; i >= 0; i--) { segs.push({ a: src[i].b, b: src[i].a, l: src[i].l, s: total }); total += src[i].l; }
  var bites = TROOPS.garra.wolves + Math.floor((u.rank - 1) / 2);
  G.wolves.push({ route: { segs: segs, len: total }, d: 0, x: 0, y: 0, dir: 1, bites: bites, dmg: st.dmg, hit: [], pic: Math.random() < 0.5 ? 'garra-lobo' : 'garra-lobo-2' });
  addFx('garra-espiritu', 0, 0, TS * 0.8, 0.4);
}

function bossAbility(m, dt) {
  m.abT -= dt;
  if (m.abT > 0) return;
  var p = mobXY(m);
  switch (m.boss) {
    case 'gelido':
      m.abT = 7;
      var us = []; eachUnit(function (u) { if (TROOPS[u.id].dmg) us.push(u); });
      for (var k = 0; k < 2 && us.length; k++) {
        var u = us.splice((Math.random() * us.length) | 0, 1)[0];
        u.frozen = 3; addFx('hielo-impacto', u.x, u.y, TS, 0.5);
      }
      toast('El Señor Gélido congela tus tropas');
      break;
    case 'coloso': m.abT = 8; m.shield = 3; break;
    case 'nigro':
      m.abT = 5;
      for (var j = 0; j < 3; j++) spawnMob({ k: 'ghost', hp: waveHP(G.wave) * 0.8, d: Math.max(0, m.d - (j + 1) * TS * 0.4) }, m.route);
      addFx('nyx-maldicion', p.x, p.y + TS * 0.3, TS * 1.3, 0.6);
      break;
    case 'dragon':
      m.abT = 9;
      var hi = []; eachUnit(function (u) { if (u.rank > 1) hi.push(u); });
      if (hi.length) {
        var t = hi[(Math.random() * hi.length) | 0];
        t.rank--; addFx('fuego-impacto', t.x, t.y, TS * 1.2, 0.6);
        toast('El dragón quema una tropa: baja un rango');
      }
      break;
    default: m.abT = 99;
  }
}

function endWave() {
  G.state = 'countdown';
  G.timer = 5;
  var r = expandMap();
  if (r.forked) { banner('¡Se abre un camino nuevo!'); sfx('boss'); }
  else if (r.special) toast('Ha salido una casilla especial: ' + SPECIALS[r.special.special].name);
  if (G.follow || r.forked) { G.follow = true; }
  tutorialAfterExpand();
  if (G.wave % BLESS_EVERY === 0) offerBlessing();
  saveRun();
}

function gameOver() {
  G.over = true;
  sfx('over');
  clearRun();
  onGameOver();
}

/* ---------- efectos y textos ---------- */
function addFx(name, x, y, size, life) { if (G.fxs.length > 140) G.fxs.shift(); G.fxs.push({ name: name, x: x, y: y, size: size, t: 0, life: life || 0.4 }); }
function floatText(x, y, s, color, life) { if (G.texts.length > 80) G.texts.shift(); G.texts.push({ x: x, y: y, s: s, c: color, t: 0, rise: 0, life: life || 0.7 }); }
function fmt(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(0) + 'k';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return Math.round(n) + '';
}

/* ---------- cámara ---------- */
function resizeCanvas() {
  if (!G) return;
  var wrap = document.getElementById('board');
  var W = wrap.clientWidth, H = wrap.clientHeight;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  VIEW = { w: W, h: H, dpr: dpr };
  if (!G.camInit) { var f = fitCam(); G.cam.x = f.x; G.cam.y = f.y; G.cam.z = f.z; G.camInit = true; }
}
function zoomLimits() {
  var m = Math.min(VIEW.w, VIEW.h) || 400;
  return { min: Math.max(26, m / 22) / TS, max: Math.max(120, m / 3.2) / TS };
}
// encuadre que enseña el castillo, los caminos y las losas
function fitCam() {
  var b = G.map.bounds(true), L = zoomLimits();
  var bw = (b.x1 - b.x0 + 1.6) * TS, bh = (b.y1 - b.y0 + 2) * TS;
  var z = clamp(Math.min(VIEW.w / bw, VIEW.h / bh), L.min, L.max * 0.7);
  var cx = (b.x0 + b.x1) / 2 * TS, cy = (b.y0 + b.y1) / 2 * TS;
  // si no cabe todo, que el castillo no se salga
  var hw = VIEW.w / 2 / z - TS * 0.8, hh = VIEW.h / 2 / z - TS * 0.8;
  if (hw > 0) cx = clamp(cx, -hw, hw);
  if (hh > 0) cy = clamp(cy, -hh, hh);
  return { x: cx, y: cy, z: z };
}
function updateCam(dt) {
  if (!G.follow || G.drag && G.drag.unit) return;
  var f = fitCam(), k = 1 - Math.exp(-dt * 2.5);
  G.cam.x += (f.x - G.cam.x) * k; G.cam.y += (f.y - G.cam.y) * k; G.cam.z += (f.z - G.cam.z) * k;
}
function toWorld(px, py) { return { x: (px - VIEW.w / 2) / G.cam.z + G.cam.x, y: (py - VIEW.h / 2) / G.cam.z + G.cam.y }; }
function tileAt(px, py) {
  var w = toWorld(px, py), x = Math.round(w.x / TS), y = Math.round(w.y / TS), k = tkey(x, y);
  return G.map.tiles[k] ? k : null;
}
function zoomAt(px, py, f) {
  var L = zoomLimits(), before = toWorld(px, py);
  G.cam.z = clamp(G.cam.z * f, L.min * 0.7, L.max);
  var after = toWorld(px, py);
  G.cam.x += before.x - after.x; G.cam.y += before.y - after.y;
  G.follow = false;
}

/* ---------- dibujo ---------- */
function drawImg(name, x, y, size, alpha) {
  var im = img(name);
  if (!ready(im)) return;
  var k = size / Math.max(im.naturalWidth, im.naturalHeight);
  var w = im.naturalWidth * k, h = im.naturalHeight * k;
  var a0 = ctx.globalAlpha;
  ctx.globalAlpha = a0 * (alpha == null ? 1 : alpha);
  ctx.drawImage(im, x - w / 2, y - h / 2, w, h);
  ctx.globalAlpha = a0;
}
function drawSprite(name, x, y, size, alpha, rot) {
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  drawImg(name, 0, 0, size, alpha);
  ctx.restore();
}

function render(dt) {
  if (!G) return;
  var M = G.map;
  if (M.dirty) bakeMap(M);
  updateCam(dt || 0);
  var d = VIEW.dpr, z = G.cam.z;
  ctx.setTransform(d, 0, 0, d, 0, 0);
  ctx.fillStyle = '#0b1030'; ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  ctx.translate(VIEW.w / 2, VIEW.h / 2); ctx.scale(z, z); ctx.translate(-G.cam.x, -G.cam.y);
  // terreno
  var b = M.cacheB, P = M.cacheP;
  if (M.cache) ctx.drawImage(M.cache, (b.x0 - 0.5) * TS, (b.y0 - 0.5) * TS, M.cache.width / P * TS, M.cache.height / P * TS);
  // casillas recién descubiertas: la niebla se retira
  for (var rk in G.reveal) {
    var age = G.time - G.reveal[rk];
    if (age > 1.4) { delete G.reveal[rk]; continue; }
    var rt = M.tiles[rk]; if (!rt) continue;
    ctx.globalAlpha = 1 - age / 1.4; ctx.fillStyle = '#0b1030';
    ctx.fillRect(rt.x * TS - TS * 0.55, rt.y * TS - TS * 0.55, TS * 1.1, TS * 1.1);
  }
  ctx.globalAlpha = 1;
  // casillas especiales: brillo suave
  var pulse = 0.5 + 0.5 * Math.sin(G.time * 3);
  for (var sk in M.tiles) {
    var st = M.tiles[sk];
    if (st.special && st.kind === 'slab') { ctx.strokeStyle = 'rgba(255,226,122,' + (0.25 + 0.35 * pulse) + ')'; ctx.lineWidth = 5; roundRect(st.x * TS - TS * 0.44, st.y * TS - TS * 0.44, TS * 0.88, TS * 0.88, 14); ctx.stroke(); }
  }
  // selección, fusiones posibles y alcance
  var src = G.drag && G.drag.unit ? G.drag.from : G.sel;
  if (src && G.units[src]) {
    var su = G.units[src], stt = unitStats(su);
    if (TROOPS[su.id].dmg && !TROOPS[su.id].wolves) {
      ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 3 / z * 1.5;
      ctx.setLineDash([12, 10]); ctx.beginPath(); ctx.arc(su.x, su.y, stt.range * TS, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
    }
    for (var k in M.tiles) {
      var t = M.tiles[k];
      if (k === src) cellGlow(t, 'rgba(255,255,255,0.35)');
      else if (canMerge(src, k)) cellGlow(t, 'rgba(255,214,74,0.55)');
      else if (isFreeSlab(k)) cellGlow(t, 'rgba(120,200,255,0.16)');
    }
  }
  if (G.selSlab && isFreeSlab(G.selSlab)) {
    var ss = M.tiles[G.selSlab];
    cellGlow(ss, 'rgba(120,255,160,' + (0.25 + 0.2 * pulse) + ')');
    drawSprite('fx/invocar-aro', ss.x * TS, ss.y * TS, TS * 0.9, 0.5 + 0.3 * pulse);
  }

  // castillo, portales, tropas y monstruos, de arriba abajo
  var ents = [];
  ents.push({ y: TS * 0.3, f: drawCastle });
  M.heads.forEach(function (h) { ents.push({ y: h.y * TS + TS * 0.1, f: function () { drawPortal(h); } }); });
  for (var uk in G.units) if (!(G.drag && G.drag.unit && G.drag.from === uk && G.drag.moved)) (function (u) { ents.push({ y: u.y + TS * 0.3, f: function () { drawUnit(u, u.x, u.y); } }); })(G.units[uk]);
  var slowAll = G.fx.slowAll > 0;
  G.mobs.forEach(function (m) { ents.push({ y: m.y + TS * 0.25, f: function () { drawMob(m, slowAll); } }); });
  G.wolves.forEach(function (w) { ents.push({ y: w.y + TS * 0.2, f: function () { drawWolf(w); } }); });
  ents.sort(function (a, b) { return a.y - b.y; });
  ents.forEach(function (e) { e.f(); });

  // rayos
  ctx.lineCap = 'round';
  G.beams.forEach(function (bm) {
    ctx.globalAlpha = Math.min(1, bm.t * 6);
    ctx.strokeStyle = bm.c; ctx.lineWidth = 6; ctx.beginPath(); zig(bm.x1, bm.y1, bm.x2, bm.y2); ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); zig(bm.x1, bm.y1, bm.x2, bm.y2); ctx.stroke();
  });
  ctx.globalAlpha = 1;
  // proyectiles
  G.shots.forEach(function (s) {
    var T = TROOPS[s.id];
    var size = TS * (s.id === 'rocco' || s.id === 'fenix' || s.id === 'titan' ? 0.55 : 0.45) * (s.crit ? 1.25 : 1);
    drawSprite('fx/' + T.shot, s.x, s.y, size, 1, T.spin ? s.spin : s.ang);
  });
  // efectos
  G.fxs.forEach(function (f) {
    if (f.delay != null) return;
    var k = f.t / f.life;
    drawSprite('fx/' + f.name, f.x, f.y, f.size * (0.8 + 0.3 * k), 1 - k * k);
  });
  if (G.fx.shield > 0) drawSprite('fx/sol-escudo', 0, -TS * 0.3, TS * 1.8, 0.85);
  // tropa arrastrada
  if (G.drag && G.drag.unit && G.drag.moved && G.units[G.drag.from]) {
    var dp = toWorld(G.drag.x, G.drag.y);
    ctx.globalAlpha = 0.85; drawUnit(G.units[G.drag.from], dp.x, dp.y + TS * 0.2); ctx.globalAlpha = 1;
  }
  // textos
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  var fs = Math.round(Math.max(TS * 0.26, 13 / z));
  G.texts.forEach(function (t) {
    var a = 1 - Math.pow(t.t / t.life, 2);
    ctx.globalAlpha = a;
    ctx.font = '900 ' + fs + 'px Lilita One, sans-serif';
    ctx.lineWidth = fs * 0.22; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText(t.s, t.x, t.y - t.rise);
    ctx.fillStyle = t.c; ctx.fillText(t.s, t.x, t.y - t.rise);
  });
  ctx.globalAlpha = 1;
  // tinte de maldición
  if (G.fx.curse > 0) { ctx.setTransform(d, 0, 0, d, 0, 0); ctx.fillStyle = 'rgba(120,40,200,0.10)'; ctx.fillRect(0, 0, VIEW.w, VIEW.h); }
}
function zig(x1, y1, x2, y2) {
  ctx.moveTo(x1, y1);
  for (var k = 1; k < 5; k++) {
    var t = k / 5;
    ctx.lineTo(x1 + (x2 - x1) * t + (Math.random() - 0.5) * 18, y1 + (y2 - y1) * t + (Math.random() - 0.5) * 18);
  }
  ctx.lineTo(x2, y2);
}
function cellGlow(t, color) {
  ctx.fillStyle = color;
  roundRect(t.x * TS - TS * 0.44, t.y * TS - TS * 0.44, TS * 0.88, TS * 0.88, 14); ctx.fill();
}
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function drawCastle() {
  var im = img('ui/portal-salida');
  if (ready(im)) { var w = TS * 1.5, h = w * im.naturalHeight / im.naturalWidth; ctx.drawImage(im, -w / 2, TS * 0.42 - h, w, h); }
  if (G.fx.shield > 0) return;
  // vidas sobre el castillo
  var fs = Math.max(TS * 0.24, 12 / G.cam.z);
  ctx.font = '900 ' + Math.round(fs) + 'px Lilita One, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = fs * 0.22; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.strokeText('❤ ' + G.lives, 0, TS * 0.55);
  ctx.fillStyle = '#ffdede'; ctx.fillText('❤ ' + G.lives, 0, TS * 0.55);
}
function drawPortal(h) {
  var im = img('ui/portal-entrada'), x = h.x * TS, y = h.y * TS;
  if (!ready(im)) return;
  var w = TS * 1.05, hh = w * im.naturalHeight / im.naturalWidth;
  ctx.save(); ctx.translate(x, y);
  // el portal mira hacia fuera del camino
  if (h.dir[0] < 0) ctx.scale(-1, 1);
  ctx.globalAlpha = 0.25 + 0.15 * Math.sin(G.time * 4);
  ctx.fillStyle = '#7a4dff'; ctx.beginPath(); ctx.ellipse(0, TS * 0.2, TS * 0.42, TS * 0.16, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.drawImage(im, -w / 2, TS * 0.36 - hh, w, hh);
  ctx.restore();
}

function drawUnit(u, x, y) {
  var T = TROOPS[u.id];
  var h = TS * 1.36 * (1 + u.pop * 0.6), feet = TS * 0.4;
  var a0 = ctx.globalAlpha;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = RANK_COLOR[u.rank]; ctx.globalAlpha = 0.35 * a0;
  ctx.beginPath(); ctx.ellipse(0, feet - TS * 0.04, TS * 0.32, TS * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = a0;
  var pose = u.atk > 0 && T.dmg ? 'attack' : 'idle';
  var im = img('units/board/' + u.id + '-' + pose);
  if (!ready(im)) { pose = 'idle'; im = img('units/board/' + u.id + '-idle'); }
  if (ready(im)) {
    var k = h / 512, w = im.naturalWidth * k, hh = im.naturalHeight * k;
    ctx.save();
    ctx.translate(0, feet);
    if (pose === 'attack' && u.face !== T.face) ctx.scale(-1, 1);
    if (u.frozen > 0) ctx.filter = 'saturate(0.3) brightness(1.3) hue-rotate(160deg)';
    ctx.drawImage(im, -w / 2, -hh - 6 * k, w, hh);
    ctx.restore();
  } else {
    ctx.fillStyle = ELEMENTS[T.el].color; ctx.beginPath(); ctx.arc(0, 0, TS * 0.3, 0, Math.PI * 2); ctx.fill();
  }
  if (u.frozen > 0) drawImg('fx/estado-helado', 0, -TS * 0.1, TS * 0.6, 0.8);
  // rango
  var bx = -TS * 0.36, by = -TS * 0.36, r = TS * 0.15;
  ctx.fillStyle = 'rgba(10,12,30,0.85)'; ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = r * 0.25; ctx.strokeStyle = RANK_COLOR[u.rank]; ctx.stroke();
  ctx.fillStyle = RANK_COLOR[u.rank]; ctx.font = '900 ' + Math.round(r * 1.35) + 'px Lilita One, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(u.rank, bx, by + r * 0.08);
  // carga de Doblón y Oria
  if (T.mana || T.interest) {
    var f = u.gen / T.every;
    ctx.strokeStyle = T.mana ? '#7fd6ff' : '#ffe27a'; ctx.lineWidth = 5; ctx.beginPath();
    ctx.arc(TS * 0.36, by, r * 0.8, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

function drawMob(m, slowAll) {
  var size = TS * m.size * 1.1;
  var bob = Math.sin(G.time * 8 + m.bob) * size * 0.03;
  var im = img('enemies/' + m.k);
  var y = TS * 0.25;
  ctx.save();
  ctx.translate(m.x, m.y);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, y, size * 0.35, size * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  if (ready(im)) {
    var k = size / Math.max(im.naturalWidth, im.naturalHeight), w = im.naturalWidth * k, h = im.naturalHeight * k;
    ctx.save();
    ctx.translate(0, y + bob);
    if (m.dx < -0.01) ctx.scale(-1, 1);
    var f = [];
    if (m.hitT > 0) f.push('brightness(1.8)');
    if (m.slow > 0 || slowAll) f.push('hue-rotate(170deg) saturate(0.7)');
    if (m.poisonT > 0) f.push('sepia(0.3) hue-rotate(60deg)');
    if (f.length) ctx.filter = f.join(' ');
    ctx.drawImage(im, -w / 2, -h, w, h);
    ctx.restore();
  }
  if (m.shield > 0) drawImg('fx/sol-escudo', 0, y - size * 0.45, size * 1.1, 0.6);
  if (G.fx.curse > 0) drawImg('fx/nyx-maldicion', 0, y, size * 0.8, 0.5);
  var st = [];
  if (m.stun > 0) st.push('estado-aturdido');
  if (m.slow > 0.3) st.push('estado-helado');
  if (m.poisonT > 0) st.push('estado-veneno');
  if (m.burnT > 0) st.push('estado-quemado');
  if (m.thorn > 0) st.push('estado-enredado');
  if (m.embers > 0) st.push('estado-ascuas');
  if (m.acid > 0) st.push('estado-armadura');
  var top = y - size - TS * 0.08;
  st.forEach(function (s, k) { drawImg('fx/' + s, (k - (st.length - 1) / 2) * TS * 0.24, top - TS * 0.22, TS * 0.24, 0.95); });
  if (m.hp < m.max || m.boss) {
    var bw = size * 0.7, bh = Math.max(6, TS * 0.06);
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(-bw / 2 - 2, top - 2, bw + 4, bh + 4);
    ctx.fillStyle = m.boss ? '#ff4b5c' : '#5ee36a'; ctx.fillRect(-bw / 2, top, bw * Math.max(0, m.hp / m.max), bh);
    if (m.barrier > 0) { ctx.fillStyle = '#9fd3ff'; ctx.fillRect(-bw / 2, top - bh * 0.7, bw * m.barrier / m.barrierMax, bh * 0.5); }
  }
  ctx.restore();
}
function drawWolf(w) {
  var im = img('fx/' + w.pic);
  if (!ready(im)) return;
  var s = TS * 0.75, k = s / Math.max(im.naturalWidth, im.naturalHeight);
  ctx.save(); ctx.translate(w.x, w.y + TS * 0.2);
  if (w.dir < -0.01) ctx.scale(-1, 1);
  ctx.drawImage(im, -im.naturalWidth * k / 2, -im.naturalHeight * k, im.naturalWidth * k, im.naturalHeight * k);
  ctx.restore();
}

/* ---------- guardado de partida (al acabar cada oleada) ---------- */
function snapshot() {
  var us = []; eachUnit(function (u, k) { us.push({ k: k, id: u.id, rank: u.rank }); });
  return {
    mode: G.mode, seed: G.seed, deck: G.deck, cmd: G.cmd, exps: G.map.expansions,
    units: us, mana: G.mana, lives: G.lives, wave: G.wave, summons: G.summons, power: G.power, bless: G.bless,
    cmdT: G.cmdT, kills: G.kills, time: G.time, dmgBy: G.dmgBy, day: G.day
  };
}
function restore(s) {
  for (var i = 0; i < s.exps; i++) G.map.expand();
  G.map.born = [];
  G.units = {};
  s.units.forEach(function (u) {
    var k = isFreeSlab(u.k) ? u.k : freeSlabs()[0];
    if (k) G.units[k] = makeUnit(u.id, u.rank, k);
  });
  G.mana = s.mana; G.lives = s.lives; G.wave = s.wave; G.summons = s.summons;
  G.power = s.power; G.bless = s.bless; G.cmdT = s.cmdT; G.kills = s.kills; G.time = s.time; G.dmgBy = s.dmgBy || G.dmgBy; G.day = s.day;
  G.rng = mulberry(G.seed * 7 + 13 + G.wave * 7919);
  G.state = 'countdown'; G.timer = 6;
}
function saveRun() { if (G && !G.over) store('fronteras-run', snapshot()); }
function clearRun() { try { localStorage.removeItem('fronteras-run'); } catch (e) {} }
