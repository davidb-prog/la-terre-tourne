// Câblage de l'interface : boucle d'animation, curseur du temps, recherche de
// lieux (hors-ligne, deux moteurs synchronisés), vol du globe, deux
// cartes-horloges (la France et le lieu choisi), scénarios racontés.

import { TAU, DEG, PLACES, HOME, SCENARIOS, wrap24, localClock, formatHM,
         periodWord, activityFor, dayBadge, sunriseHomeH,
         placePhrase, offsetDiffText, cameraFrame,
         texteOral, blocsScenario } from './model.js';
import { MapView, SkyView, PoleView, buildClock, pointInRing } from './views.js';
import { Globe3D } from './view3d.js';
import { GAZETTEER, DECOR, searchPlaces, flagEmoji, IDEES_VOYAGE } from './places.js';
import { COUNTRIES } from './geo.js';

const $ = (id) => document.getElementById(id);
const wrapPi = (a) => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Windows n'a pas de drapeaux émoji : Chrome y affiche « TH » pour 🇹🇭 — et
// ces lettres sont EN COULEUR (police émoji), un test de couleur ne suffit
// donc pas. Le vrai discriminant est la largeur : avec de vrais drapeaux, la
// paire d'indicateurs se ligature en UN glyphe (≈ la largeur d'un indicateur
// seul) ; sans, elle s'étale sur deux lettres (≈ le double). Repli 📍 partout
// où un drapeau devait apparaître.
const flagsOk = (() => {
  try {
    const x = document.createElement('canvas').getContext('2d');
    x.font = '32px sans-serif';
    const pair = x.measureText('🇹🇭').width;
    const single = x.measureText('🇹').width;
    return pair > 0 && single > 0 && pair < single * 1.5;
  } catch (e) { return true; } // dans le doute, on garde les drapeaux
})();
const flag = (iso) => (flagsOk ? flagEmoji(iso) : '📍');

const sim = {
  homeH: 12,              // on ouvre sur le cas d'école : midi chez nous
  playing: !reduceMotion, // la Terre tourne toute seule (un tour en 80 s)
  spinSpeed: 24 / 80,
  tween: null,            // { from, delta, target, start, dur } pendant un scénario
};
let activeScn = null; // le scénario affiché : { scn, atH } — nul dès qu'on reprend la main

const globe3d = new Globe3D($('globe3d-view'));
const map = new MapView($('map-view'));
const pole = new PoleView($('pole-view'));

// ---- le lieu choisi (la Guadeloupe par défaut, en attendant une recherche) ----

const FRANCE = PLACES[1];

function defaultSelected() {
  const g = PLACES[0];
  return {
    id: 'selected', selectable: true, isDefault: true,
    name: g.name, emoji: g.emoji, scene: g.scene,
    lonDeg: g.lonDeg, latDeg: g.latDeg, utcOffset: g.utcOffset,
    color: '#ffcf5c', iso: null, pays: false,
  };
}
let selected = defaultSelected();

function displayedPlaces() { return [FRANCE, selected]; }

// ---- les deux cartes-horloges ----

const cardsBox = $('cards');
let cards = [];

function buildCards() {
  cardsBox.innerHTML = '';
  cards = displayedPlaces().map((place) => {
    const el = document.createElement('article');
    el.className = 'panel vignette';
    el.style.setProperty('--place', place.color);

    const head = document.createElement('header');
    head.className = 'vignette-head';
    const name = document.createElement('h3');
    name.className = 'vignette-name';
    name.textContent = place.emoji + ' ' + place.name;
    if (place.home) {
      const chip = document.createElement('span');
      chip.className = 'home-chip';
      chip.textContent = 'chez nous';
      name.appendChild(document.createTextNode(' '));
      name.appendChild(chip);
    }
    head.appendChild(name);
    const badge = document.createElement('span');
    badge.className = 'day-badge';
    badge.id = 'badge-' + place.id;
    badge.hidden = true;
    head.appendChild(badge);
    if (place.selectable && !place.isDefault) {
      const close = document.createElement('button');
      close.className = 'card-close';
      close.textContent = '✕';
      close.setAttribute('aria-label', 'Retirer ' + place.name + ' et revenir à la Guadeloupe');
      close.addEventListener('click', () => {
        selected = defaultSelected();
        buildCards();
        pole.pulse = { lonDeg: selected.lonDeg, home: false, k: 1 };
        globe3d.pulse = { lonDeg: selected.lonDeg, latDeg: selected.latDeg, k: 1 };
        centerCameraOn(selected.lonDeg, selected.latDeg); // on recadre aussi
        if (activeScn) runScenario(activeScn.scn); // l'histoire suit
      });
      head.appendChild(close);
    }

    const body = document.createElement('div');
    body.className = 'vignette-body';
    const slot = document.createElement('div');
    slot.className = 'clock-slot';
    const text = document.createElement('div');
    text.className = 'clock-text';
    const digital = document.createElement('div');
    digital.className = 'clock-digital';
    digital.id = 'digital-' + place.id;
    const period = document.createElement('div');
    period.className = 'clock-period';
    period.id = 'period-' + place.id;
    const activity = document.createElement('div');
    activity.className = 'activity';
    text.appendChild(digital); text.appendChild(period); text.appendChild(activity);
    body.appendChild(slot); body.appendChild(text);

    const skyWrap = document.createElement('div');
    skyWrap.className = 'sky-wrap';
    const skyCanvas = document.createElement('canvas');
    skyCanvas.setAttribute('aria-label', 'Le ciel en ce moment — ' + place.name);
    skyWrap.appendChild(skyCanvas);

    el.appendChild(head); el.appendChild(body); el.appendChild(skyWrap);
    cardsBox.appendChild(el);
    return {
      place: place, clock: buildClock(slot), sky: new SkyView(skyCanvas, place),
      digital: digital, period: period, activity: activity, badge: badge, cache: {},
    };
  });
  frameCache.name = null; // le cadre du globe se resynchronise
}

// ---- la recherche de lieux : deux moteurs synchronisés, zéro appel réseau ----

