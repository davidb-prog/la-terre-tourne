// Tests du modèle horaire — zéro dépendance : `node test/model.test.mjs`
// Vérifie les données exactes du récit : décalages, ordre des levers de soleil,
// effet « déjà demain », états du ciel des scénarios.

import {
  PLACES, HOME, SCENARIOS, wrap24, wrapLon, localClock, solarHours, sunAltitude,
  skyState, placeAngle, subsolarLon, sunriseHomeH, sunsetHomeH, formatHM,
  periodWord, activityFor, dayBadge, placePhrase, offsetDiffText, DEG, TAU,
  cameraFrame, CAM_OFF_NOON_MIN, CAM_OFF_NOON_MAX, placeLocative,
} from '../js/model.js';

let failed = 0;
let passed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.error('  ✗ ' + name + (detail === undefined ? '' : ' — ' + detail)); }
}
const approx = (a, b, eps) => Math.abs(a - b) <= (eps === undefined ? 1e-9 : eps);

const G = PLACES[0], F = PLACES[1], B = PLACES[2];

console.log('Données des lieux');
check('ordre ouest → est : Guadeloupe, France, Bali',
  G.id === 'guadeloupe' && F.id === 'france' && B.id === 'bali' &&
  G.lonDeg < F.lonDeg && F.lonDeg < B.lonDeg);
check('Guadeloupe UTC−4 (Pointe-à-Pitre ≈ 61,5° O)', G.utcOffset === -4 && approx(G.lonDeg, -61.5));
check('France UTC+1 en hiver (Paris ≈ 2,35° E)', F.utcOffset === 1 && approx(F.lonDeg, 2.35));
check('Bali UTC+8 (≈ 115,2° E)', B.utcOffset === 8 && approx(B.lonDeg, 115.2));
check('la France est « chez nous »', HOME === F && F.home === true);
check('la France a 1 h d’avance sur Greenwich (hiver)', HOME.utcOffset === 1);
check('écarts avec la France : Guadeloupe −5 h, Bali +7 h',
  G.utcOffset - F.utcOffset === -5 && B.utcOffset - F.utcOffset === 7);

console.log('Horloges locales — le cas d’école : midi en France (hiver)');
{
  const g = localClock(12, G), b = localClock(12, B), f = localClock(12, F);
  check('12 h en France → 7 h en Guadeloupe', g.hours === 7 && g.dayShift === 0, JSON.stringify(g));
  check('12 h en France → 19 h à Bali', b.hours === 19 && b.dayShift === 0, JSON.stringify(b));
  check('12 h en France → 12 h en France (même jour)', f.hours === 12 && f.dayShift === 0);
}

console.log('Effet « déjà demain » / « encore hier »');
{
  const b20 = localClock(20, B);
  check('20 h en France → 3 h du matin à Bali… demain', b20.hours === 3 && b20.dayShift === 1,
    JSON.stringify(b20));
  check('badge « déjà demain ! »', dayBadge(b20.dayShift) === 'déjà demain !');
  const g2 = localClock(2, G);
  check('2 h du matin en France → 21 h en Guadeloupe… hier', g2.hours === 21 && g2.dayShift === -1,
    JSON.stringify(g2));
  check('badge « encore hier ! »', dayBadge(g2.dayShift) === 'encore hier !');
  check('à minuit pile en France, Bali entame le même jour (7 h, badge éteint)',
    localClock(0, B).hours === 7 && localClock(0, B).dayShift === 0);
}

console.log('La Terre tourne vers l’est');
check('le point subsolaire recule de 15° par heure (le jour balaie d’est en ouest)',
  approx(wrapLon(subsolarLon(13) - subsolarLon(12)), -15));
check('vue du pôle Nord : les lieux avancent dans le sens trigonométrique quand le temps passe',
  placeAngle(12.5, F.lonDeg) > placeAngle(12, F.lonDeg));
