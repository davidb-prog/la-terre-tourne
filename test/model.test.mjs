// Tests du modèle horaire — zéro dépendance : `node test/model.test.mjs`
// Vérifie les données exactes du récit : décalages, ordre des levers de soleil,
// effet « déjà demain », états du ciel des scénarios.

import {
  PLACES, HOME, SCENARIOS, wrap24, wrapLon, localClock, solarHours, sunAltitude,
  skyState, placeAngle, subsolarLon, sunriseHomeH, sunsetHomeH, formatHM,
  periodWord, activityFor, dayBadge, DEG,
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

console.log('Scénarios');
{
  const ids = {};
  let ok = true, placesOk = true;
  for (let i = 0; i < SCENARIOS.length; i++) {
    const s = SCENARIOS[i];
    if (ids[s.id]) ok = false;
    ids[s.id] = true;
    if (!(s.homeH >= 0 && s.homeH < 24)) ok = false;
    for (let j = 0; j < s.story.length; j++) {
      let found = false;
      for (let p = 0; p < PLACES.length; p++) if (PLACES[p].id === s.story[j].place) found = true;
      if (!found) placesOk = false;
    }
  }
  check('identifiants uniques et heures valides', ok);
  check('chaque phrase du récit pointe vers un lieu connu', placesOk);
  check('le scénario « lever à Bali » tombe à 23 h 19 heure de France',
    formatHM(SCENARIOS[3].homeH).text === '23 h 19');
  check('au dodo (20 h) : le récit annonce « déjà demain » à Bali',
    SCENARIOS[2].story[2].text.indexOf('demain') !== -1 && localClock(SCENARIOS[2].homeH, B).dayShift === 1);
}

console.log('');
if (failed > 0) {
  console.error(failed + ' test(s) en échec, ' + passed + ' réussi(s).');
  process.exit(1);
}
console.log('Tous les tests passent (' + passed + ').');