function choosePlace(entry) {
  selected = {
    id: 'selected', selectable: true, isDefault: false,
    name: entry.n,
    emoji: flag(entry.iso),
    lonDeg: entry.lon, latDeg: entry.lat,
    utcOffset: entry.tz,
    color: '#ffcf5c',
    iso: entry.pays ? entry.iso : null, // seul un pays est surligné sur les cartes
    pays: !!entry.pays, // pour la préposition dite à voix haute (« au Japon »)
  };
  buildCards();
  pole.pulse = { lonDeg: entry.lon, home: false, k: 1 };
  globe3d.pulse = { lonDeg: entry.lon, latDeg: entry.lat, k: 1 };
  centerCameraOn(entry.lon, entry.lat);
  // si un moment est affiché dans « Joue avec la Terre », son histoire (et sa
  // version sonore) suit la nouvelle destination sans attendre un re-clic
  if (activeScn) runScenario(activeScn.scn);
}

function wireSearch(inputId, resultsId) {
  const input = $(inputId);
  const box = $(resultsId);
  let results = [];
  const hide = () => { box.hidden = true; box.innerHTML = ''; results = []; };
  const show = (list) => {
    box.innerHTML = '';
    results = list;
    if (!list.length) {
      const none = document.createElement('div');
      none.className = 'none';
      none.textContent = 'Pas trouvé… essaie une grande ville ou un pays !';
      box.appendChild(none);
    }
    for (const e of list) {
      const btn = document.createElement('button');
      btn.type = 'button';
      const fl = document.createElement('span');
      fl.textContent = flag(e.iso);
      const nm = document.createElement('span');
      nm.textContent = e.n;
      const sub = document.createElement('span');
      sub.className = 'sub';
      sub.textContent = e.pays ? 'pays' : (e.c || '');
      btn.appendChild(fl); btn.appendChild(nm); btn.appendChild(sub);
      btn.addEventListener('mousedown', (ev) => ev.preventDefault()); // garde le focus
      btn.addEventListener('click', () => { input.value = ''; hide(); choosePlace(e); });
      box.appendChild(btn);
    }
    box.hidden = false;
  };
  input.addEventListener('input', () => {
    const v = input.value;
    if (v.trim().length < 2) { hide(); return; }
    show(searchPlaces(v, 7));
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && results.length) { input.value = ''; const r = results[0]; hide(); choosePlace(r); }
    if (e.key === 'Escape') { hide(); input.blur(); }
  });
  input.addEventListener('blur', () => { setTimeout(hide, 150); });
}
wireSearch('place-search', 'search-results');
wireSearch('place-search-map', 'search-results-map');

// quelques idées de voyage prêtes à cliquer — en haut de page et, sur grand
// écran, répliquées sous la carte à plat du jeu. Le conteur retient leurs
// noms résolus : ces lieux-là ont une transition nommée (« Et pendant ce
// temps, à Tahiti… ») enregistrée — les autres s'entendent « là-bas ».
const puceNames = {};
for (const boxId of ['search-chips', 'search-chips-map']) {
  const chipsBox = $(boxId);
  if (!chipsBox) continue;
  for (const idea of IDEES_VOYAGE) {
    const found = searchPlaces(idea, 1);
    if (!found.length) continue;
    puceNames[found[0].n] = true;
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = flag(found[0].iso) + ' ' + found[0].n;
    b.addEventListener('click', () => choosePlace(found[0]));
    chipsBox.appendChild(b);
  }
}

// ---- le vol de caméra : la Terre et les horloges ne bougent jamais, seule
// la caméra pivote, en douceur, jusqu'au cadrage calculé par cameraFrame ----

let camAnim = null; // { y0, dy, p0, dp, start, dur } pendant un vol

function flyCameraTo(target) {
  camAnim = null;
  if (reduceMotion) { globe3d.yaw = target.yaw; globe3d.pitch = target.pitch; return; }
  const y0 = wrapPi(globe3d.yaw), p0 = globe3d.pitch;
  const d0 = wrapPi(y0 + Math.PI / 2), d1 = wrapPi(target.yaw + Math.PI / 2);
  let dy = wrapPi(target.yaw - y0);
  if (d0 * d1 < 0) {
    // le Soleil doit changer de côté : on contourne par la face nuit (le
    // Soleil glisse derrière la Terre puis ressort de l'autre côté) plutôt
    // que de traverser le plein jour — la vue que le site s'interdit
    const s = d0 >= 0 ? 1 : -1;
    dy = s * ((((d1 - d0) * s) % TAU + TAU) % TAU);
  }
  if (Math.abs(dy) < 0.001 && Math.abs(target.pitch - p0) < 0.001) {
    globe3d.yaw = target.yaw; globe3d.pitch = target.pitch;
    return;
  }
  camAnim = { y0: y0, dy: dy, p0: p0, dp: target.pitch - p0,
    start: performance.now(), dur: 500 + 420 * Math.abs(dy) / Math.PI };
}

// Choisir un lieu ne fait pas bouger la Terre (l'heure ne change pas d'un
// poil) : c'est la caméra qui vole vers lui. Le cadrage borné de cameraFrame
// garantit deux choses en toutes circonstances : la limite jour/nuit reste à
// l'écran (jamais la face jour pile en face), et le Soleil reste visible sur
// son côté (jamais caché derrière la Terre) — un lieu en pleine nuit
// s'affiche donc vers le bord sombre, à l'opposé du Soleil.
function centerCameraOn(lonDeg, latDeg, opts) {
  const o = opts || {};
  const target = cameraFrame(sim.homeH, lonDeg, latDeg);
  if (o.jump) {
    camAnim = null;
    globe3d.yaw = target.yaw; globe3d.pitch = target.pitch;
  } else {
    flyCameraTo(target);
  }
  setActiveView(o.chip || 'dest');
}

// ---- les deux boutons de lieux sous le globe : « chez nous » et la
// destination — on appuie, le globe pivote jusqu'au lieu, l'heure ne change
// pas. C'est aussi la sortie de secours si on s'est perdu côté nuit. ----

const viewChips = {
  france: $('view-france'),
  dest: $('view-dest'),
};

function setActiveView(id) {
  for (const key in viewChips) {
    viewChips[key].classList.toggle('active', key === id);
    viewChips[key].setAttribute('aria-pressed', key === id ? 'true' : 'false');
  }
}

