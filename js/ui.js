/* Fronteras del Reino: pantallas, controles, sonido y guardado. */
'use strict';

function $(id) { return document.getElementById(id); }
function load(k, def) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

var SETTINGS = Object.assign({ sound: true, numbers: true, speed: 1 }, load('fronteras-settings', {}));
var META = Object.assign({ deck: DEFAULT_DECK.slice(), cmd: 'aria', best: {}, runs: [], kills: 0, played: 0, daily: {}, longest: 0, seen: '' }, load('fronteras-meta', {}));
function saveSettings() { store('fronteras-settings', SETTINGS); }
function saveMeta() { store('fronteras-meta', META); }

/* ---------- sonido ---------- */
var AC = null, lastSfx = {};
function sfx(k) {
  if (!SETTINGS.sound) return;
  var now = performance.now();
  if (lastSfx[k] && now - lastSfx[k] < (k === 'shot' || k === 'kill' ? 70 : 30)) return;
  lastSfx[k] = now;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    var S = {
      summon: [520, 880, 0.12, 'triangle', 0.12], merge: [440, 1320, 0.22, 'sine', 0.16], tap: [600, 600, 0.04, 'square', 0.04],
      power: [330, 990, 0.25, 'sawtooth', 0.08], shot: [900, 500, 0.05, 'triangle', 0.025], kill: [300, 120, 0.08, 'square', 0.04],
      leak: [200, 80, 0.3, 'sawtooth', 0.15], boss: [110, 70, 0.6, 'sawtooth', 0.15], bossdown: [220, 880, 0.6, 'triangle', 0.18],
      skill: [260, 1040, 0.4, 'sine', 0.18], bless: [660, 1320, 0.3, 'triangle', 0.14], over: [330, 90, 0.9, 'sawtooth', 0.15], wave: [440, 660, 0.18, 'triangle', 0.1]
    }[k];
    if (!S) return;
    var o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime;
    o.type = S[3]; o.frequency.setValueAtTime(S[0], t); o.frequency.exponentialRampToValueAtTime(S[1], t + S[2]);
    g.gain.setValueAtTime(S[4], t); g.gain.exponentialRampToValueAtTime(0.001, t + S[2]);
    o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + S[2] + 0.02);
  } catch (e) {}
}

