// Tests du jeu de données géographiques — zéro dépendance : `node test/geo.test.mjs`
// Bornes valides + « les bons endroits tombent dans les bonnes formes ».

import { CONTINENTS, GREENLAND, ANTARCTICA_BAND, ANTARCTICA_RING, SEAS, ISLES,
         ANTILLES, FRANCE } from '../js/geo.js';
import { PLACES } from '../js/model.js';

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
const inAnyLand = (pt) => CONTINENTS.some((poly) => inside(pt, poly));

console.log('Bornes et formes');
{
  const all = CONTINENTS.concat([GREENLAND, ANTARCTICA_BAND, ANTARCTICA_RING, FRANCE]);
  let ok = true;
  for (const poly of all) {
    if (poly.length < 12) ok = false;
    for (const [lon, lat] of poly) {
      if (lon < -185 || lon > 185 || lat < -95 || lat > 90) ok = false;
    }
  }
  check('polygones assez détaillés, coordonnées dans les bornes', ok);
  check('5 continents, des mers intérieures, un bon paquet d’îles',
    CONTINENTS.length === 5 && SEAS.length >= 4 && ISLES.length >= 25);
  const pts = CONTINENTS.reduce((n, p) => n + p.length, 0);
  check('côtes nettement plus détaillées que des patatoïdes (≥ 300 points)', pts >= 300, String(pts));
}

console.log('Les bons endroits tombent au bon endroit');
check('Paris est en France (frontières tracées)', inside([2.35, 46.5], FRANCE));
check('Paris est aussi sur le continent eurasiatique', inside([2.35, 46.5], CONTINENTS[0]));
check('Moscou, Delhi et Pékin sont en Eurasie',
  inside([37.6, 55.7], CONTINENTS[0]) && inside([77.2, 28.6], CONTINENTS[0]) &&
  inside([116.4, 39.9], CONTINENTS[0]));
check('le Tchad est en Afrique', inside([18, 12], CONTINENTS[1]));
check('le Kansas est en Amérique du Nord', inside([-98, 38.5], CONTINENTS[2]));
check('l’Amazonie est en Amérique du Sud', inside([-60, -5], CONTINENTS[3]));
check('Alice Springs est en Australie', inside([133.9, -23.7], CONTINENTS[4]));
check('le milieu de l’Atlantique et du Pacifique sont bien de l’océan',
  !inAnyLand([-30, 0]) && !inAnyLand([-150, 0]) && !inAnyLand([80, -40]));
{
  const bali = PLACES[2];
  const isle = ISLES.some(([lon, lat, rlon, rlat]) =>
    Math.abs(lon - bali.lonDeg) <= rlon + 0.4 && Math.abs(lat - (-8.6)) <= rlat + 0.4);
  check('Bali a son île dans l’archipel indonésien', isle);
  const guad = PLACES[0];
  const antille = ANTILLES.some(([lon, lat]) =>
    Math.abs(lon - guad.lonDeg) < 0.6 && Math.abs(lat - 16.25) < 0.6);
  check('la Guadeloupe a son île dans l’arc des Antilles', antille);
  check('la France du récit est dans sa forme surlignée', inside([PLACES[1].lonDeg, 46.6], FRANCE));
}

console.log('');
if (failed > 0) {
  console.error(failed + ' test(s) en échec, ' + passed + ' réussi(s).');
  process.exit(1);
}
console.log('Tous les tests géo passent (' + passed + ').');