viewChips.france.addEventListener('click', () => {
  globe3d.pulse = { lonDeg: FRANCE.lonDeg, latDeg: FRANCE.latDeg, k: 1 };
  centerCameraOn(FRANCE.lonDeg, FRANCE.latDeg, { chip: 'france' });
});
viewChips.dest.addEventListener('click', () => {
  globe3d.pulse = { lonDeg: selected.lonDeg, latDeg: selected.latDeg, k: 1 };
  centerCameraOn(selected.lonDeg, selected.latDeg);
});

// ---- lecture / pause et curseur ----

const slider = $('time-slider');
let sliderHeld = false;

function setPlaying(p) {
  sim.playing = p;
  // les deux libellés vivent empilés dans chaque bouton (largeur stable) :
  // basculer aria-pressed montre l'un, cache l'autre — l'ancien libellé long
  // « ▶ Elle tourne toute seule » décalait toute la page à chaque clic
  for (const id of ['btn-spin', 'btn-spin-globe', 'btn-spin-map']) { // boutons jumeaux
    const btn = $(id);
    if (!btn) continue;
    btn.setAttribute('aria-pressed', p ? 'true' : 'false');
    btn.setAttribute('aria-label', p
      ? 'Mettre en pause (la Terre tourne toute seule)'
      : 'Relancer la Terre qui tourne toute seule');
  }
}

function stopAuto() {
  sim.tween = null;
  activeScn = null;
  if (sim.playing) setPlaying(false);
  setActiveScenario(null);
}

function hideHint() {
  const hint = $('drag-hint');
  if (hint) hint.classList.add('hide');
}
setTimeout(hideHint, 8000);

slider.addEventListener('input', () => {
  sim.homeH = wrap24(+slider.value);
  stopAuto();
});
slider.addEventListener('pointerdown', () => { sliderHeld = true; });
window.addEventListener('pointerup', () => { sliderHeld = false; });
window.addEventListener('pointercancel', () => { sliderHeld = false; });

function toggleSpin() {
  sim.tween = null;
  activeScn = null;
  setActiveScenario(null);
  setPlaying(!sim.playing);
}
$('btn-spin').addEventListener('click', toggleSpin);
$('btn-spin-globe').addEventListener('click', toggleSpin);
$('btn-spin-map').addEventListener('click', toggleSpin);
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !e.target.closest('button, input, a, summary')) {
    e.preventDefault();
    toggleSpin();
  }
});

// ---- cliquer sur un pays ou une ville : il devient le lieu observé ----

const COUNTRY_ENTRY = {};
for (const e of GAZETTEER) {
  if (e.pays && e.iso && !COUNTRY_ENTRY[e.iso]) COUNTRY_ENTRY[e.iso] = e;
}
function cityEntryByName(name) {
  for (const e of GAZETTEER) if (!e.pays && e.n === name) return e;
  return null;
}

// (lon, lat) cliqué → l'entrée du répertoire : ville-décor proche, sinon pays.
function resolveHit(ll) {
  if (!ll) return null;
  let best = null, bestD = 5; // ~5° de tolérance autour des villes nommées
  for (const d of DECOR) {
    const dLon = Math.abs(((d.lon - ll.lonDeg + 540) % 360) - 180);
    const dist = Math.max(dLon * Math.cos(ll.latDeg * DEG), Math.abs(d.lat - ll.latDeg));
    if (dist < bestD) { bestD = dist; best = d; }
  }
  if (best) {
    const e = cityEntryByName(best.n);
    if (e) return e;
  }
  for (const c of COUNTRIES) {
    if (!c.iso || !COUNTRY_ENTRY[c.iso]) continue;
    for (const ring of c.rings) {
      if (pointInRing(ll.lonDeg, ll.latDeg, ring)) {
        const e = COUNTRY_ENTRY[c.iso];
        return e.n === 'France' ? null : e; // la France est déjà « chez nous »
      }
    }
  }
  // aucun pays sous le doigt ? C'est peut-être une petite île dessinée à la
  // main (Guadeloupe, Tahiti, Maldives… — pas de polygone Natural Earth
  // 110m) : on prend le lieu du répertoire le plus proche, s'il est à moins
  // de ~3° — le premier du répertoire gagne à égalité, ce qui préfère
  // « La Réunion » à « Saint-Denis (La Réunion) »
  let isle = null, isleD = 3;
  for (const e of GAZETTEER) {
    const dLon = Math.abs(((e.lon - ll.lonDeg + 540) % 360) - 180);
    const dist = Math.max(dLon * Math.cos(ll.latDeg * DEG), Math.abs(e.lat - ll.latDeg));
    if (dist < isleD) { isleD = dist; isle = e; }
  }
  if (isle && isle.n !== 'France') return isle;
  return null;
}

// ---- pince à deux doigts (tactile, donc mobile/tablette) : sur les deux
// vues du jeu, écarter/rapprocher les doigts zoome. Dès que deux doigts sont
// posés, le glisser à un doigt et le clic sont neutralisés : zoomer ne change
// jamais l'heure et ne choisit jamais de pays. ----

function makePinch(onPinch) {
  const touches = {}; // pointerId → [x, y] des doigts posés (clavier/souris exclus)
  const ids = () => Object.keys(touches);
  const span = () => { // écart et point médian entre les deux premiers doigts
    const k = ids();
    const a = touches[k[0]], b = touches[k[1]];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    return { d: Math.sqrt(dx * dx + dy * dy) || 1, mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2 };
  };
  let last = null;
  return {
    // vrai dès que ce doigt fait passer en mode pince
    down: (e) => {
      if (e.pointerType !== 'touch') return false;
      touches[e.pointerId] = [e.clientX, e.clientY];
      if (ids().length >= 2) { last = span(); return true; }
      return false;
    },
    // vrai si la pince a consommé le mouvement
    move: (e) => {
      if (touches[e.pointerId]) touches[e.pointerId] = [e.clientX, e.clientY];
      if (ids().length < 2) return false;
      const s = span();
      onPinch(s.d / last.d, s.mx - last.mx, s.my - last.my, s);
      last = s;
      return true;
    },
    up: (e) => {
      delete touches[e.pointerId];
      if (ids().length < 2) last = null;
    },
    active: () => ids().length >= 2,
  };
}

// Safari iOS ignore user-scalable=no depuis iOS 10 : on neutralise aussi le
// zoom pincé de la PAGE par son événement propriétaire (inconnu ailleurs,
// donc sans effet). Les vues du jeu ne passent pas par là : leur pince à
// elles vit dans makePinch, sur des éléments en touch-action: none.
document.addEventListener('gesturestart', (e) => { e.preventDefault(); });

