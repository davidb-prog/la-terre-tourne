// Câblage de l'interface : boucle d'animation, curseur du temps, glisser sur le
// globe et la carte, boutons-scénarios, mise à jour des vignettes.

import { TAU, PLACES, SCENARIOS, wrap24, localClock, formatHM, periodWord,
         activityFor, dayBadge } from './model.js';
import { PolarView, MapView, SkyView, buildClock } from './views.js';

const $ = (id) => document.getElementById(id);
const wrapPi = (a) => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const sim = {
  homeH: 12,              // on ouvre sur le cas d'école : midi chez nous
  playing: !reduceMotion, // la Terre tourne toute seule (un tour en 80 s)
  spinSpeed: 24 / 80,
  tween: null,            // { from, delta, start, dur } pendant un scénario
};

const globe = new PolarView($('globe-view'));
const map = new MapView($('map-view'));

// Une vignette par lieu : horloge, textes, ciel.
const cards = PLACES.map((place) => ({
  place: place,
  clock: buildClock($('clock-' + place.id)),
  sky: new SkyView($('sky-' + place.id), place),
  digital: $('digital-' + place.id),
  period: $('period-' + place.id),
  activity: $('activity-' + place.id),
  badge: $('badge-' + place.id),
  cache: {},
}));

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

// ---- le grand curseur ----

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
  if (e.code === 'Space' && !e.target.closest('button, input, a')) {
    e.preventDefault();
    toggleSpin();
  }
});

// ---- attraper la Terre (glisser en rond) et la carte (glisser à plat) ----

function wireGlobeDrag(canvas) {
  let dragging = false, lastAngle = 0;
  const angleOf = (e) => {
    const rect = canvas.getBoundingClientRect();
    const L = globe.layout;
    return Math.atan2(L.cy - (e.clientY - rect.top), (e.clientX - rect.left) - L.cx);
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (!globe.layout) return;
    dragging = true;
    lastAngle = angleOf(e);
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
    stopAuto();
    hideHint();
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const a = angleOf(e);
    sim.homeH = wrap24(sim.homeH + wrapPi(a - lastAngle) / TAU * 24);
    lastAngle = a;
  });
  const end = () => { dragging = false; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
}

function wireMapDrag(canvas) {
  let dragging = false, lastX = 0;
  canvas.addEventListener('pointerdown', (e) => {
    if (!map.layout) return;
    dragging = true;
    lastX = e.clientX;
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
    stopAuto();
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    // le contenu suit le doigt : la nuit balaie vers l'ouest quand le temps avance
    sim.homeH = wrap24(sim.homeH - (e.clientX - lastX) / map.layout.W * 24);
    lastX = e.clientX;
  });
  const end = () => { dragging = false; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
}

wireGlobeDrag($('globe-view'));
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

const placeById = {};
for (const p of PLACES) placeById[p.id] = p;

function renderStory(scn) {
  const box = $('story');
  box.innerHTML = '';
  for (const line of scn.story) {
    const p = placeById[line.place];
    const row = document.createElement('div');
    row.className = 'story-line';
    const chip = document.createElement('span');
    chip.className = 'story-chip story-chip-' + p.id;
    chip.textContent = p.emoji + ' ' + p.name;
    const txt = document.createElement('p');
    txt.className = 'story-text';
    txt.textContent = line.text;
    row.appendChild(chip); row.appendChild(txt);
    box.appendChild(row);
  }
}

// La Terre tourne en douceur (toujours vers l'avant, son vrai sens) jusqu'au moment choisi.
function runScenario(scn) {
  setPlaying(false);
  setActiveScenario(scn.id);
  renderStory(scn);
  const delta = wrap24(scn.homeH - sim.homeH);
  if (reduceMotion || delta < 0.02) {
    sim.tween = null;
    sim.homeH = scn.homeH;
    return;
  }
  sim.tween = {
    from: sim.homeH, delta: delta, target: scn.homeH,
    start: performance.now(), dur: Math.min(2600, 700 + delta * 90),
  };
}

// ---- mise à jour des textes (seulement quand ils changent) ----

function setText(cache, key, el, value) {
  if (cache[key] === value) return;
  cache[key] = value;
  el.textContent = value;
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
  const homeHm = formatHM(sim.homeH);
  setText(sim, '_homeText', $('home-time'), homeHm.text);
  setText(sim, '_homePeriod', $('home-period'), periodWord(sim.homeH));
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
    globe.draw(sim.homeH);
    map.draw(sim.homeH);
    updateCards();
  } finally {
    // la boucle survit à un raté de rendu ponctuel (canvas en cours de layout…)
    requestAnimationFrame(frame);
  }
}

setPlaying(sim.playing);
requestAnimationFrame(frame);