/* ---------- avisos ---------- */
var toastT = null;
function toast(s) {
  var t = $('toast'); t.textContent = s; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 2200);
}
function banner(s) {
  var b = $('banner'); b.textContent = s;
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
}
function flash() { var f = $('flash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); }

/* ---------- pantallas ---------- */
function show(id) {
  ['home', 'deckScreen', 'recordsScreen', 'optionsScreen', 'game'].forEach(function (s) { $(s).hidden = s !== id; });
  window.scrollTo(0, 0);
}
function todayKey() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function dailySetup() {
  var key = todayKey(), h = 0;
  for (var i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  var r = mulberry(h), pool = TROOP_ORDER.slice(), deck = [];
  while (deck.length < 5) {
    var id = pool.splice((r() * pool.length) | 0, 1)[0];
    var support = deck.filter(function (d) { return !isAttacker(d); }).length;
    if (!isAttacker(id) && support >= 2) continue;
    deck.push(id);
  }
  return { key: key, seed: 10000 + Math.floor(r() * 90000), deck: deck, cmd: COMMANDER_ORDER[(r() * COMMANDER_ORDER.length) | 0] };
}
function modeName(m) { return { expedicion: 'Expedición', diario: 'Mapa del día', codigo: 'Mapa por código' }[m] || m; }

function renderHome() {
  var run = load('fronteras-run', null);
  var d = dailySetup(), dBest = META.daily[d.key];
  var best = META.best.expedicion || 0;
  $('homeBody').innerHTML =
    (run ? '<button class="big-btn gold" onclick="resumeRun()">Continuar<small>Oleada ' + (run.wave + 1) + ' · ' + esc(new WorldMap(run.seed).name) + '</small></button>' : '') +
    '<button class="big-btn" onclick="startMode(\'expedicion\')">Expedición<small>Un mapa nuevo que crece tras cada oleada.' + (best ? ' Récord: oleada ' + best : '') + '</small></button>' +
    '<button class="big-btn violet" onclick="startMode(\'diario\')">Mapa del día<small>' + esc(new WorldMap(d.seed).name) + ' con ' + d.deck.map(function (id) { return TROOPS[id].name; }).join(', ') + (dBest ? '. Hoy: oleada ' + dBest : '') + '</small></button>' +
    '<button class="big-btn green" onclick="askCode()">Mapa por código<small>Juega otra vez un mapa que te haya gustado o el de un amigo.</small></button>' +
    '<div class="home-row"><button class="mid-btn" onclick="openDeck()">Mazo</button><button class="mid-btn" onclick="openRecords()">Récords</button><button class="mid-btn" onclick="openOptions()">Opciones</button></div>' +
    '<div class="home-deck">' + META.deck.map(function (id) { return '<img src="assets/units/' + id + '.webp" alt="' + esc(TROOPS[id].name) + '">'; }).join('') +
    '<img class="cmd" src="assets/commanders/' + META.cmd + '.webp" alt="' + esc(COMMANDERS[META.cmd].name) + '"></div>';
  show('home');
  if (META.seen !== APP_VERSION) { META.seen = APP_VERSION; saveMeta(); if (META.played) setTimeout(showNotes, 300); }
}
function showNotes() {
  homeOverlay('<div class="ov-card"><h2>Novedades</h2>' + notesHtml(1) + '<button class="mid-btn gold" onclick="closeHomeOverlay()">Vale</button></div>');
}
function notesHtml(n) {
  return APP_NOTES.slice(0, n || APP_NOTES.length).map(function (x) { return '<div class="note"><b>' + x.v + '</b><ul>' + x.items.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul></div>'; }).join('');
}
function homeOverlay(html) { var o = $('homeOverlay'); o.innerHTML = html; o.hidden = false; }
function closeHomeOverlay() { $('homeOverlay').hidden = true; }

function askCode() {
  homeOverlay('<div class="ov-card"><h2>Mapa por código</h2><p class="muted">El código sale en la pausa y al acabar cada partida.</p>' +
    '<input id="codeIn" class="code-in" inputmode="numeric" maxlength="5" placeholder="12345" autocomplete="off">' +
    '<p id="codeName" class="muted"></p>' +
    '<button class="mid-btn gold" onclick="playCode()">Jugar</button><button class="mid-btn" onclick="closeHomeOverlay()">Volver</button></div>');
  var inp = $('codeIn');
  inp.focus();
  inp.addEventListener('input', function () {
    inp.value = inp.value.replace(/\D/g, '');
    var n = +inp.value;
    $('codeName').textContent = n >= 10000 ? new WorldMap(n).name : '';
  });
  inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') playCode(); });
}
function playCode() {
  var n = +($('codeIn').value || 0);
  if (n < 10000 || n > 99999) { toast('El código tiene cinco cifras'); return; }
  closeHomeOverlay();
  startMode('codigo', n);
}

/* ---------- mazo ---------- */
var deckDraft = null;
function openDeck() {
  deckDraft = { deck: META.deck.slice(), cmd: META.cmd };
  renderDeck(); show('deckScreen');
}
function renderDeck() {
  var D = deckDraft;
  var h = '<div class="sec-title">Tu mazo <span>' + D.deck.length + ' de 5</span></div><div class="deck-slots">';
  for (var i = 0; i < 5; i++) {
    var id = D.deck[i];
    h += id ? '<button class="slot" onclick="toggleTroop(\'' + id + '\')"><img src="assets/units/' + id + '.webp" alt=""><b>' + esc(TROOPS[id].name) + '</b></button>' : '<div class="slot empty">?</div>';
  }
  h += '</div><p class="muted tip">Cada zona del mapa da un 20% más de daño a las tropas de su elemento: prado a naturaleza, glaciar a hielo, volcán a fuego, pantano a arcano y ruinas a metal.</p>';
  h += '<div class="sec-title">Tropas <span>toca para meter o sacar</span></div><div class="troop-grid">';
  TROOP_ORDER.forEach(function (id) {
    var T = TROOPS[id], on = D.deck.indexOf(id) !== -1;
    h += '<button class="troop' + (on ? ' on' : '') + '" style="--rc:' + RARITY[T.rar].color + '" onclick="toggleTroop(\'' + id + '\')">' +
      '<img src="assets/units/' + id + '.webp" alt=""><span class="tn">' + esc(T.name) + '</span>' +
      '<span class="tt"><img src="assets/' + ELEMENTS[T.el].icon + '.webp" alt="">' + esc(T.title) + '</span>' +
      '<span class="td">' + esc(T.desc) + '</span>' +
      (T.dmg && !T.wolves ? '<span class="ts">Daño ' + T.dmg + ' · alcance ' + T.range + '</span>' : T.wolves ? '<span class="ts">Daño ' + T.dmg + ' · todo el camino</span>' : '<span class="ts">Apoyo</span>') + '</button>';
  });
  h += '</div><div class="sec-title">Comandante</div><div class="cmd-grid">';
  COMMANDER_ORDER.forEach(function (c) {
    var C = COMMANDERS[c];
    h += '<button class="cmd-card' + (D.cmd === c ? ' on' : '') + '" onclick="deckDraft.cmd=\'' + c + '\';renderDeck()"><img src="assets/commanders/' + c + '.webp" alt=""><b>' + C.name + '</b><span>' + C.skill + '</span><small>' + C.desc + ' Se carga en ' + C.cd + ' s.</small></button>';
  });
  h += '</div>';
  $('deckBody').innerHTML = h;
  $('deckSave').disabled = D.deck.length !== 5;
}
function toggleTroop(id) {
  var d = deckDraft.deck, k = d.indexOf(id);
  if (k !== -1) d.splice(k, 1);
  else if (d.length < 5) d.push(id);
  else { toast('El mazo ya tiene 5: quita una antes'); return; }
  renderDeck();
}
function randomDeck() {
  var pool = TROOP_ORDER.slice(), d = [];
  while (d.length < 5) {
    var id = pool.splice((Math.random() * pool.length) | 0, 1)[0];
    if (!isAttacker(id) && d.filter(function (x) { return !isAttacker(x); }).length >= 2) continue;
    d.push(id);
  }
  deckDraft.deck = d; renderDeck();
}
function saveDeck() {
  if (deckDraft.deck.length !== 5) return;
  if (!deckDraft.deck.some(isAttacker)) { toast('Mete al menos una tropa que ataque'); return; }
  META.deck = deckDraft.deck; META.cmd = deckDraft.cmd; saveMeta();
  renderHome();
}

/* ---------- récords ---------- */
function openRecords() {
  var h = '<div class="stats-row"><div><b>' + (META.best.expedicion || 0) + '</b><span>Mejor oleada en Expedición</span></div><div><b>' + (META.longest || 0) + '</b><span>Casillas de camino en un mapa</span></div><div><b>' + fmt(META.kills) + '</b><span>Monstruos</span></div></div>';
  var days = Object.keys(META.daily).sort().reverse().slice(0, 7);
  if (days.length) h += '<div class="sec-title">Mapa del día</div><div class="list">' + days.map(function (k) { return '<div class="li"><span>' + k.split('-').reverse().join('/') + '</span><b>Oleada ' + META.daily[k] + '</b></div>'; }).join('') + '</div>';
  h += '<div class="sec-title">Últimas partidas <span>toca una para jugar ese mapa otra vez</span></div>';
  if (!META.runs.length) h += '<p class="muted">Aún no has jugado ninguna.</p>';
  else h += '<div class="list">' + META.runs.map(function (r) {
    return '<button class="li run" onclick="startMode(\'codigo\',' + r.seed + ')"><span class="rdeck">' + r.deck.map(function (id) { return '<img src="assets/units/' + id + '.webp" alt="">'; }).join('') + '</span><span>' + esc(r.name || '') + '<small>' + modeName(r.mode) + ' · código ' + r.seed + '</small></span><b>Oleada ' + r.wave + '</b></button>';
  }).join('') + '</div>';
  $('recordsBody').innerHTML = h;
  show('recordsScreen');
}

/* ---------- opciones ---------- */
function openOptions() {
  var opts = [
    ['sound', 'Sonido', 'Efectos de sonido.'],
    ['numbers', 'Números de daño', 'Ver cuánto pega cada golpe.']
  ];
  $('optionsBody').innerHTML = opts.map(function (o) {
    return '<label class="opt"><span><b>' + o[1] + '</b><small>' + o[2] + '</small></span><input type="checkbox" ' + (SETTINGS[o[0]] ? 'checked' : '') + ' onchange="SETTINGS.' + o[0] + '=this.checked;saveSettings()"></label>';
  }).join('') +
    '<div class="sec-title">Cómo se juega</div><div class="note"><ul>' +
    '<li>Toca una losa libre y pulsa Invocar para poner allí una tropa al azar de tu mazo. Sin elegir losa, va a la que mejor cubre el camino.</li>' +
    '<li>Arrastra una tropa sobre otra igual del mismo rango para fusionarlas. A una losa libre, para moverla.</li>' +
    '<li>Tras cada oleada el mapa crece: el camino se alarga y salen losas nuevas. Cada pocas oleadas se abre otro camino con su portal.</li>' +
    '<li>Arrastra el mapa para moverte y pellizca o usa la rueda para acercarte. El botón de la diana vuelve a encuadrarlo todo.</li>' +
    '<li>Atajos: espacio invoca, 1 a 5 mejoran, C comandante, F encuadra, P pausa.</li></ul></div>' +
    '<div class="sec-title">Novedades</div>' + notesHtml() +
    '<button class="mid-btn danger" onclick="resetAll()">Borrar todo</button><p class="muted">Fronteras del Reino ' + APP_VERSION + '. Dibujos de Reino de Torres.</p>';
  show('optionsScreen');
}
function resetAll() {
  if (!confirm('¿Borrar récords, mazo y partida guardada?')) return;
  ['fronteras-meta', 'fronteras-settings', 'fronteras-run', 'fronteras-tut'].forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
  location.reload();
}

/* ---------- partida ---------- */
function startMode(mode, seed) {
  if (load('fronteras-run', null) && !confirm('Tienes una partida a medias. ¿Empezar otra y perderla?')) return;
  clearRun();
  var o;
  if (mode === 'diario') { var d = dailySetup(); o = { mode: mode, seed: d.seed, deck: d.deck, cmd: d.cmd }; }
  else o = { mode: mode, seed: seed, deck: META.deck, cmd: META.cmd };
  beginRun(o);
  if (mode === 'diario') G.day = todayKey();
}
function resumeRun() {
  var s = load('fronteras-run', null);
  if (!s) return renderHome();
  beginRun({ mode: s.mode, seed: s.seed, deck: s.deck, cmd: s.cmd, resume: s });
}
function beginRun(o) {
  closeHomeOverlay();
  newRun(o);
  G.reveal = {};
  G.speed = SETTINGS.speed || 1;
  show('game');
  $('overlay').hidden = true;
  buildControls();
  requestAnimationFrame(function () { resizeCanvas(); });
  if (!o.resume) setTimeout(function () { if (G) banner(G.map.name); }, 300);
  tutorial(0);
}

var TUT = [
  'Toca una losa libre y pulsa Invocar. Sin elegir, la tropa va a la mejor losa.',
  'Arrastra una tropa sobre otra igual para fusionarlas y subirlas de rango.',
  'El mapa ha crecido: el camino es más largo y hay losas nuevas. Mueve tus tropas si hace falta.'
];
function tutorial(step) {
  var done = load('fronteras-tut', 0);
  if (done > step) return;
  store('fronteras-tut', step + 1);
  var c = $('coach'); c.textContent = TUT[step]; c.hidden = false;
  clearTimeout(c._t); c._t = setTimeout(function () { c.hidden = true; }, 7000);
}
function tutorialAfterExpand() { if (G.wave === 1) tutorial(2); }

function buildControls() {
  var h = '';
  G.deck.forEach(function (id) {
    h += '<button class="card" id="card-' + id + '" onclick="tapCard(\'' + id + '\')" style="--ec:' + ELEMENTS[TROOPS[id].el].color + '">' +
      '<img src="assets/units/' + id + '.webp" alt=""><span class="lv" id="lv-' + id + '">1</span><span class="pc" id="pc-' + id + '"></span></button>';
  });
  $('cards').innerHTML = h;
  $('cmdImg').src = 'assets/commanders/' + G.cmd + '.webp';
  $('speedBtn').textContent = 'x' + G.speed;
  hud(true);
}
function tapCard(id) {
  if (!G || G.paused || G.overlay) return;
  if (powerUp(id)) hud(true);
  else if (G.power[id] >= 5) toast(TROOPS[id].name + ': mejora de partida al máximo');
  else toast('Mejorar ' + TROOPS[id].name + ' cuesta ' + powerCost(id) + ' de maná');
}

var lastHud = {};
function hud(force) {
  if (!G) return;
  var cost = summonCost();
  var v = { mana: Math.floor(G.mana), lives: G.lives, wave: G.wave };
  if (force || v.mana !== lastHud.mana) $('mana').textContent = v.mana;
  if (force || v.lives !== lastHud.lives) $('lives').textContent = v.lives;
  if (force || v.wave !== lastHud.wave) $('wave').textContent = G.wave ? 'Oleada ' + G.wave : 'Prepárate';
  $('summonCost').textContent = cost;
  var full = !freeSlabs().length;
  $('summonBtn').classList.toggle('off', G.mana < cost || full);
  G.deck.forEach(function (id) {
    var c = powerCost(id), card = $('card-' + id);
    $('lv-' + id).textContent = G.power[id];
    $('pc-' + id).textContent = c ? c : 'Máx';
    card.classList.toggle('can', !!c && G.mana >= c);
  });
  var pct = G.cmdT / COMMANDERS[G.cmd].cd;
  $('cmdBtn').style.setProperty('--p', Math.round(pct * 100));
  $('cmdBtn').classList.toggle('ready', pct >= 1);
  var bb = $('bossBar');
  if (G.boss && !G.boss.dead) { bb.hidden = false; $('bossName').textContent = G.boss.name; $('bossFill').style.width = (G.boss.hp / G.boss.max * 100) + '%'; }
  else bb.hidden = true;
  var nx = $('nextInfo');
  if (G.state === 'countdown' && !G.overlay && !(G.boss && !G.boss.dead)) {
    nx.hidden = false;
    var paths = G.map.heads.length;
    nx.textContent = (G.wave === 0 ? 'Empieza en ' : 'Oleada ' + (G.wave + 1) + ' en ') + Math.ceil(G.timer) + (paths > 1 ? ' · ' + paths + ' caminos' : '');
  } else nx.hidden = true;
  var fxs = [];
  if (G.fx.slowAll > 0) fxs.push('❄️ ' + Math.ceil(G.fx.slowAll));
  if (G.fx.curse > 0) fxs.push('💀 ' + Math.ceil(G.fx.curse));
  if (G.fx.shield > 0) fxs.push('🛡️ ' + Math.ceil(G.fx.shield));
  $('fxInfo').textContent = fxs.join('  ');
  $('centerBtn').classList.toggle('on', !G.follow);
  selInfo();
  lastHud = v;
}

// ficha de la tropa o la losa elegida
var lastSel = '';
function selInfo() {
  var box = $('selInfo'), h = '';
  if (G.sel && G.units[G.sel]) {
    var u = G.units[G.sel], T = TROOPS[u.id], st = unitStats(u), t = tileOf(u.k);
    var bits = [];
    if (T.dmg) bits.push('Daño ' + fmt(st.dmg) + (T.wolves ? '' : ' · alcance ' + st.range.toFixed(1)));
    if (st.native) bits.push('+' + Math.round(BIOME_BONUS * (1 + bl('native')) * 100) + '% en ' + BIOMES[t.biome].name.toLowerCase());
    if (t.special) bits.push(SPECIALS[t.special].name);
    h = '<img src="assets/units/' + u.id + '.webp" alt=""><div><b>' + esc(T.name) + ' <i style="color:' + RANK_COLOR[u.rank] + '">rango ' + u.rank + '</i></b><span>' + esc(bits.join(' · ') || T.desc) + '</span></div>';
  } else if (G.selSlab && tileOf(G.selSlab)) {
    var s = tileOf(G.selSlab), B = BIOMES[s.biome];
    h = '<img src="assets/tiles/' + (s.special || s.slab) + '.webp" alt=""><div><b>' + (s.special ? SPECIALS[s.special].name : 'Losa de ' + B.name.toLowerCase()) + '</b><span>' +
      esc(s.special ? SPECIALS[s.special].desc : 'Las tropas de ' + ELEMENTS[B.el].name.toLowerCase() + ' pegan más aquí.') + ' Pulsa Invocar.</span></div>';
  }
  if (h === lastSel) return;
  lastSel = h;
  box.innerHTML = h; box.hidden = !h;
}

/* ---------- toques en el mapa ---------- */
var pointers = {}, pinch = null;
function setupInput() {
  canvas.addEventListener('pointerdown', function (e) {
    if (!G || G.over || G.paused || G.overlay) return;
    canvas.setPointerCapture(e.pointerId);
    var r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    pointers[e.pointerId] = { x: x, y: y };
    var ids = Object.keys(pointers);
    if (ids.length === 2) {
      var a = pointers[ids[0]], b = pointers[ids[1]];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
      G.drag = null;
      return;
    }
    if (ids.length > 2) return;
    var k = tileAt(x, y);
    G.drag = { from: k, unit: !!(k && G.units[k]), x: x, y: y, sx: x, sy: y, lx: x, ly: y, moved: false };
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!G) return;
    var r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (pointers[e.pointerId]) pointers[e.pointerId] = { x: x, y: y };
    var ids = Object.keys(pointers);
    if (pinch && ids.length >= 2) {
      var a = pointers[ids[0]], b = pointers[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinch.d);
      pinch.d = d;
      return;
    }
    var D = G.drag;
    if (!D) return;
    D.x = x; D.y = y;
    if (Math.hypot(x - D.sx, y - D.sy) > 8) D.moved = true;
    if (D.moved && !D.unit) {
      G.cam.x -= (x - D.lx) / G.cam.z; G.cam.y -= (y - D.ly) / G.cam.z;
      G.follow = false;
    }
    D.lx = x; D.ly = y;
  });
  var end = function (e) {
    delete pointers[e.pointerId];
    if (!G) return;
    if (pinch) { if (Object.keys(pointers).length < 2) pinch = null; G.drag = null; return; }
    var D = G.drag; G.drag = null;
    if (!D) return;
    if (!D.moved) { tapTile(D.from); return; }
    if (!D.unit) return;
    var to = tileAt(D.x, D.y);
    if (!to || to === D.from || !G.units[D.from]) return;
    if (canMerge(D.from, to)) { merge(D.from, to); G.sel = null; hud(true); }
    else if (G.units[to] || isFreeSlab(to)) { moveUnit(D.from, to); G.sel = to; }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', function (e) { delete pointers[e.pointerId]; pinch = null; if (G) G.drag = null; });
  canvas.addEventListener('wheel', function (e) {
    if (!G) return;
    e.preventDefault();
    var r = canvas.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });
  document.addEventListener('keydown', function (e) {
    if ($('game').hidden || !G) return;
    if (e.key === ' ' || e.key === 'i') { e.preventDefault(); doSummon(); }
    else if (e.key === 'c') useCommander();
    else if (e.key === 'f') recenter();
    else if (e.key === 'p' || e.key === 'Escape') togglePause();
    else if (e.key >= '1' && e.key <= '5') tapCard(G.deck[+e.key - 1]);
  });
}
function tapTile(k) {
  if (G.sel && k && k !== G.sel && G.units[G.sel]) {
    if (canMerge(G.sel, k)) { merge(G.sel, k); G.sel = null; hud(true); return; }
    if (isFreeSlab(k)) { moveUnit(G.sel, k); G.sel = null; return; }
  }
  if (k && G.units[k]) { G.sel = G.sel === k ? null : k; G.selSlab = null; sfx('tap'); return; }
  if (isFreeSlab(k)) { G.selSlab = G.selSlab === k ? null : k; G.sel = null; sfx('tap'); return; }
  G.sel = null; G.selSlab = null;
}
function doSummon() { if (G && !G.paused && !G.overlay && !G.over) { summon(); hud(true); if (unitCount() >= 3) tutorial(1); } }
function recenter() { if (G) { G.follow = true; } }
function cycleSpeed() {
  G.speed = G.speed === 1 ? 2 : G.speed === 2 ? 3 : 1;
  SETTINGS.speed = G.speed; saveSettings();
  $('speedBtn').textContent = 'x' + G.speed;
}

/* ---------- capas ---------- */
function openOverlay(html) { $('overlay').innerHTML = html; $('overlay').hidden = false; G.overlay = true; }
function closeOverlay() { $('overlay').hidden = true; if (G) G.overlay = false; }

function mapLine() {
  var M = G.map;
  return esc(M.name) + ' · código ' + G.seed + ' · ' + M.pathList.length + ' casillas de camino · ' + M.heads.length + (M.heads.length === 1 ? ' portal' : ' portales');
}
function togglePause() {
  if (!G || G.over) return;
  if (G.overlay && !G.paused) return;
  if (G.paused) { G.paused = false; closeOverlay(); return; }
  G.paused = true;
  var blessList = Object.keys(G.bless).map(function (k) { var b = BLESSINGS.find(function (x) { return x.id === k; }); return '<span class="chip"><img src="assets/' + b.icon + '.webp" alt="">' + esc(b.name) + (G.bless[k] > 1 ? ' x' + G.bless[k] : '') + '</span>'; }).join('');
  openOverlay('<div class="ov-card"><h2>Pausa</h2>' +
    '<p class="muted">' + modeName(G.mode) + ' · ' + G.kills + ' monstruos</p><p class="muted">' + mapLine() + '</p>' +
    (blessList ? '<div class="chips">' + blessList + '</div>' : '') +
    damageTable() +
    '<button class="mid-btn gold" onclick="togglePause()">Seguir</button>' +
    '<button class="mid-btn" onclick="SETTINGS.sound=!SETTINGS.sound;saveSettings();this.textContent=SETTINGS.sound?\'Silenciar\':\'Activar sonido\'">' + (SETTINGS.sound ? 'Silenciar' : 'Activar sonido') + '</button>' +
    '<button class="mid-btn" onclick="saveAndExit()">Guardar y salir</button>' +
    '<button class="mid-btn danger" onclick="surrender()">Rendirse</button></div>');
}
function saveAndExit() {
  G.paused = false; closeOverlay();
  if (G.wave > 0 || unitCount()) { var s = snapshot(); if (G.state !== 'countdown') s.wave = Math.max(0, G.wave - 1); store('fronteras-run', s); }
  G = null; renderHome();
}
function surrender() {
  if (!confirm('¿Rendirte? La partida acaba aquí.')) return;
  G.paused = false; closeOverlay(); gameOver();
}
function damageTable() {
  var tot = 0; G.deck.forEach(function (id) { tot += G.dmgBy[id] || 0; });
  if (!tot) return '';
  return '<div class="dmg">' + G.deck.filter(isAttacker).sort(function (a, b) { return (G.dmgBy[b] || 0) - (G.dmgBy[a] || 0); }).map(function (id) {
    var v = G.dmgBy[id] || 0;
    return '<div class="dr"><img src="assets/units/' + id + '.webp" alt=""><div class="db"><i style="width:' + (v / tot * 100) + '%"></i></div><b>' + fmt(v) + '</b></div>';
  }).join('') + '</div>';
}

function offerBlessing() {
  var pool = BLESSINGS.filter(function (b) {
    if (bl(b.id) >= b.max) return false;
    if (b.id.indexOf('el_') === 0) return G.deck.some(function (id) { return TROOPS[id].el === b.id.slice(3); });
    return true;
  });
  var pick = [];
  while (pick.length < 3 && pool.length) pick.push(pool.splice((G.rng() * pool.length) | 0, 1)[0]);
  if (!pick.length) return;
  sfx('bless');
  openOverlay('<div class="ov-card wide"><h2>Bendición</h2><p class="muted">Elige una. Se suma a las que ya tienes.</p><div class="bless-row">' +
    pick.map(function (b) {
      return '<button class="bless" onclick="takeBlessing(\'' + b.id + '\')"><img src="assets/' + b.icon + '.webp" alt=""><div><b>' + esc(b.name) + '</b><span>' + esc(b.desc) + '</span>' + (bl(b.id) ? '<small>Ya tienes ' + bl(b.id) + '</small>' : '') + '</div></button>';
    }).join('') + '</div></div>');
}
function takeBlessing(id) {
  G.bless[id] = bl(id) + 1;
  if (id === 'lives') G.lives += 3;
  closeOverlay(); hud(true); saveRun();
}

function onGameOver() {
  var rec = false;
  META.played++; META.kills += G.kills;
  if (G.mode === 'expedicion' && G.wave > (META.best.expedicion || 0)) { META.best.expedicion = G.wave; rec = true; }
  if (G.mode === 'diario' && G.day) META.daily[G.day] = Math.max(META.daily[G.day] || 0, G.wave);
  META.longest = Math.max(META.longest || 0, G.map.pathList.length);
  META.runs.unshift({ mode: G.mode, wave: G.wave, deck: G.deck, seed: G.seed, name: G.map.name, date: Date.now() });
  META.runs = META.runs.slice(0, 12);
  saveMeta();
  var mins = Math.floor(G.time / 60), secs = Math.floor(G.time % 60);
  openOverlay('<div class="ov-card"><h2>' + (rec ? '¡Récord!' : 'Ha caído el castillo') + '</h2>' +
    '<div class="stats-row"><div><b>' + G.wave + '</b><span>Oleada</span></div><div><b>' + G.kills + '</b><span>Monstruos</span></div><div><b>' + mins + ':' + String(secs).padStart(2, '0') + '</b><span>Tiempo</span></div></div>' +
    '<p class="muted">' + mapLine() + '</p>' +
    damageTable() +
    '<button class="mid-btn gold" onclick="again(false)">Mapa nuevo</button><button class="mid-btn" onclick="again(true)">Mismo mapa</button><button class="mid-btn" onclick="G=null;renderHome()">Menú</button></div>');
}
function again(same) {
  var o = { mode: G.mode, deck: G.deck, cmd: G.cmd };
  if (G.mode === 'diario') { var d = dailySetup(); o.seed = d.seed; if (!same) { o.mode = 'expedicion'; o.seed = null; o.deck = META.deck; o.cmd = META.cmd; } }
  else if (same) { o.seed = G.seed; o.mode = 'codigo'; }
  else o.mode = 'expedicion';
  var day = o.mode === 'diario';
  beginRun(o);
  if (day) G.day = todayKey();
}

/* ---------- bucle ---------- */
var lastT = 0, hudT = 0;
function loop(t) {
  requestAnimationFrame(loop);
  if (!G || $('game').hidden) { lastT = t; return; }
  var dt = Math.min(0.05, (t - lastT) / 1000 || 0); lastT = t;
  for (var k = 0; k < G.speed; k++) update(dt);
  render(dt);
  hudT += dt;
  if (hudT > 0.1) { hudT = 0; hud(); }
}

window.addEventListener('load', function () {
  canvas = $('cv'); ctx = canvas.getContext('2d');
  setupInput();
  window.addEventListener('resize', resizeCanvas);
  document.addEventListener('visibilitychange', function () { if (document.hidden && G && !G.over && !G.paused && !G.overlay) togglePause(); });
  renderHome();
  requestAnimationFrame(loop);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
});