// ---- retour au zoom 1 en douceur (saut sec en mouvement réduit) : `run`
// anime la vue de son état capturé par `snap` vers apply(état, 1) ; `cancel`
// dès que la main reprend la vue ----

function makeDezoom(snap, apply) {
  let token = 0;
  return {
    cancel: () => { token++; },
    run: () => {
      const my = ++token, s0 = snap();
      if (reduceMotion) { apply(s0, 1); return; }
      const start = performance.now(), dur = 260;
      const step = (now) => {
        if (my !== token) return; // la main a repris la vue : on s'arrête
        const t = Math.min(1, (now - start) / dur);
        apply(s0, 1 - Math.pow(1 - t, 3));
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    },
  };
}

// ---- double-tap : deux petits taps rapprochés (fenêtre DBL_TAP_MS, < 30 px).
// Sur une vue zoomée il dézoome — et pour qu'il ne choisisse pas un pays au
// passage, la sélection au tap est différée de la même fenêtre tant que la
// vue est zoomée (le second tap l'annule ; fenêtre et délai doivent rester
// égaux, sinon la sélection peut partir avant le second tap). À zoom 1, la
// sélection reste immédiate, comme toujours. ----

const DBL_TAP_MS = 400;

function makeDoubleTap(isZoomed, onDouble, onTap) {
  let last = null, timer = null;
  return {
    cancelPending: () => { if (timer) { clearTimeout(timer); timer = null; } },
    tap: (x, y) => {
      const now = performance.now();
      if (last && now - last.t < DBL_TAP_MS && Math.abs(x - last.x) < 30 && Math.abs(y - last.y) < 30) {
        last = null;
        if (timer) { clearTimeout(timer); timer = null; }
        if (isZoomed()) onDouble();
        return;
      }
      last = { t: now, x: x, y: y };
      if (isZoomed()) {
        timer = setTimeout(() => { timer = null; onTap(x, y); }, DBL_TAP_MS);
      } else {
        onTap(x, y);
      }
    },
  };
}

// ---- glisser sur le globe : horizontalement on TOURNE LA TERRE (l'heure
// change, le Soleil ne bouge pas), verticalement on la penche ; un petit clic
// choisit le pays ou la ville sous le doigt ; la pince zoome, le double-tap
// dézoome ----

function wireEarthDrag(canvas) {
  let dragging = false, lastX = 0, lastY = 0, downX = 0, moved = 0, downT = 0;
  let timeUnlocked = false;
  const pinch = makePinch((k) => {
    globe3d.zoom = Math.max(1, Math.min(5, globe3d.zoom * k));
  });
  const dezoom = makeDezoom(() => globe3d.zoom,
    (z0, k) => { globe3d.zoom = z0 + (1 - z0) * k; });
  const dtap = makeDoubleTap(() => globe3d.zoom > 1, dezoom.run, (x, y) => {
    const rect = canvas.getBoundingClientRect();
    const hit = resolveHit(globe3d.hitTest(x - rect.left, y - rect.top));
    if (hit) choosePlace(hit);
  });
  canvas.addEventListener('pointerdown', (e) => {
    if (!globe3d.layout) return;
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
    hideHint();
    e.preventDefault();
    dezoom.cancel();
    dtap.cancelPending();
    if (pinch.down(e)) { dragging = false; camAnim = null; return; }
    dragging = true;
    timeUnlocked = false;
    lastX = e.clientX; lastY = e.clientY;
    downX = e.clientX; moved = 0; downT = performance.now();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (pinch.move(e)) return;
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    moved += Math.abs(dx) + Math.abs(dy);
    if (moved > 6) {
      camAnim = null; // la main reprend la caméra : le vol en cours s'arrête
      if (!timeUnlocked && Math.abs(e.clientX - downX) > 8) {
        timeUnlocked = true;
        stopAuto();
      }
      if (timeUnlocked) {
        sim.homeH = wrap24(sim.homeH + dx / globe3d.layout.R * 24 / TAU);
      }
      globe3d.pitch = Math.max(-1.1, Math.min(1.1, globe3d.pitch + dy / globe3d.layout.R));
    }
    lastX = e.clientX; lastY = e.clientY;
  });
  canvas.addEventListener('pointerup', (e) => {
    const wasPinch = pinch.active();
    pinch.up(e);
    if (dragging && !wasPinch && moved <= 6 && performance.now() - downT < 600) {
      dtap.tap(e.clientX, e.clientY);
    }
    dragging = false;
  });
  canvas.addEventListener('pointercancel', (e) => { pinch.up(e); dragging = false; });
}

// ---- glisser sur la carte : là, on déplace la nuit (donc l'heure) ; la
// pince zoome autour des doigts, et dans la carte zoomée on se promène au
// doigt (un ou deux) sans toucher à l'heure — le glisser-heure revient
// dès qu'on a dézoomé (pince resserrée ou double-tap) ----

function wireMapDrag(canvas) {
  let dragging = false, lastX = 0, lastY = 0, moved = 0, downT = 0;
  const pinch = makePinch((k, mdx, mdy, s) => {
    const L = map.layout;
    if (!L) return;
    const rect = canvas.getBoundingClientRect();
    // le point de carte pincé reste sous les doigts pendant le zoom, puis
    // suit leur déplacement ; MapView borne le pan au cadre en dessinant
    const mx = s.mx - rect.left - (L.ox + L.W / 2);
    const my = s.my - rect.top - (L.oy + L.H / 2);
    const z0 = map.zoom;
    map.zoom = Math.max(1, Math.min(6, z0 * k));
    map.panX = mx + mdx - (mx - map.panX) * (map.zoom / z0);
    map.panY = my + mdy - (my - map.panY) * (map.zoom / z0);
  });
  const dezoom = makeDezoom(() => [map.zoom, map.panX, map.panY], (s, k) => {
    map.zoom = s[0] + (1 - s[0]) * k;
    map.panX = s[1] * (1 - k);
    map.panY = s[2] * (1 - k);
  });
  const dtap = makeDoubleTap(() => map.zoom > 1, dezoom.run, (x, y) => {
    const rect = canvas.getBoundingClientRect();
    const hit = resolveHit(map.hitTest(x - rect.left, y - rect.top));
    if (hit) choosePlace(hit);
  });
  canvas.addEventListener('pointerdown', (e) => {
    if (!map.layout) return;
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
    dezoom.cancel();
    dtap.cancelPending();
    if (pinch.down(e)) { dragging = false; return; }
    dragging = true;
    lastX = e.clientX; lastY = e.clientY; moved = 0; downT = performance.now();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (pinch.move(e)) return;
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    moved += Math.abs(dx) + Math.abs(dy);
    if (moved > 6) {
      if (map.layout.z > 1) {
        // carte zoomée : un doigt s'y promène, comme dans toute appli de
        // cartes — l'heure ne bouge pas ; le glisser-heure revient dès
        // qu'on a dézoomé (MapView borne le pan au cadre en dessinant)
        map.panX += dx;
        map.panY += dy;
      } else {
        if (sim.playing || sim.tween) stopAuto();
        sim.homeH = wrap24(sim.homeH - dx / map.layout.W * 24);
      }
    }
    lastX = e.clientX; lastY = e.clientY;
  });
  canvas.addEventListener('pointerup', (e) => {
    const wasPinch = pinch.active();
    pinch.up(e);
    if (dragging && !wasPinch && moved <= 6 && performance.now() - downT < 600) {
      dtap.tap(e.clientX, e.clientY);
    }
    dragging = false;
  });
  canvas.addEventListener('pointercancel', (e) => { pinch.up(e); dragging = false; });
}

// ---- glisser sur la vue du pôle : on attrape le disque et on le fait
// tourner — l'angle du doigt autour du centre devient directement l'heure,
// dans le vrai sens (vers l'est, sens inverse des aiguilles vu du pôle) ----

function wirePoleDrag(canvas) {
  let dragging = false, lastA = null;
  const angleAt = (e) => {
    const l = pole.layout;
    if (!l) return null;
    const rect = canvas.getBoundingClientRect();
    const dx = (e.clientX - rect.left) - l.cx, dy = l.cy - (e.clientY - rect.top);
    // trop près du centre, l'angle s'affole : on ignore ces positions
    if (dx * dx + dy * dy < 0.18 * 0.18 * l.R * l.R) return null;
    return Math.atan2(dy, dx);
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (!pole.layout) return;
    dragging = true;
    lastA = angleAt(e);
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
    hideHint();
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const a = angleAt(e);
    if (a === null || lastA === null) { lastA = a; return; }
    const dA = wrapPi(a - lastA);
    if (dA) {
      if (sim.playing || sim.tween) stopAuto();
      sim.homeH = wrap24(sim.homeH + dA / TAU * 24);
    }
    lastA = a;
  });
  const stopDrag = () => { dragging = false; lastA = null; };
  canvas.addEventListener('pointerup', stopDrag);
  canvas.addEventListener('pointercancel', stopDrag);
}

