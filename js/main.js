// Câblage de l'interface : boucle d'animation, curseur du temps, recherche de
// lieux (hors-ligne, deux moteurs synchronisés), vol du globe, deux
// cartes-horloges (la France et le lieu choisi), scénarios racontés, plein écran.

import { TAU, DEG, PLACES, HOME, SCENARIOS, wrap24, localClock, formatHM,
         periodWord, activityFor, dayBadge, placeAngle, sunriseHomeH,
         placePhrase, offsetDiffText } from './model.js';
import { MapView, SkyView, buildClock, pointInRing } from './views.js';
import { Globe3D } from './view3d.js';
import { GAZETTEER, DECOR, searchPlaces, flagEmoji } from './places.js';
import { COUNTRIES } from './geo.js';

const $ = (id) => document.getElementById(id);
const wrapPi = (a) => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const sim = {
  homeH: 12,              // on ouvre sur le cas d'école : midi chez nous
  playing: !reduceMotion, // la Terre tourne toute seule (un tour en 80 s)
  spinSpeed: 24 / 80,
  tween: null,            // { from, delta, target, start, dur } pendant un scénario
};

const globe3d = new Globe3D($('globe3d-view'));
const map = new MapView($('map-view'));
let cameraTween = null;   // vol de la caméra vers un lieu cherché

// ---- le lieu choisi (la Guadeloupe par défaut, en attendant une recherche) ----

const FRANCE = PLACES[1];

function defaultSelected() {
  const g = PLACES[0];
  return {
    id: 'selected', selectable: true, isDefault: true,
    name: g.name, emoji: g.emoji, scene: g.scene,
    lonDeg: g.lonDeg, latDeg: g.latDeg, utcOffset: g.utcOffset,
    color: '#ffcf5c', iso: null,
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
      close.addEventListener('click', () => { selected = defaultSelected(); buildCards(); });
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
    emoji: flagEmoji(entry.iso),
    lonDeg: entry.lon, latDeg: entry.lat,
    utcOffset: entry.tz,
    color: '#ffcf5c',
    iso: entry.pays ? entry.iso : null, // seul un pays est surligné sur les cartes
  };
  buildCards();
  globe3d.pulse = { lonDeg: entry.lon, latDeg: entry.lat, k: 1 };
  tiltTo(entry.lat);
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
      const flag = document.createElement('span');
      flag.textContent = flagEmoji(e.iso);
      const nm = document.createElement('span');
      nm.textContent = e.n;
      const sub = document.createElement('span');
      sub.className = 'sub';
      sub.textContent = e.pays ? 'pays' : (e.c || '');
      btn.appendChild(flag); btn.appendChild(nm); btn.appendChild(sub);
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

// quelques idées de voyage prêtes à cliquer
const chipsBox = $('search-chips');
for (const idea of ['Guadeloupe', 'Bali', 'Tokyo', 'New York', 'Sydney', 'La Réunion',
  'Nouméa', 'Thaïlande']) {
  const found = searchPlaces(idea, 1);
  if (!found.length) continue;
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = flagEmoji(found[0].iso) + ' ' + found[0].n;
  b.addEventListener('click', () => choosePlace(found[0]));
  chipsBox.appendChild(b);
}

// Le Soleil (et la caméra) sont fixes : choisir un lieu penche juste le globe
// vers sa latitude et fait pulser son marqueur — s'il est du côté nuit, on le
// voit arriver en faisant tourner la Terre.
function tiltTo(latDeg) {
  const target = Math.max(-50 * DEG, Math.min(50 * DEG, latDeg * DEG * 0.7));
  if (reduceMotion) { globe3d.pitch = target; return; }
  cameraTween = { pitch0: globe3d.pitch, dpitch: target - globe3d.pitch,
    start: performance.now(), dur: 900 };
}

// ---- lecture / pause et curseur ----

const slider = $('time-slider');
let sliderHeld = false;

function setPlaying(p) {
  sim.playing = p;
  const btn = $('btn-spin');
  btn.textContent = p ? '⏸ Pause' : '▶ Elle tourne toute seule';
  btn.setAttribute('aria-pressed', p ? 'true' : 'false');
}

function stopAuto() {
  sim.tween = null;
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
  setActiveScenario(null);
  setPlaying(!sim.playing);
}
$('btn-spin').addEventListener('click', toggleSpin);
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !e.target.closest('button, input, a, summary')) {
    e.preventDefault();
    toggleSpin();
  }
});

// ---- plein écran du globe (API native, repli CSS pour iOS) ----

const globePanel = $('globe-panel');
const fsBtn = $('fs-toggle');