check('à midi solaire, un lieu fait face au Soleil (angle 0)',
  approx(placeAngle(12 - F.lonDeg / 15 + HOME.utcOffset, F.lonDeg), 0, 1e-9));
check('l’écart angulaire Bali–Guadeloupe sur le globe est fixe (176,7°)',
  approx(placeAngle(9, B.lonDeg) - placeAngle(9, G.lonDeg), (B.lonDeg - G.lonDeg) * DEG, 1e-9));

console.log('Ordre des levers de soleil : Bali → France → Guadeloupe');
{
  const rb = wrap24(sunriseHomeH(B.lonDeg) - HOME.utcOffset); // en UTC
  const rf = wrap24(sunriseHomeH(F.lonDeg) - HOME.utcOffset);
  const rg = wrap24(sunriseHomeH(G.lonDeg) - HOME.utcOffset);
  const baliToFrance = wrap24(rf - rb);
  const franceToGuad = wrap24(rg - rf);
  check('le soleil se lève à Bali ~7 h 31 avant la France', approx(baliToFrance, 7.5233, 1e-3),
    baliToFrance.toFixed(4));
  check('puis en Guadeloupe ~4 h 15 après la France', approx(franceToGuad, 4.2567, 1e-3),
    franceToGuad.toFixed(4));
  check('l’ordre Bali → France → Guadeloupe tient dans un seul tour de Terre',
    baliToFrance > 0 && franceToGuad > 0 && baliToFrance + franceToGuad < 24);
  check('lever à Bali = 23 h 19 heure de France (la veille au soir)',
    formatHM(sunriseHomeH(B.lonDeg)).text === '23 h 19');
  check('miroir Bali/Guadeloupe (12 h d’écart) : lever à Bali ≈ coucher en Guadeloupe (±15 min)',
    Math.abs(sunriseHomeH(B.lonDeg) - sunsetHomeH(G.lonDeg)) < 0.25);
}

console.log('Hauteur du soleil et états du ciel');
check('midi solaire : soleil au plus haut', approx(sunAltitude(12), 1));
check('lever (6 h) et coucher (18 h) solaires : soleil à l’horizon',
  approx(sunAltitude(6), 0) && approx(sunAltitude(18), 0));
check('minuit solaire : soleil au plus bas', approx(sunAltitude(0), -1) && approx(sunAltitude(24), -1));
{
  // Midi en France : jour chez nous, petit matin en Guadeloupe, crépuscule à Bali.
  check('midi en France → ciel de jour en France', skyState(solarHours(12, F.lonDeg)) === 'day');
  check('midi en France → soleil tout juste levé en Guadeloupe (jour, soleil bas)',
    skyState(solarHours(12, G.lonDeg)) === 'day' && sunAltitude(solarHours(12, G.lonDeg)) < 0.25);
  check('midi en France → crépuscule à Bali (le soleil vient de se coucher)',
    skyState(solarHours(12, B.lonDeg)) === 'dusk');
  // Réveil à 7 h en France : nuit noire en Guadeloupe, plein jour à Bali.
  check('7 h en France → aube en France', skyState(solarHours(7, F.lonDeg)) === 'dawn');
  check('7 h en France → nuit noire en Guadeloupe', skyState(solarHours(7, G.lonDeg)) === 'night');
  check('7 h en France → plein jour à Bali', skyState(solarHours(7, B.lonDeg)) === 'day');
  // Lever du soleil à Bali : aube là-bas, nuit en France, coucher en Guadeloupe.
  const hLever = sunriseHomeH(B.lonDeg);
  check('lever à Bali → aube à Bali, soleil pile à l’horizon',
    skyState(solarHours(hLever, B.lonDeg)) === 'dawn' &&
    approx(sunAltitude(solarHours(hLever, B.lonDeg)), 0, 1e-9));
  check('lever à Bali → il fait nuit en France', skyState(solarHours(hLever, F.lonDeg)) === 'night');
  check('lever à Bali → coucher du soleil en Guadeloupe', skyState(solarHours(hLever, G.lonDeg)) === 'dusk');
}