wirePoleDrag($('pole-view'));
wireEarthDrag($('globe3d-view'));
wireMapDrag($('map-view'));

// ---- les boutons-scénarios ----

const scnButtons = {};
const scnBox = $('scenario-buttons');
for (const scn of SCENARIOS) {
  const btn = document.createElement('button');
  btn.className = 'scn scn-' + scn.id;
  btn.setAttribute('aria-pressed', 'false');
  const em = document.createElement('span');
  em.className = 'scn-emoji';
  em.textContent = scn.emoji;
  const lab = document.createElement('span');
  lab.textContent = scn.label;
  const sub = document.createElement('span');
  sub.className = 'scn-sub';
  sub.textContent = scn.sub;
  btn.appendChild(em); btn.appendChild(lab); btn.appendChild(sub);
  btn.addEventListener('click', () => runScenario(scn));
  scnBox.appendChild(btn);
  scnButtons[scn.id] = btn;
}

function setActiveScenario(id) {
  for (const key in scnButtons) {
    scnButtons[key].classList.toggle('active', key === id);
    scnButtons[key].setAttribute('aria-pressed', key === id ? 'true' : 'false');
  }
}

function renderInvite() {
  const box = $('story');
  box.innerHTML = '';
  const p = document.createElement('p');
  p.className = 'story-invite';
  p.textContent = 'Appuie sur un bouton : la Terre tourne jusqu’au bon moment, et on te raconte.';
  box.appendChild(p);
}

// L'histoire du moment : la France (texte écrit) + le lieu choisi (phrase générée).
function renderStory(scn, atH) {
  const box = $('story');
  box.innerHTML = '';
  const lines = [
    { cls: 'story-chip-france', chip: FRANCE.emoji + ' ' + FRANCE.name,
      text: scn.france || placePhrase(atH, FRANCE) },
    { cls: 'story-chip-selected', chip: selected.emoji + ' ' + selected.name,
      text: placePhrase(atH, selected, selected.utcOffset === FRANCE.utcOffset) },
  ];
  for (const line of lines) {
    const row = document.createElement('div');
    row.className = 'story-line';
    const chip = document.createElement('span');
    chip.className = 'story-chip ' + line.cls;
    chip.textContent = line.chip;
    const txt = document.createElement('p');
    txt.className = 'story-text';
    txt.textContent = line.text;
    row.appendChild(chip); row.appendChild(txt);
    box.appendChild(row);
  }
}

// La Terre tourne en douceur (toujours vers l'avant, son vrai sens) jusqu'au moment choisi.
function runScenario(scn) {
  const atH = scn.sunriseAt ? sunriseHomeH(selected.lonDeg) : scn.homeH;
  setPlaying(false);
  setActiveScenario(scn.id);
  renderStory(scn, atH);
  activeScn = { scn: scn, atH: atH };
  tellScenario(); // la version sonore, si le parent l'a activée
  const delta = wrap24(atH - sim.homeH);
  if (reduceMotion || delta < 0.02) {
    sim.tween = null;
    sim.homeH = atH;
    return;
  }
  sim.tween = {
    from: sim.homeH, delta: delta, target: atH,
    start: performance.now(), dur: Math.min(2600, 700 + delta * 90),
  };
}

// ---- mise à jour des textes (seulement quand ils changent) ----

function setText(cache, key, el, value) {
  if (cache[key] === value) return;
  cache[key] = value;
  el.textContent = value;
}

