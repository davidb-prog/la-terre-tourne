// Tests du jeu de données géographiques (Natural Earth 110m, généré) —
// zéro dépendance : `node test/geo.test.mjs`
// Bornes valides + « les bons endroits tombent dans les bons pays ».

import { COUNTRIES, LAKES, ICE_ISOS, FRANCE_ISO, ANTILLES, SPECKS } from '../js/geo.js';
import { PLACES } from '../js/model.js';
import { GAZETTEER, searchPlaces, flagEmoji, normalize } from '../js/places.js';

let failed = 0;
let passed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.error('  ✗ ' + name + (detail === undefined ? '' : ' — ' + detail)); }
}

// Test du point dans le polygone (lancer de rayon).
function inside(pt, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (((yi > pt[1]) !== (yj > pt[1])) &&
        (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) c = !c;
  }
  return c;
}
const byIso = {};
for (const c of COUNTRIES) byIso[c.iso] = c;
const inCountry = (pt, iso) => byIso[iso] && byIso[iso].rings.some((r) => inside(pt, r));
const inAnyLand = (pt) => COUNTRIES.some((c) => c.rings.some((r) => inside(pt, r)));

console.log('Bornes et volume des données');
{
  let ok = true, pts = 0;
  for (const c of COUNTRIES) {
    for (const ring of c.rings) {
      pts += ring.length;
      for (const [lon, lat] of ring) {
        if (lon < -180.01 || lon > 180.01 || lat < -90.01 || lat > 90.01) ok = false;
      }
    }
  }
  check('coordonnées dans les bornes', ok);
  check('~177 pays, des lacs, beaucoup de points',
    COUNTRIES.length >= 170 && LAKES.length >= 15 && pts >= 8000,
    COUNTRIES.length + ' pays, ' + LAKES.length + ' lacs, ' + pts + ' points');
  check('la glace connaît l’Antarctique et le Groenland', ICE_ISOS.AQ === true && ICE_ISOS.GL === true);
}

console.log('Les bons endroits tombent dans les bons pays');
check('Paris est en France', inCountry([2.35, 48.86], FRANCE_ISO));
check('la Corse aussi', inCountry([9.1, 42.2], FRANCE_ISO));
check('Tokyo est au Japon', inCountry([139.7, 35.7], 'JP'));
check('le Kansas est aux États-Unis', inCountry([-98, 38.5], 'US'));
check('Alice Springs est en Australie', inCountry([133.9, -23.7], 'AU'));
check('Brasilia est au Brésil', inCountry([-47.9, -15.8], 'BR'));
check('Le Caire est en Égypte', inCountry([31.2, 30], 'EG'));
check('Java est en Indonésie', inCountry([110, -7.3], 'ID'));
check('Bali, La Réunion et Tahiti ont leur île dessinée à la main',
  [[115.2, -8.6], [55.45, -20.9], [-149.57, -17.55]].every((pt) =>
    SPECKS.some(([lon, lat, r]) => Math.abs(lon - pt[0]) < r + 0.4 && Math.abs(lat - pt[1]) < r + 0.4)));
check('le milieu des océans est bien de l’eau',
  !inAnyLand([-30, 0]) && !inAnyLand([-150, 0]) && !inAnyLand([80, -40]));
check('la Guadeloupe garde son arc d’Antilles dessiné à la main',
  ANTILLES.some(([lon, lat]) => Math.abs(lon - PLACES[0].lonDeg) < 0.6 && Math.abs(lat - 16.25) < 0.6));

console.log('Le répertoire de recherche');
{
  let ok = true;
  for (const e of GAZETTEER) {
    if (!(e.lat >= -90 && e.lat <= 90 && e.lon >= -180 && e.lon <= 180)) ok = false;
    if (!(e.tz >= -12 && e.tz <= 14)) ok = false;
    if (!e.n) ok = false;
  }
  check('~220 lieux, coordonnées et décalages valides', ok && GAZETTEER.length >= 200,
    GAZETTEER.length + ' lieux');
  check('« tokyo » trouve Tokyo', searchPlaces('tokyo', 3)[0].n === 'Tokyo');
  check('« reunion » (sans accent) trouve La Réunion', searchPlaces('reunion', 3)[0].n === 'La Réunion');
  check('« tahiti » trouve Papeete', searchPlaces('tahiti', 3)[0].n === 'Papeete');
  check('« new » propose New York et New Delhi',
    searchPlaces('new', 8).map((e) => e.n).join('|').indexOf('New York') !== -1 &&
    searchPlaces('new', 8).map((e) => e.n).join('|').indexOf('New Delhi') !== -1);
  check('l’Inde vit à +5 h 30, le Népal à +5 h 45',
    searchPlaces('inde', 1)[0].tz === 5.5 && searchPlaces('nepal', 3)[0].tz === 5.75);
  check('chaque pays cherché a son polygone à surligner',
    ['JP', 'AU', 'BR', 'IN', 'MA'].every((iso) => byIso[iso] && byIso[iso].rings.length > 0));
  check('drapeaux émoji', flagEmoji('FR').length > 0 && flagEmoji('') === '📍');
  check('normalisation : accents et tirets neutralisés',
    normalize('Île-de-Fràn ce') === 'ile de fran ce');
}

console.log('');
if (failed > 0) {
  console.error(failed + ' test(s) en échec, ' + passed + ' réussi(s).');
  process.exit(1);
}
console.log('Tous les tests géo passent (' + passed + ').');