console.log('Horloges affichées');
check('formatHM(12) → « 12 h 00 »', formatHM(12).text === '12 h 00');
check('formatHM(23,32) → « 23 h 19 »', formatHM(23.32).text === '23 h 19');
check('arrondi avec retenue : 6,9999 → « 7 h 00 »', formatHM(6.9999).text === '7 h 00');
check('retenue à minuit : 23,9999 → « 0 h 00 »', formatHM(23.9999).text === '0 h 00');
check('mots-repères : midi, minuit, matin, après-midi, soir, nuit',
  periodWord(12) === 'midi !' && periodWord(0) === 'minuit !' && periodWord(7) === 'le matin' &&
  periodWord(15) === 'l’après-midi' && periodWord(20.5) === 'le soir' && periodWord(23) === 'la nuit');
{
  let ok = true;
  for (let h = 0; h < 24; h += 0.25) {
    for (let p = 0; p < PLACES.length; p++) {
      const c = localClock(h, PLACES[p]);
      if (c.hours < 0 || c.hours >= 24 || Math.abs(c.dayShift) > 1) ok = false;
      if (!activityFor(c.hours)) ok = false;
    }
  }
  check('balayage complet 0–24 h : heures locales dans [0, 24) et décalage de jour ∈ {−1, 0, +1}', ok);
}

console.log('Cadrage caméra du globe (cameraFrame) — les deux garanties du site');
{
  const wrapPi = (a) => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  let okBand = true, okSun = true, okVisible = true, okCentered = true;
  for (let h = 0; h < 24; h += 0.5) {
    for (let lon = -180; lon < 180; lon += 7.5) {
      const f = cameraFrame(h, lon, 20);
      const delta = wrapPi(f.yaw + Math.PI / 2); // écart entre centre de vue et midi solaire
      const m = Math.abs(delta);
      if (m < CAM_OFF_NOON_MIN - 1e-9 || m > CAM_OFF_NOON_MAX + 1e-9) okBand = false;
      if (Math.sin(f.yaw) > 1e-9) okSun = false; // sun[1] > 0 ⇔ Soleil derrière la Terre
      const theta = placeAngle(h, lon);
      const off = wrapPi(theta + f.yaw + Math.PI / 2); // écart lieu ↔ centre de vue
      if (Math.abs(off) > Math.PI / 2 + 1e-9) okVisible = false;
      if (Math.abs(theta) >= CAM_OFF_NOON_MIN && Math.abs(theta) <= CAM_OFF_NOON_MAX &&
          Math.abs(off) > 1e-9) okCentered = false;
    }
  }
  check('la limite jour/nuit reste à l’écran : le centre de vue est toujours à 50°–90° du midi solaire', okBand);
  check('le Soleil n’est jamais caché derrière la Terre après un recadrage', okSun);
  check('le lieu choisi reste sur la face visible du globe', okVisible);
  check('un lieu entre 50° et 90° du midi solaire est cadré pile au centre', okCentered);
  const hNoonF = wrap24(12 - F.lonDeg / 15 + HOME.utcOffset); // midi solaire en France
  check('lieu à midi solaire : la caméra s’écarte de 50° pile, le croissant de nuit reste visible',
    approx(Math.abs(wrapPi(cameraFrame(hNoonF, F.lonDeg, F.latDeg).yaw + Math.PI / 2)),
      CAM_OFF_NOON_MIN, 1e-9));
  const hMidnightF = wrap24(hNoonF + 12); // minuit solaire en France
  check('lieu à minuit solaire : vue limite jour/nuit (90°), le Soleil entier sur son côté',
    approx(Math.abs(wrapPi(cameraFrame(hMidnightF, F.lonDeg, F.latDeg).yaw + Math.PI / 2)),
      CAM_OFF_NOON_MAX, 1e-6));
  check('le tangage suit la latitude (×0,7), borné à ±50°',
    approx(cameraFrame(12, 0, 90).pitch, 50 * DEG) &&
    approx(cameraFrame(12, 0, -90).pitch, -50 * DEG) &&
    approx(cameraFrame(12, 0, 20).pitch, 14 * DEG));
}