// les cadres posés sur la vue du pôle et sous le globe du jeu, plus la barre
// collante du haut d'écran (mobile) : l'heure ici, l'heure là-bas, et l'écart
// — même contenu aux trois endroits
const FRAME_IDS = ['', '-globe', '-sticky'];
const frameCache = { name: null };

function updateFrame() {
  const homeText = formatHM(sim.homeH).text;
  const selText = formatHM(localClock(sim.homeH, selected).hours).text;
  const nameChanged = frameCache.name !== selected.name;
  if (nameChanged) frameCache.name = selected.name;
  for (const sfx of FRAME_IDS) {
    setText(frameCache, 'home' + sfx, $('frame-home-time' + sfx), homeText);
    setText(frameCache, 'sel' + sfx, $('frame-sel-time' + sfx), selText);
    if (nameChanged) {
      $('frame-sel-flag' + sfx).textContent = selected.emoji;
      $('frame-sel-name' + sfx).textContent = selected.name;
      $('frame-diff' + sfx).textContent = offsetDiffText(selected);
    }
  }
  if (nameChanged) {
    // le bouton de la destination porte son nom : « revoir Bali », pas un jargon
    $('view-dest-label').textContent = selected.emoji + ' ' + selected.name;
    viewChips.dest.setAttribute('aria-label',
      'Tourner le globe pour revoir ' + selected.name + ', la destination — l’heure ne change pas');
  }
}

function updateCards() {
  for (const card of cards) {
    const c = localClock(sim.homeH, card.place);
    const hm = formatHM(c.hours);
    setText(card.cache, 'digital', card.digital, hm.text);
    setText(card.cache, 'period', card.period, periodWord(c.hours));
    const act = activityFor(c.hours);
    setText(card.cache, 'activity', card.activity, act.emoji + ' ' + act.text);
    card.clock.set(hm.h, hm.m);
    const badge = dayBadge(c.dayShift);
    if (card.cache.badge !== badge) {
      card.cache.badge = badge;
      card.badge.hidden = badge === '';
      card.badge.textContent = badge;
      card.badge.className = 'day-badge' +
        (c.dayShift > 0 ? ' tomorrow' : c.dayShift < 0 ? ' yesterday' : '');
    }
    card.sky.draw(sim.homeH);
  }
  setText(sim, '_homeText', $('home-time'), formatHM(sim.homeH).text);
  setText(sim, '_homePeriod', $('home-period'), periodWord(sim.homeH));
  updateFrame();
  if (!sliderHeld) slider.value = sim.homeH;
}

// ---- boucle d'animation ----

const easeInOut = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

let lastMs = performance.now();
function frame(ms) {
  try {
    const dt = Math.min((ms - lastMs) / 1000, 0.1);
    lastMs = ms;
    if (sim.tween) {
      const tw = sim.tween;
      const k = Math.min(1, (ms - tw.start) / tw.dur);
      sim.homeH = k >= 1 ? tw.target : wrap24(tw.from + tw.delta * easeInOut(k));
      if (k >= 1) sim.tween = null;
    } else if (sim.playing) {
      sim.homeH = wrap24(sim.homeH + sim.spinSpeed * dt);
    }
    if (camAnim) {
      const k = Math.min(1, (ms - camAnim.start) / camAnim.dur);
      const e = easeInOut(k);
      globe3d.yaw = camAnim.y0 + camAnim.dy * e;
      globe3d.pitch = camAnim.p0 + camAnim.dp * e;
      if (k >= 1) camAnim = null;
    }
    const places = displayedPlaces();
    globe3d.draw(sim.homeH, places, selected.iso, selected.color);
    map.draw(sim.homeH, places, selected.iso, selected.color);
    pole.draw(sim.homeH, places);
    updateCards();
  } finally {
    // la boucle survit à un raté de rendu ponctuel (canvas en cours de layout…)
    requestAnimationFrame(frame);
  }
}

// ---- le conteur : une seule voix pour tout le site — l'histoire des fuseaux
// ET la version sonore des scénarios. La synthèse vocale du navigateur lit
// hors-ligne, rien n'est envoyé nulle part. Les voix installées varient
// énormément d'un appareil à l'autre : on note chaque voix française et on
// prend d'office la plus douce — français de France et voix « naturelles »
// d'abord, voix robotiques et accents lointains en dernier — et un petit
// menu laisse les parents en changer. ----

// une phrase par bulle (les longs textes d'une traite se font couper) ; la
// dernière phrase du bloc marque une vraie respiration
function sentenceChunks(text, endPara) {
  const bits = text.replace(/\s+/g, ' ').match(/[^.!?…]+[.!?…]*/g) || [];
  const out = [];
  for (const b of bits) { if (b.trim()) out.push({ text: b.trim(), endPara: false }); }
  if (out.length && endPara) out[out.length - 1].endPara = true;
  return out;
}

// ---- la voix enregistrée : un manifeste (assets/audio/manifest.json) liste
// les blocs disponibles avec leur texte oral exact. On ne joue un fichier que
// si son texte correspond ENCORE au texte du site — sinon, repli synthèse (la
// voix enregistrée ne ment jamais). Manifeste vide ou absent : tout passe par
// la synthèse, comme avant. Fichiers générés par tools/build-voix.mjs. ----

let audioBlocs = {};
if (window.__VOIX_MANIFESTE && window.__VOIX_MANIFESTE.blocs) {
  // l'artifact de test familial embarque le manifeste dans la page
  audioBlocs = window.__VOIX_MANIFESTE.blocs;
} else if (window.fetch) {
  fetch('assets/audio/manifest.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((m) => {
      if (m && m.blocs) audioBlocs = m.blocs;
      // le conseil « voix robotiques » ne concerne que le repli synthèse
      if (Object.keys(audioBlocs).length > 0) {
        const vh = $('voice-hint');
        if (vh) vh.hidden = true;
      }
    })
    .catch(() => { /* hors ligne ou manifeste absent : synthèse seule */ });
}

function audioSrc(id, text) {
  const b = audioBlocs[id];
  if (!b || b.texte !== text || !b.fichier) return null;
  // l'artifact embarque les sons en data URI ; le site sert des fichiers
  return b.fichier.indexOf('data:') === 0 ? b.fichier : 'assets/audio/' + b.fichier;
}

const listenBtn = $('btn-listen');
const voiceHint = $('voice-hint');
let narrator = null; // { narrate(items, onDone), stop() } — null sans synthèse vocale