function setFsUi(active) {
  fsBtn.textContent = active ? '✕ Quitter le plein écran' : '⛶ Plein écran';
}
fsBtn.addEventListener('click', () => {
  if (document.fullscreenElement === globePanel) { document.exitFullscreen(); return; }
  if (globePanel.classList.contains('fs-fallback')) {
    globePanel.classList.remove('fs-fallback');
    setFsUi(false);
    return;
  }
  if (globePanel.requestFullscreen) {
    const p = globePanel.requestFullscreen();
    if (p && p.then) {
      p.then(null, () => { globePanel.classList.add('fs-fallback'); setFsUi(true); });
    }
    return;
  }
  globePanel.classList.add('fs-fallback');
  setFsUi(true);
});
document.addEventListener('fullscreenchange', () => {
  setFsUi(document.fullscreenElement === globePanel);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && globePanel.classList.contains('fs-fallback')) {
    globePanel.classList.remove('fs-fallback');
    setFsUi(false);
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
  return null;
}

// ---- glisser sur le globe : horizontalement on TOURNE LA TERRE (l'heure
// change, le Soleil ne bouge pas), verticalement on la penche ; un petit clic
// choisit le pays ou la ville sous le doigt ----

function wireEarthDrag(canvas) {
  let dragging = false, lastX = 0, lastY = 0, downX = 0, moved = 0, downT = 0;
  let timeUnlocked = false;
  canvas.addEventListener('pointerdown', (e) => {
    if (!globe3d.layout) return;
    dragging = true;
    timeUnlocked = false;
    cameraTween = null;
    lastX = e.clientX; lastY = e.clientY;
    downX = e.clientX; moved = 0; downT = performance.now();
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
    hideHint();
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    moved += Math.abs(dx) + Math.abs(dy);
    if (moved > 6) {
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
    if (dragging && moved <= 6 && performance.now() - downT < 600) {
      const rect = canvas.getBoundingClientRect();
      const hit = resolveHit(globe3d.hitTest(e.clientX - rect.left, e.clientY - rect.top));
      if (hit) choosePlace(hit);
    }
    dragging = false;
  });
  canvas.addEventListener('pointercancel', () => { dragging = false; });
}

// ---- glisser sur la carte : là, on déplace la nuit (donc l'heure) ----

function wireMapDrag(canvas) {
  let dragging = false, lastX = 0, moved = 0, downT = 0;
  canvas.addEventListener('pointerdown', (e) => {
    if (!map.layout) return;
    dragging = true;
    lastX = e.clientX; moved = 0; downT = performance.now();
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    moved += Math.abs(dx);
    if (moved > 6) {
      if (sim.playing || sim.tween) stopAuto();
      sim.homeH = wrap24(sim.homeH - dx / map.layout.W * 24);
    }
    lastX = e.clientX;
  });
  canvas.addEventListener('pointerup', (e) => {
    if (dragging && moved <= 6 && performance.now() - downT < 600) {
      const rect = canvas.getBoundingClientRect();
      const hit = resolveHit(map.hitTest(e.clientX - rect.left, e.clientY - rect.top));
      if (hit) choosePlace(hit);
    }
    dragging = false;
  });
  canvas.addEventListener('pointercancel', () => { dragging = false; });
}

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
      text: placePhrase(atH, selected) },
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

// le cadre posé sur le globe : l'heure ici, l'heure là-bas, et l'écart
const frameCache = { name: null };

function updateFrame() {
  const selHm = formatHM(localClock(sim.homeH, selected).hours);
  setText(frameCache, 'home', $('frame-home-time'), formatHM(sim.homeH).text);
  setText(frameCache, 'sel', $('frame-sel-time'), selHm.text);
  if (frameCache.name !== selected.name) {
    frameCache.name = selected.name;
    $('frame-sel-flag').textContent = selected.emoji;
    $('frame-sel-name').textContent = selected.name;
    $('frame-diff').textContent = offsetDiffText(selected);
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
    if (cameraTween) {
      const cw = cameraTween;
      const k = Math.min(1, (ms - cw.start) / cw.dur);
      globe3d.pitch = cw.pitch0 + cw.dpitch * easeInOut(k);
      if (k >= 1) cameraTween = null;
    }
    const places = displayedPlaces();
    globe3d.draw(sim.homeH, places, selected.iso, selected.color);
    map.draw(sim.homeH, places, selected.iso, selected.color);
    updateCards();
  } finally {
    // la boucle survit à un raté de rendu ponctuel (canvas en cours de layout…)
    requestAnimationFrame(frame);
  }
}

// ---- « Écouter l'histoire » : la boîte des fuseaux lue à voix haute,
// par la synthèse vocale du navigateur (hors-ligne, voix française si dispo) ----

const listenBtn = $('btn-listen');
if (window.speechSynthesis && window.SpeechSynthesisUtterance) {
  listenBtn.hidden = false;
  let speaking = false;
  const resetListen = () => {
    speaking = false;
    listenBtn.textContent = '🔊 Écouter l’histoire';
    listenBtn.setAttribute('aria-pressed', 'false');
  };
  listenBtn.addEventListener('click', () => {
    if (speaking) { window.speechSynthesis.cancel(); resetListen(); return; }
    window.speechSynthesis.cancel();
    const voices = window.speechSynthesis.getVoices();
    let voice = null;
    for (const v of voices) {
      const lang = (v.lang || '').replace('_', '-');
      if (lang.indexOf('fr') === 0 && (!voice || lang === 'fr-FR')) voice = v;
    }
    // une phrase par bulle : les longs textes d'une traite se font couper
    const sentences = [];
    const paras = $('explain-text').querySelectorAll('p');
    for (const para of paras) {
      const bits = para.textContent.replace(/\s+/g, ' ').match(/[^.!?…]+[.!?…]*/g) || [];
      for (const b of bits) { if (b.trim()) sentences.push(b.trim()); }
    }
    let done = 0;
    for (const sentence of sentences) {
      const u = new SpeechSynthesisUtterance(sentence);
      u.lang = 'fr-FR';
      if (voice) u.voice = voice;
      u.rate = 0.92;  // tout doucement, pour les petites oreilles
      u.pitch = 1.05;
      u.onend = () => { done++; if (done >= sentences.length) resetListen(); };
      u.onerror = resetListen;
      window.speechSynthesis.speak(u);
    }
    speaking = true;
    listenBtn.textContent = '⏹ Arrêter';
    listenBtn.setAttribute('aria-pressed', 'true');
  });
  window.addEventListener('pagehide', () => { window.speechSynthesis.cancel(); });
}

buildCards();
renderInvite();
setPlaying(sim.playing);
requestAnimationFrame(frame);