console.log('Scénarios et phrases générées');
{
  const ids = {};
  let ok = true;
  for (const scn of SCENARIOS) {
    if (ids[scn.id]) ok = false;
    ids[scn.id] = true;
    if (!scn.sunriseAt && !(scn.homeH >= 0 && scn.homeH < 24)) ok = false;
    if (!scn.sunriseAt && !scn.france) ok = false;
  }
  check('identifiants uniques, heures valides, textes France présents', ok);
  check('le dernier scénario est dynamique (lever du soleil chez l’invité)',
    SCENARIOS[3].sunriseAt === true);
  check('au dodo (20 h), la phrase de Bali annonce « déjà demain »',
    placePhrase(20, B).indexOf('déjà demain') !== -1 &&
    placePhrase(20, B).indexOf('3 h 00') !== -1);
  check('à 2 h chez nous, la Guadeloupe est « encore hier »',
    placePhrase(2, G).indexOf('encore hier') !== -1);
  check('à midi chez nous, la phrase de la Guadeloupe donne 7 h 00 et un lever de soleil',
    placePhrase(12, G).indexOf('7 h 00') !== -1);
  check('au lever du soleil balinais, la phrase dit que le soleil se lève',
    placePhrase(sunriseHomeH(B.lonDeg), B).indexOf('le soleil se lève') !== -1);
  check('écarts en toutes lettres : Bali +7 h, Guadeloupe −5 h',
    offsetDiffText(B) === '7 h d’avance sur nous' &&
    offsetDiffText(G) === '5 h de retard sur nous');
  check('écart en demi-heure : l’Inde a 4 h 30 d’avance',
    offsetDiffText({ utcOffset: 5.5 }) === '4 h 30 d’avance sur nous');
  check('même heure que nous : la même phrase gentille',
    offsetDiffText({ utcOffset: 1 }) === 'la même heure que chez nous !');
}

console.log('Prépositions de lieu (pour la version sonore des scénarios)');
check('villes et îles : à Paris, à Bali, à La Réunion',
  placeLocative({ name: 'Paris', pays: false }) === 'à Paris' &&
  placeLocative({ name: 'Bali', pays: false }) === 'à Bali' &&
  placeLocative({ name: 'La Réunion', pays: false }) === 'à La Réunion');
check('article soudé : au Caire, aux Marquises',
  placeLocative({ name: 'Le Caire', pays: false }) === 'au Caire' &&
  placeLocative({ name: 'Les Marquises', pays: false }) === 'aux Marquises');
check('pays : en France, en Inde, au Portugal, au Japon, aux États-Unis',
  placeLocative({ name: 'France', pays: true }) === 'en France' &&
  placeLocative({ name: 'Inde', pays: true }) === 'en Inde' &&
  placeLocative({ name: 'Portugal', pays: true }) === 'au Portugal' &&
  placeLocative({ name: 'Japon', pays: true }) === 'au Japon' &&
  placeLocative({ name: 'États-Unis', pays: true }) === 'aux États-Unis');
check('exceptions : au Mexique, à Cuba, en Guadeloupe, à la Dominique, en Afrique du Sud',
  placeLocative({ name: 'Mexique', pays: true }) === 'au Mexique' &&
  placeLocative({ name: 'Cuba', pays: true }) === 'à Cuba' &&
  placeLocative({ name: 'Guadeloupe', pays: false }) === 'en Guadeloupe' &&
  placeLocative({ name: 'Dominique', pays: true }) === 'à la Dominique' &&
  placeLocative({ name: 'Afrique du Sud', pays: true }) === 'en Afrique du Sud');

console.log('');
if (failed > 0) {
  console.error(failed + ' test(s) en échec, ' + passed + ' réussi(s).');
  process.exit(1);
}
console.log('Tous les tests passent (' + passed + ').');