if (window.speechSynthesis && window.SpeechSynthesisUtterance) {
  let frVoices = [];

  const voiceScore = (v) => {
    const lang = (v.lang || '').replace('_', '-').toLowerCase();
    const name = (v.name || '').toLowerCase();
    let s = 0;
    if (lang.indexOf('fr-fr') === 0) s += 60;      // le français de France d'abord
    else if (lang.indexOf('fr') === 0) s += 20;
    if (lang.indexOf('fr-ca') === 0) s -= 30;      // l'accent québécois surprend ici
    // les voix neurales (Edge, Google…) et « premium » sont bien plus naturelles
    if (/natural|neural|online|premium|enhanced|am[ée]lior[ée]e|siri/.test(name)) s += 30;
    if (name.indexOf('google') !== -1) s += 24;
    if (/audrey|thomas|aur[ée]lie|marie|denise|henri|[ée]lo[ïi]se|vivienne|r[ée]my|jacqueline|charline|coralie|hortense/.test(name)) s += 12;
    if (!v.localService) s += 6;
    // les moteurs d'appoint et les voix rigolotes, très robotiques, en dernier
    if (/espeak|eloquence|compact|robot/.test(name)) s -= 50;
    if (/eddy|\bflo\b|grandma|grandpa|\breed\b|rocko|sandy|shelley|jester|bells|organ|superstar|trinoids|whisper|zarvox|bad news|bahh|boing|bubbles|cellos|wobble/.test(name)) s -= 40;
    return s;
  };

  const refreshVoices = () => {
    const all = window.speechSynthesis.getVoices();
    frVoices = [];
    for (const v of all) {
      if ((v.lang || '').replace('_', '-').toLowerCase().indexOf('fr') === 0) frVoices.push(v);
    }
    frVoices.sort((a, b) => voiceScore(b) - voiceScore(a));
    if (voiceHint) {
      // en dessous de ce score, l'appareil n'a que des voix métalliques :
      // on souffle aux parents comment en obtenir une plus douce — sauf si
      // la voix enregistrée est là (le conseil ne concerne que le repli)
      const best = frVoices.length ? voiceScore(frVoices[0]) : -1;
      voiceHint.hidden = best >= 84 || Object.keys(audioBlocs).length > 0;
    }
  };
  refreshVoices();
  if ('onvoiceschanged' in window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = refreshVoices;
  }

  // le score choisit seul la meilleure voix française : le menu de choix des
  // premiers épisodes était un héritage d'avant la voix enregistrée
  const pickVoice = () => (frVoices.length ? frVoices[0] : null);

  // une lecture à la fois : gen invalide les onend des lectures annulées, et
  // le onDone de la lecture précédente est toujours prévenu qu'elle s'achève
  let gen = 0;
  let curDone = null;
  // UN SEUL élément audio, réutilisé pour tous les blocs : une fois débloqué
  // par un geste (iOS ne permet play() que dans la foulée d'un toucher), il
  // peut rejouer SANS geste — indispensable pour l'histoire qui se rejoue
  // quand la destination change pendant qu'un scénario est affiché.
  let lecteur = null;
  const getLecteur = () => {
    if (!lecteur) lecteur = new Audio();
    return lecteur;
  };
  const settle = () => { const d = curDone; curDone = null; if (d) d(); };
  const stopSpeaking = () => {
    gen++;
    window.speechSynthesis.cancel();
    if (lecteur) {
      try { lecteur.pause(); } catch (e) { /* déjà arrêté */ }
      lecteur.onended = null;
      lecteur.onerror = null;
    }
    settle();
  };

  // ton de conteur (le repli synthèse) : les phrases s'enchaînent avec de
  // vraies pauses, sur un débit posé, et un peu de relief là où le texte
  // s'exclame ou questionne (le navigateur n'offre que rate et pitch)
  const speakSeq = (chunks, myGen, done) => {
    const voice = pickVoice();
    let at = 0;
    const speakNext = () => {
      if (myGen !== gen) return;
      if (at >= chunks.length) { done(); return; }
      const c = chunks[at++];
      const u = new SpeechSynthesisUtterance(c.text);
      u.lang = voice ? voice.lang : 'fr-FR';
      if (voice) u.voice = voice;
      u.rate = 0.92; u.pitch = 1.04;
      if (/!\s*$/.test(c.text)) { u.rate = 0.96; u.pitch = 1.14; }  // l'émerveillement
      else if (/\?\s*$/.test(c.text)) { u.pitch = 1.12; }           // la question
      else if (c.text.indexOf('…') !== -1) { u.rate = 0.87; }       // le suspens
      u.onend = () => {
        if (myGen !== gen) return;
        window.setTimeout(speakNext, c.endPara ? 620 : 300);
      };
      u.onerror = () => { if (myGen === gen) done(); };
      window.speechSynthesis.speak(u);
    };
    speakNext();
  };

  // Le conteur : une suite de blocs { id, text, pause? }. Chaque bloc joue son
  // fichier enregistré s'il existe ET dit encore le bon texte ; sinon la
  // synthèse lit le texte phrase à phrase. Une histoire = UNE voix : si un
  // seul bloc n'a pas son fichier (texte changé, phrase générée inédite…),
  // tout le récit passe à la synthèse — jamais de voix chaleureuse
  // interrompue par une phrase robotique. Entre blocs, la respiration par
  // défaut (620 ms) ; `pause` la raccourcit pour les fichiers qui portent
  // déjà leur suspension (les annonces en « … »).
  const narrate = (items, onDone) => {
    stopSpeaking();
    refreshVoices(); // certaines listes de voix n'arrivent qu'après le chargement
    const myGen = gen;
    curDone = onDone || null;
    const enregistre = items.every((it) => audioSrc(it.id, it.text));
    let at = 0;
    const next = () => {
      if (myGen !== gen) return;
      if (at >= items.length) { settle(); return; }
      const it = items[at++];
      const after = () => { if (myGen === gen) window.setTimeout(next, 0); };
      let fell = false; // onerror ET promesse rejetée peuvent tomber tous les deux
      const fallback = () => {
        if (fell || myGen !== gen) return;
        fell = true;
        speakSeq(sentenceChunks(it.text, true), myGen, after);
      };
      const src = enregistre ? audioSrc(it.id, it.text) : null;
      if (!src) { fallback(); return; }
      const a = getLecteur();
      const pause = typeof it.pause === 'number' ? it.pause : 620;
      a.onended = () => { if (myGen === gen) window.setTimeout(after, pause); };
      a.onerror = fallback;
      a.src = src;
      const p = a.play();
      if (p && p.then) p.then(null, fallback);
      // pendant que ce bloc joue, préchauffer le fichier du suivant : son
      // chargement se fait d'avance (cache HTTP) et ne s'ajoute plus au
      // blanc entre les blocs au premier passage en ligne
      if (at < items.length && window.fetch) {
        const nx = audioSrc(items[at].id, items[at].text);
        if (nx && nx.indexOf('data:') !== 0) {
          fetch(nx).catch(() => { /* le lecteur retentera au vrai chargement */ });
        }
      }
    };
    next();
  };
  narrator = { narrate: narrate, stop: stopSpeaking };

  // -- « Écouter l'histoire » : la boîte des fuseaux, phrase à phrase --
  listenBtn.hidden = false;
  let reading = false;
  const resetListen = () => {
    reading = false;
    listenBtn.textContent = '🔊 Écouter l’histoire';
    listenBtn.setAttribute('aria-pressed', 'false');
  };
  const startReading = () => {
    // un bloc par paragraphe : les ids histoire-1…5 des fichiers enregistrés
    const items = [];
    const paras = $('explain-text').querySelectorAll('p');
    for (let i = 0; i < paras.length; i++) {
      items.push({ id: 'histoire-' + (i + 1), text: texteOral(paras[i].textContent) });
    }
    narrate(items, resetListen);
    reading = true;
    listenBtn.textContent = '⏹ Arrêter';
    listenBtn.setAttribute('aria-pressed', 'true');
  };
  listenBtn.addEventListener('click', () => {
    if (reading) { stopSpeaking(); return; } // le onDone remet le bouton
    startReading();
  });
  // partir ailleurs (autre application, autre onglet, écran verrouillé)
  // coupe le conteur net — synthèse ET mp3 : la voix ne parle jamais dans le
  // vide. Pas de reprise au retour : rien ne parle tout seul, on re-tape.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') stopSpeaking();
  });
  window.addEventListener('pagehide', stopSpeaking); // vieux Safari sans visibilitychange fiable
} else {
  $('btn-scn-voice').hidden = true; // pas de synthèse vocale : pas de version sonore
}

