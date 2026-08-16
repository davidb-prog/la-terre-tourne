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
  centerCameraOn(entry.lon, entry.lat);
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

// Choisir un lieu ne fait pas bouger la Terre (l'heure ne change pas d'un
// poil) : c'est la caméra qui se recale d'un coup, lieu au centre du disque —
// et le Soleil retrouve sa place sur l'axe, du côté d'où vient la lumière.
function centerCameraOn(lonDeg, latDeg) {
  globe3d.yaw = -Math.PI / 2 - placeAngle(sim.homeH, lonDeg);
  globe3d.pitch = Math.max(-50 * DEG, Math.min(50 * DEG, latDeg * DEG * 0.7));
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

// les cadres posés sur le globe et sur la carte : l'heure ici, l'heure
// là-bas, et l'écart — même contenu aux deux endroits, mis à jour ensemble
const FRAME_IDS = ['', '-map'];
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
    const places = displayedPlaces();
    globe3d.draw(sim.homeH, places, selected.iso, selected.color);
    map.draw(sim.homeH, places, selected.iso, selected.color);
    updateCards();
  } finally {
    // la boucle survit à un raté de rendu ponctuel (canvas en cours de layout…)
    requestAnimationFrame(frame);
  }
}

// ---- « Écouter l'histoire » : la boîte des fuseaux lue à voix haute par la
// synthèse vocale du navigateur (hors-ligne, rien n'est envoyé nulle part).
// Les voix installées varient énormément d'un appareil à l'autre : on note
// chaque voix française et on prend d'office la plus douce — français de
// France et voix « naturelles » d'abord, voix robotiques et accents lointains
// en dernier — et un petit menu laisse les parents en changer. ----

const listenBtn = $('btn-listen');
const voiceSel = $('voice-pick');
const voiceHint = $('voice-hint');
if (window.speechSynthesis && window.SpeechSynthesisUtterance) {
  listenBtn.hidden = false;
  let speaking = false;
  let frVoices = [];
  let chosenURI = null;
  try { chosenURI = window.localStorage.getItem('ltt-voice'); } catch (e) { /* mode privé */ }

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

  const prettyName = (v) => {
    let n = v.name.replace(/^microsoft\s+/i, '')
      .replace(/\s*[-–—]\s*(french|fran[çc]ais).*$/i, '')
      .replace(/\s*\((french|fran[çc]ais)[^)]*\)\s*$/i, '');
    const lang = (v.lang || '').replace('_', '-');
    if (lang && lang.toLowerCase().indexOf('fr-fr') !== 0) n += ' · ' + lang;
    return n;
  };

  const refreshVoices = () => {
    const all = window.speechSynthesis.getVoices();
    frVoices = [];
    for (const v of all) {
      if ((v.lang || '').replace('_', '-').toLowerCase().indexOf('fr') === 0) frVoices.push(v);
    }
    frVoices.sort((a, b) => voiceScore(b) - voiceScore(a));
    if (voiceSel) {
      voiceSel.innerHTML = '';
      for (const v of frVoices) {
        const opt = document.createElement('option');
        opt.value = v.voiceURI;
        opt.textContent = prettyName(v);
        voiceSel.appendChild(opt);
      }
      let known = false;
      for (const v of frVoices) { if (v.voiceURI === chosenURI) known = true; }
      if (known) voiceSel.value = chosenURI;
      voiceSel.hidden = frVoices.length < 2;
    }
    if (voiceHint) {
      // en dessous de ce score, l'appareil n'a que des voix métalliques :
      // on souffle aux parents comment en obtenir une plus douce
      const best = frVoices.length ? voiceScore(frVoices[0]) : -1;
      voiceHint.hidden = best >= 84;
    }
  };
  refreshVoices();
  if ('onvoiceschanged' in window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = refreshVoices;
  }

  const pickVoice = () => {
    for (const v of frVoices) { if (v.voiceURI === chosenURI) return v; }
    return frVoices.length ? frVoices[0] : null;
  };

  const resetListen = () => {
    speaking = false;
    listenBtn.textContent = '🔊 Écouter l’histoire';
    listenBtn.setAttribute('aria-pressed', 'false');
  };

  let gen = 0; // ignore les onend/onerror des lectures annulées
  const startReading = () => {
    gen++;
    const myGen = gen;
    window.speechSynthesis.cancel();
    const voice = pickVoice();
    // une phrase par bulle (les longs textes d'une traite se font couper), en
    // retenant les fins de paragraphes pour y respirer plus longtemps
    const chunks = [];
    const paras = $('explain-text').querySelectorAll('p');
    for (const para of paras) {
      const bits = para.textContent.replace(/\s+/g, ' ').match(/[^.!?…]+[.!?…]*/g) || [];
      const clean = [];
      for (const b of bits) { if (b.trim()) clean.push(b.trim()); }
      for (let i = 0; i < clean.length; i++) {
        chunks.push({ text: clean[i], endPara: i === clean.length - 1 });
      }
    }
    // ton de conteur : les phrases s'enchaînent avec de vraies pauses, sur un
    // débit posé, et un peu de relief là où le texte s'exclame ou questionne
    // (la synthèse du navigateur n'offre que rate et pitch — on s'en sert)
    let at = 0;
    const speakNext = () => {
      if (myGen !== gen) return;
      if (at >= chunks.length) { resetListen(); return; }
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
      u.onerror = () => { if (myGen === gen) resetListen(); };
      window.speechSynthesis.speak(u);
    };
    speaking = true;
    listenBtn.textContent = '⏹ Arrêter';
    listenBtn.setAttribute('aria-pressed', 'true');
    speakNext();
  };

  listenBtn.addEventListener('click', () => {
    if (speaking) { gen++; window.speechSynthesis.cancel(); resetListen(); return; }
    refreshVoices(); // certaines listes de voix n'arrivent qu'après le chargement
    startReading();
  });
  if (voiceSel) {
    voiceSel.addEventListener('change', () => {
      chosenURI = voiceSel.value;
      try { window.localStorage.setItem('ltt-voice', chosenURI); } catch (e) { /* tant pis */ }
      if (speaking) startReading(); // on réécoute tout de suite avec la nouvelle voix
    });
  }
  window.addEventListener('pagehide', () => { window.speechSynthesis.cancel(); });
}

buildCards();
renderInvite();
setPlaying(sim.playing);
centerCameraOn(selected.lonDeg, selected.latDeg); // on ouvre cadré sur la Guadeloupe
requestAnimationFrame(frame);
