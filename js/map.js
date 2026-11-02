/* Fronteras del Reino: mapa por casillas que se genera solo y crece tras cada oleada.
   El castillo está en (0,0). Cada casilla del camino apunta a la siguiente hacia el
   castillo (next), así que los caminos forman un árbol y cada punta tiene su portal. */
'use strict';

var TS = 100;                  // tamaño de una casilla en el mundo
var D4 = [[1, 0], [0, 1], [-1, 0], [0, -1]];
var D8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
var FORK_AT = [5, 12, 21, 32, 45, 60, 78, 99];   // expansiones en las que se abre un camino nuevo
var BIOME_CELL = 8;            // tamaño medio de cada zona en casillas
var REVEAL = 2;                // casillas que se descubren a cada lado del camino

function tkey(x, y) { return x + ',' + y; }
function hash3(s, a, b) {
  var h = (s | 0) ^ Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  h = Math.imul(h ^ (h >>> 15), 2246822519); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

function WorldMap(seed) {
  this.seed = seed;
  this.rng = mulberry(seed ^ 0x5bd1e995);
  this.tiles = {};
  this.heads = [];
  this.pathList = [];
  this.expansions = 0;
  this.born = [];
  this.dirty = true;
  this.name = MAP_A[(hash3(seed, 7, 1) * MAP_A.length) | 0] + ' ' + MAP_B[(hash3(seed, 7, 2) * MAP_B.length) | 0];
  var c = this.make(0, 0);
  c.kind = 'castle'; c.d = 0; c.deco = null;
  this.reveal(0, 0, REVEAL, true);
  var first = { x: 0, y: 0, k: tkey(0, 0), dir: D4[(this.rng() * 4) | 0] };
  this.heads.push(first);
  this.lost = [];
  var made = this.grow(first, 5, true);
  this.afterGrow(made, true);
  this.routes = this.heads.map(function (h) { return this.route(h); }, this);
}

WorldMap.prototype.get = function (x, y) { return this.tiles[tkey(x, y)]; };
WorldMap.prototype.isRoad = function (t) { return t && (t.kind === 'path' || t.kind === 'castle'); };

// zona de cada casilla: el centro de zona más cercano (uno por celda de BIOME_CELL)
WorldMap.prototype.biomeAt = function (x, y) {
  var C = BIOME_CELL, cx = Math.floor((x + C / 2) / C), cy = Math.floor((y + C / 2) / C), best = null, bd = 1e9;
  for (var i = -1; i <= 1; i++) for (var j = -1; j <= 1; j++) {
    var gx = cx + i, gy = cy + j, px, py, b;
    if (gx === 0 && gy === 0) { px = 0; py = 0; b = 'prado'; }
    else {
      px = (gx - 0.5 + 0.15 + 0.7 * hash3(this.seed, gx, gy)) * C;
      py = (gy - 0.5 + 0.15 + 0.7 * hash3(this.seed + 1, gx, gy)) * C;
      b = BIOME_ORDER[(hash3(this.seed + 2, gx, gy) * BIOME_ORDER.length) | 0];
    }
    // un poco de ruido en la distancia para que los bordes no salgan rectos
    var d = Math.hypot(x - px, y - py) + (hash3(this.seed + 9, x, y) - 0.5) * 1.4;
    if (d < bd) { bd = d; best = b; }
  }
  return best;
};

WorldMap.prototype.make = function (x, y) {
  var k = tkey(x, y), t = this.tiles[k];
  if (t) return t;
  var b = this.biomeAt(x, y), h = hash3(this.seed + 5, x, y);
  t = { x: x, y: y, k: k, kind: 'ground', biome: b, v: h, deco: null };
  // adornos del suelo (no se puede construir encima)
  var hd = hash3(this.seed + 6, x, y);
  if (hd < 0.3) t.deco = BIOMES[b].deco;
  else if (hd < 0.38) t.deco = 'rock';
  this.tiles[k] = t;
  return t;
};

WorldMap.prototype.reveal = function (x, y, r, quiet) {
  for (var i = -r; i <= r; i++) for (var j = -r; j <= r; j++) {
    if (!this.tiles[tkey(x + i, y + j)]) {
      var t = this.make(x + i, y + j);
      if (!quiet) this.born.push(t.k);
    }
  }
};

// ¿puede el camino pasar por (x,y) viniendo de from? No puede tocar otro tramo
// salvo la casilla de la que viene y las que están junto a ella.
WorldMap.prototype.canPath = function (x, y, fx, fy) {
  var t = this.get(x, y);
  if (t && (this.isRoad(t) || t.special)) return false;
  for (var i = 0; i < 8; i++) {
    var nx = x + D8[i][0], ny = y + D8[i][1];
    if (!this.isRoad(this.get(nx, ny))) continue;
    if (nx === fx && ny === fy) continue;
    if (Math.abs(nx - fx) + Math.abs(ny - fy) === 1) continue;
    return false;
  }
  return true;
};

WorldMap.prototype.options = function (x, y, dir) {
  var out = [];
  for (var i = 0; i < 4; i++) {
    var d = D4[i];
    if (dir && d[0] === -dir[0] && d[1] === -dir[1]) continue;
    if (this.canPath(x + d[0], y + d[1], x, y)) out.push(d);
  }
  return out;
};

// alarga una punta n casillas; devuelve las casillas nuevas
WorldMap.prototype.grow = function (h, n, forceDir) {
  var made = [];
  for (var s = 0; s < n; s++) {
    var opts = this.options(h.x, h.y, s === 0 && forceDir ? null : h.dir);
    if (s === 0 && forceDir) opts = opts.filter(function (d) { return d === h.dir || (d[0] === h.dir[0] && d[1] === h.dir[1]); });
    if (!opts.length) break;
    var len = Math.hypot(h.x, h.y) || 1, ux = h.x / len, uy = h.y / len;
    if (!h.x && !h.y) { ux = h.dir[0]; uy = h.dir[1]; }
    var ws = opts.map(function (d) {
      var w = (d[0] === h.dir[0] && d[1] === h.dir[1]) ? 1.5 : 1;
      w *= 0.25 + Math.max(0, d[0] * ux + d[1] * uy);
      // mirar un paso más para no meterse en un callejón
      var nx = h.x + d[0], ny = h.y + d[1];
      var free = 0;
      for (var i = 0; i < 4; i++) if (!(D4[i][0] === -d[0] && D4[i][1] === -d[1]) && this.canPathAfter(nx + D4[i][0], ny + D4[i][1], nx, ny, h.x, h.y)) free++;
      if (!free) w *= 0.03;
      var nt = this.get(nx, ny);
      if (nt && nt.kind === 'slab') w *= 0.3;
      return w;
    }, this);
    var tot = ws.reduce(function (a, b) { return a + b; }, 0), r = this.rng() * tot, pick = opts[0];
    for (var i = 0; i < opts.length; i++) { r -= ws[i]; if (r <= 0) { pick = opts[i]; break; } }
    var nx = h.x + pick[0], ny = h.y + pick[1];
    var t = this.make(nx, ny);
    if (t.kind === 'slab') this.lost.push(t.k);
    t.kind = 'path'; t.next = h.k; t.d = this.tiles[h.k].d + 1; t.deco = null; t.slab = null;
    this.pathList.push(t);
    h.x = nx; h.y = ny; h.k = t.k; h.dir = pick;
    made.push(t);
  }
  return made;
};
// como canPath, pero suponiendo que (px,py) ya es camino viniendo de (qx,qy)
WorldMap.prototype.canPathAfter = function (x, y, px, py, qx, qy) {
  var t = this.get(x, y);
  if (t && (this.isRoad(t) || t.special)) return false;
  for (var i = 0; i < 8; i++) {
    var nx = x + D8[i][0], ny = y + D8[i][1];
    var road = this.isRoad(this.get(nx, ny)) || (nx === px && ny === py);
    if (!road) continue;
    if (nx === px && ny === py) continue;
    if (Math.abs(nx - px) + Math.abs(ny - py) === 1) continue;
    return false;
  }
  return true;
};

// descubre alrededor de las casillas nuevas y pone losas junto al camino
WorldMap.prototype.afterGrow = function (made, quiet) {
  var slabs = [], self = this;
  made.forEach(function (t) { self.reveal(t.x, t.y, REVEAL, quiet); });
  made.forEach(function (t) {
    for (var i = -2; i <= 2; i++) for (var j = -2; j <= 2; j++) {
      var n = self.get(t.x + i, t.y + j);
      if (!n || n.kind !== 'ground') continue;
      if (self.ahead(n)) continue;
      var near = Math.max(Math.abs(i), Math.abs(j)) === 1;
      if (near ? n.rolled1 : n.rolled2) continue;
      if (near) n.rolled1 = true; else n.rolled2 = true;
      if (self.rng() < (near ? 0.6 : 0.1)) { self.toSlab(n); slabs.push(n); }
    }
  });
  // al menos dos losas nuevas en cada tramo
  if (made.length && slabs.length < 2) {
    made.forEach(function (t) {
      D8.forEach(function (d) {
        var n = self.get(t.x + d[0], t.y + d[1]);
        if (slabs.length < 2 && n && n.kind === 'ground') { self.toSlab(n); slabs.push(n); }
      });
    });
  }
  return slabs;
};
// casillas justo delante de una punta: se dejan sin losa para que el camino pueda seguir
WorldMap.prototype.ahead = function (n) {
  for (var i = 0; i < this.heads.length; i++) {
    var h = this.heads[i];
    if (Math.max(Math.abs(n.x - h.x), Math.abs(n.y - h.y)) <= 2 && (n.x - h.x) * h.dir[0] + (n.y - h.y) * h.dir[1] > 0) return true;
  }
  return false;
};
WorldMap.prototype.toSlab = function (t) {
  var B = BIOMES[t.biome];
  t.kind = 'slab'; t.deco = null;
  t.slab = B.slabs[(hash3(this.seed + 8, t.x, t.y) * B.slabs.length) | 0];
};

// un camino nuevo que sale de un tramo que ya existe
WorldMap.prototype.fork = function () {
  var cands = this.pathList.filter(function (t) { return t.d >= 3; }), self = this;
  var heads = {}; this.heads.forEach(function (h) { heads[h.k] = true; });
  cands = cands.filter(function (t) { return !heads[t.k]; });
  for (var i = cands.length - 1; i > 0; i--) { var j = (this.rng() * (i + 1)) | 0, tmp = cands[i]; cands[i] = cands[j]; cands[j] = tmp; }
  for (var c = 0; c < cands.length; c++) {
    var t = cands[c], len = Math.hypot(t.x, t.y) || 1;
    var dirs = D4.filter(function (d) { return (d[0] * t.x + d[1] * t.y) / len > -0.2 && self.canPath(t.x + d[0], t.y + d[1], t.x, t.y); });
    for (var k = 0; k < dirs.length; k++) {
      var d = dirs[k], nx = t.x + d[0], ny = t.y + d[1], ok = false;
      for (var q = 0; q < 4; q++) if (!(D4[q][0] === -d[0] && D4[q][1] === -d[1]) && this.canPathAfter(nx + D4[q][0], ny + D4[q][1], nx, ny, t.x, t.y)) ok = true;
      if (!ok) continue;
      var h = { x: t.x, y: t.y, k: t.k, dir: d };
      var made = this.grow(h, 4, true);
      if (made.length) { this.heads.push(h); return made; }
    }
  }
  return [];
};

// crece el mapa tras una oleada: alarga la punta más corta o abre un camino nuevo
WorldMap.prototype.expand = function () {
  this.expansions++;
  this.lost = [];
  var n = this.expansions <= 20 ? 3 : 2, made = [], forked = false, self = this;
  if (FORK_AT.indexOf(this.expansions) !== -1) { made = this.fork(); forked = made.length > 0; }
  if (!made.length) {
    var order = this.heads.slice().sort(function (a, b) { return (self.tiles[a.k].d - self.tiles[b.k].d) || (self.rng() - 0.5); });
    for (var i = 0; i < order.length && !made.length; i++) made = this.grow(order[i], n);
  }
  if (!made.length) { made = this.fork(); forked = made.length > 0; }
  var slabs = this.afterGrow(made, false);
  var special = null;
  if (slabs.length && this.rng() < 0.45) {
    special = slabs[(this.rng() * slabs.length) | 0];
    special.special = SPECIAL_ORDER[(this.rng() * SPECIAL_ORDER.length) | 0];
  }
  this.routes = this.heads.map(function (h) { return this.route(h); }, this);
  this.dirty = true;
  return { made: made, slabs: slabs, forked: forked, special: special, lost: this.lost.slice() };
};

// recorrido de una punta hasta el castillo, en coordenadas del mundo
WorldMap.prototype.route = function (h) {
  var pts = [], t = this.tiles[h.k], guard = 0;
  // los monstruos salen un poco por fuera del portal
  var nx = t.next ? this.tiles[t.next] : null;
  if (nx) pts.push({ x: (t.x + (t.x - nx.x) * 0.45) * TS, y: (t.y + (t.y - nx.y) * 0.45) * TS });
  while (t && guard++ < 5000) {
    pts.push({ x: t.x * TS, y: t.y * TS });
    if (t.kind === 'castle') break;
    t = this.tiles[t.next];
  }
  var segs = [], total = 0;
  for (var i = 1; i < pts.length; i++) {
    var a = pts[i - 1], b = pts[i], l = Math.hypot(b.x - a.x, b.y - a.y);
    segs.push({ a: a, b: b, l: l, s: total }); total += l;
  }
  return { segs: segs, len: total, head: h.k };
};
function routePos(r, d) {
  var s = r.segs;
  for (var i = 0; i < s.length; i++) {
    if (d <= s[i].s + s[i].l || i === s.length - 1) {
      var t = Math.max(0, Math.min(1, (d - s[i].s) / s[i].l));
      return { x: s[i].a.x + (s[i].b.x - s[i].a.x) * t, y: s[i].a.y + (s[i].b.y - s[i].a.y) * t, dx: s[i].b.x - s[i].a.x, dy: s[i].b.y - s[i].a.y };
    }
  }
  return { x: 0, y: 0, dx: 1, dy: 0 };
}

WorldMap.prototype.bounds = function (onlyUseful) {
  var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (var k in this.tiles) {
    var t = this.tiles[k];
    if (onlyUseful && t.kind === 'ground') continue;
    if (t.x < x0) x0 = t.x; if (t.x > x1) x1 = t.x; if (t.y < y0) y0 = t.y; if (t.y > y1) y1 = t.y;
  }
  return { x0: x0, y0: y0, x1: x1, y1: y1 };
};
WorldMap.prototype.count = function (kind) {
  var n = 0; for (var k in this.tiles) if (this.tiles[k].kind === kind) n++; return n;
};

/* ---------- dibujo del terreno en un lienzo aparte (se repite al crecer) ---------- */
var _caminoPat = null;
function caminoPattern(c) {
  var im = img('boards/camino');
  if (!ready(im)) return '#c99a5a';
  if (!_caminoPat) {
    var cv = document.createElement('canvas'), w = Math.round(im.naturalWidth * 0.36), h = im.naturalHeight;
    cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(im, im.naturalWidth * 0.32, 0, w, h, 0, 0, w, h);
    _caminoPat = cv;
  }
  return c.createPattern(_caminoPat, 'repeat');
}

function bakeMap(M) {
  var b = M.bounds(false), pad = 3;
  b.x0 -= pad; b.y0 -= pad; b.x1 += pad; b.y1 += pad;
  var cols = b.x1 - b.x0 + 1, rows = b.y1 - b.y0 + 1;
  var P = Math.max(20, Math.min(84, Math.floor(3600 / Math.max(cols, rows))));
  var cv = M.cache || document.createElement('canvas');
  if (cv.width !== cols * P || cv.height !== rows * P) { cv.width = cols * P; cv.height = rows * P; }
  var c = cv.getContext('2d'), missing = 0;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, cv.width, cv.height);
  var X = function (x) { return (x - b.x0) * P; }, Y = function (y) { return (y - b.y0) * P; };
  var keys = Object.keys(M.tiles), tiles = keys.map(function (k) { return M.tiles[k]; });

  // suelo de alrededor, aún sin descubrir (se ve a medias bajo la niebla)
  for (var gx = b.x0; gx <= b.x1; gx++) for (var gy = b.y0; gy <= b.y1; gy++) {
    if (M.tiles[tkey(gx, gy)]) continue;
    c.fillStyle = BIOMES[M.biomeAt(gx, gy)].ground[0];
    c.fillRect(X(gx) - 0.5, Y(gy) - 0.5, P + 1, P + 1);
  }
  // suelo
  tiles.forEach(function (t) {
    var B = BIOMES[t.biome], x = X(t.x), y = Y(t.y);
    c.fillStyle = B.ground[t.v < 0.5 ? 0 : 1];
    c.fillRect(x - 0.5, y - 0.5, P + 1, P + 1);
    c.fillStyle = B.spot; c.globalAlpha = 0.45;
    for (var i = 0; i < 3; i++) {
      var hx = hash3(M.seed + 20 + i, t.x, t.y), hy = hash3(M.seed + 30 + i, t.x, t.y);
      c.beginPath(); c.ellipse(x + hx * P, y + hy * P, P * 0.12, P * 0.06, 0, 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1;
  });
  // camino: borde y tierra
  var road = tiles.filter(function (t) { return t.kind === 'path' || t.kind === 'castle'; });
  function roadShape(w) {
    road.forEach(function (t) {
      var cx = X(t.x) + P / 2, cy = Y(t.y) + P / 2;
      c.fillRect(cx - w / 2, cy - w / 2, w, w);
      var n = t.next && M.tiles[t.next];
      if (n) {
        var nx = X(n.x) + P / 2, ny = Y(n.y) + P / 2;
        c.fillRect(Math.min(cx, nx) - w / 2, Math.min(cy, ny) - w / 2, Math.abs(nx - cx) + w, Math.abs(ny - cy) + w);
      }
    });
  }
  c.fillStyle = 'rgba(40,24,10,0.55)'; roadShape(P * 0.8);
  var pat = caminoPattern(c);
  if (typeof pat === 'string') missing++;
  else if (pat.setTransform && window.DOMMatrix) pat.setTransform(new DOMMatrix().scale(P / 90));
  c.fillStyle = pat; roadShape(P * 0.66);
  // plaza del castillo
  c.fillStyle = 'rgba(40,24,10,0.55)'; c.beginPath(); c.arc(X(0) + P / 2, Y(0) + P / 2, P * 0.62, 0, Math.PI * 2); c.fill();
  c.fillStyle = pat; c.beginPath(); c.arc(X(0) + P / 2, Y(0) + P / 2, P * 0.54, 0, Math.PI * 2); c.fill();

  // losas, casillas especiales y adornos
  tiles.forEach(function (t) {
    var x = X(t.x), y = Y(t.y);
    if (t.kind === 'slab') {
      c.fillStyle = 'rgba(0,0,0,0.28)'; c.fillRect(x + P * 0.08, y + P * 0.12, P * 0.88, P * 0.86);
      var im = img('tiles/' + (t.special || t.slab));
      if (ready(im)) c.drawImage(im, x + P * 0.05, y + P * 0.05, P * 0.9, P * 0.9);
      else { missing++; c.fillStyle = '#8a8a8a'; c.fillRect(x + P * 0.06, y + P * 0.06, P * 0.88, P * 0.88); }
    } else if (t.kind === 'ground' && t.deco) {
      if (!drawDeco(c, M, t, x, y, P)) missing++;
    }
  });

  // niebla en lo que no se ha descubierto, con el borde suave
  var fog = M.fogCv || document.createElement('canvas');
  if (fog.width !== cv.width || fog.height !== cv.height) { fog.width = cv.width; fog.height = cv.height; }
  var f = fog.getContext('2d');
  f.globalCompositeOperation = 'source-over';
  f.fillStyle = '#0b1030'; f.fillRect(0, 0, fog.width, fog.height);
  f.globalCompositeOperation = 'destination-out';
  tiles.forEach(function (t) {
    var cx = X(t.x) + P / 2, cy = Y(t.y) + P / 2, r = P * 1.25;
    var g = f.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.42, 'rgba(0,0,0,1)'); g.addColorStop(0.75, 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    f.fillStyle = g; f.fillRect(cx - r, cy - r, r * 2, r * 2);
  });
  f.globalCompositeOperation = 'source-over';
  c.drawImage(fog, 0, 0);

  M.cache = cv; M.fogCv = fog; M.cacheB = b; M.cacheP = P;
  M.dirty = false; M.missing = missing;
}

function drawDeco(c, M, t, x, y, P) {
  var h = hash3(M.seed + 40, t.x, t.y), ox = x + P * (0.35 + h * 0.3), oy = y + P * (0.55 + hash3(M.seed + 41, t.x, t.y) * 0.2);
  var s = P * (0.75 + h * 0.3);
  c.lineJoin = 'round'; c.lineWidth = Math.max(1, P * 0.025); c.strokeStyle = 'rgba(26,20,48,0.85)';
  switch (t.deco) {
    case 'rock': {
      var im = img('tiles/roca-' + (1 + ((h * 12) | 0)));
      if (!ready(im)) return false;
      c.drawImage(im, ox - s * 0.35, oy - s * 0.38, s * 0.7, s * 0.7 * im.naturalHeight / im.naturalWidth);
      return true;
    }
    case 'tree':
      shadow(c, ox, oy + s * 0.14, s * 0.3);
      c.fillStyle = '#7a4a26'; c.fillRect(ox - s * 0.05, oy - s * 0.12, s * 0.1, s * 0.26); c.strokeRect(ox - s * 0.05, oy - s * 0.12, s * 0.1, s * 0.26);
      blob(c, ox - s * 0.13, oy - s * 0.2, s * 0.17, '#3d8a33');
      blob(c, ox + s * 0.13, oy - s * 0.2, s * 0.17, '#3d8a33');
      blob(c, ox, oy - s * 0.36, s * 0.2, '#4ea23f');
      c.fillStyle = 'rgba(255,255,255,0.18)'; c.beginPath(); c.arc(ox - s * 0.05, oy - s * 0.43, s * 0.07, 0, Math.PI * 2); c.fill();
      return true;
    case 'pine':
      shadow(c, ox, oy + s * 0.12, s * 0.26);
      c.fillStyle = '#6b4a2a'; c.fillRect(ox - s * 0.04, oy - s * 0.04, s * 0.08, s * 0.16);
      for (var i = 0; i < 3; i++) {
        var ty = oy - s * (0.04 + i * 0.16), w = s * (0.3 - i * 0.07);
        c.fillStyle = '#2f6b55'; c.beginPath(); c.moveTo(ox - w, ty); c.lineTo(ox + w, ty); c.lineTo(ox, ty - s * 0.26); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = '#f4fbff'; c.beginPath(); c.moveTo(ox - w * 0.45, ty - s * 0.13); c.lineTo(ox + w * 0.45, ty - s * 0.13); c.lineTo(ox, ty - s * 0.26); c.closePath(); c.fill();
      }
      return true;
    case 'ember':
      c.fillStyle = '#2a1a16'; c.beginPath(); c.ellipse(ox, oy, s * 0.3, s * 0.16, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      var g = c.createRadialGradient(ox, oy, 0, ox, oy, s * 0.24);
      g.addColorStop(0, '#ffe066'); g.addColorStop(0.5, '#ff7a1a'); g.addColorStop(1, 'rgba(200,40,10,0.2)');
      c.fillStyle = g; c.beginPath(); c.ellipse(ox, oy, s * 0.22, s * 0.1, 0, 0, Math.PI * 2); c.fill();
      return true;
    case 'shroom':
      shadow(c, ox, oy + s * 0.06, s * 0.22);
      [[-0.12, 0.02, 0.8, '#9b5cff'], [0.1, 0, 1, '#38b6a5']].forEach(function (m) {
        var mx = ox + m[0] * s, my = oy + m[1] * s, k = m[2] * s;
        c.fillStyle = '#efe3c8'; c.fillRect(mx - k * 0.04, my - k * 0.2, k * 0.08, k * 0.22); c.strokeRect(mx - k * 0.04, my - k * 0.2, k * 0.08, k * 0.22);
        c.fillStyle = m[3]; c.beginPath(); c.ellipse(mx, my - k * 0.2, k * 0.16, k * 0.11, 0, Math.PI, 0); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); c.arc(mx - k * 0.05, my - k * 0.25, k * 0.025, 0, Math.PI * 2); c.arc(mx + k * 0.06, my - k * 0.23, k * 0.02, 0, Math.PI * 2); c.fill();
      });
      return true;
  }
  return true;
}
function blob(c, x, y, r, col) { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.stroke(); }
function shadow(c, x, y, r) { c.fillStyle = 'rgba(0,0,0,0.22)'; c.beginPath(); c.ellipse(x, y, r, r * 0.35, 0, 0, Math.PI * 2); c.fill(); }