// ---- la version sonore des scénarios : quand l'enfant choisit un moment,
// le conteur dit ce qui se passe chez nous et là-bas. On ne lit pas les
// bulles écrites telles quelles : à l'oral, il manque les enchaînements —
// le conteur ajoute « Chez nous, en France… » et « Et pendant ce temps,
// à Bali… », et retire les émojis, imprononçables. ----

const scnVoiceBtn = $('btn-scn-voice');
let scnVoiceOn = false;
// clé de famille (même origine petit-labo.fr : le réglage suit l'enfant d'un
// épisode à l'autre), avec l'ancienne clé de l'épisode lue en secours
try {
  const son = window.localStorage.getItem('petit-labo-son');
  scnVoiceOn = son !== null ? son === '1' : window.localStorage.getItem('ltt-scn-voice') === '1';
} catch (e) { /* mode privé */ }

function setScnVoiceUi() {
  // libellés empilés dans le HTML : aria-pressed montre l'un, cache l'autre
  scnVoiceBtn.setAttribute('aria-pressed', scnVoiceOn ? 'true' : 'false');
}
setScnVoiceUi();
scnVoiceBtn.addEventListener('click', () => {
  scnVoiceOn = !scnVoiceOn;
  try { window.localStorage.setItem('petit-labo-son', scnVoiceOn ? '1' : '0'); } catch (e) { /* tant pis */ }
  setScnVoiceUi();
  if (!narrator) return;
  if (scnVoiceOn) tellScenario(); else narrator.stop();
});

// Les blocs du récit viennent du modèle (blocsScenario) : mêmes ids et mêmes
// textes que le corpus enregistré (tools/voix-lib.mjs) et que les tests.
function spokenStory(scn, atH) {
  const blocs = blocsScenario(scn, atH, selected, !!puceNames[selected.name]);
  return blocs.map((b) => ({ id: b.id, text: texteOral(b.texte), pause: b.pause }));
}

function tellScenario() {
  if (narrator && scnVoiceOn && activeScn) {
    narrator.narrate(spokenStory(activeScn.scn, activeScn.atH));
  }
}

// ---- la barre d'heures collante (mobile ≤ 640 px, voir style.css) : dès que
// les cartes-horloges sortent de l'écran par le haut, elle garde les deux
// heures sous les yeux — on voit l'heure changer en jouant avec les scénarios,
// le curseur ou les glissers, sans remonter la page. Sans IntersectionObserver
// (vieux Safari), elle reste simplement masquée. ----

if (window.IntersectionObserver) {
  const stickyBar = $('sticky-times');
  new IntersectionObserver((entries) => {
    const e = entries[entries.length - 1];
    // seulement « sorties par le haut » : tout en haut de page, rien à montrer
    const gone = !e.isIntersecting && e.boundingClientRect.bottom < 0;
    if (gone) stickyBar.classList.add('show');
    else stickyBar.classList.remove('show');
  }).observe($('cards'));
}

// ---- la boîte « Pourquoi les fuseaux horaires ? » : repliée sur mobile pour
// raccourcir la page (le résumé n'apparaît qu'en ≤ 640 px), toujours ouverte
// sur ordinateur — même si un clavier joue avec le résumé masqué. ----

const explainFold = $('explain-fold');
const mqMobile = window.matchMedia('(max-width: 640px)');
function syncExplainFold() {
  if (mqMobile.matches) return; // sur mobile, l'enfant plie et déplie librement
  explainFold.open = true;
}
if (mqMobile.matches) explainFold.open = false; // au chargement : repliée
explainFold.addEventListener('toggle', syncExplainFold);
if (mqMobile.addEventListener) mqMobile.addEventListener('change', syncExplainFold);
else if (mqMobile.addListener) mqMobile.addListener(syncExplainFold); // vieux Safari

buildCards();
renderInvite();
setPlaying(sim.playing);
centerCameraOn(selected.lonDeg, selected.latDeg, { jump: true }); // on ouvre cadré sur la Guadeloupe
requestAnimationFrame(frame);
