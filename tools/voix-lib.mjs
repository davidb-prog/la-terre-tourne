// Corpus vocal de « Quelle heure est-il là-bas ? » : la liste des blocs
// parlés (id stable + texte oral), partagée par tools/build-voix.mjs
// (génération ElevenLabs) et test/voix.test.mjs (cohérence manifeste ↔
// textes du site).
//
// La difficulté propre à cet épisode : les histoires des scénarios sont
// GÉNÉRÉES (elles dépendent du lieu choisi et, pour « le soleil se lève
// là-bas », de sa longitude). Le corpus s'obtient donc par ÉNUMÉRATION :
// chaque scénario × chaque lieu du répertoire passe par blocsScenario()
// (js/model.js, la même fonction que le site), et les blocs se dédupliquent
// par id — la combinatoire retombe à ~200 blocs, bornée par construction.

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PLACES, SCENARIOS, sunriseHomeH, texteOral, blocsScenario } from '../js/model.js';
import { GAZETTEER, searchPlaces, IDEES_VOYAGE } from '../js/places.js';

// Un lieu du répertoire sous la forme attendue par le modèle — la même
// construction que choosePlace dans js/main.js.
function lieu(e) {
  return { name: e.n, lonDeg: e.lon, latDeg: e.lat, utcOffset: e.tz, pays: !!e.pays };
}

// Tous les lieux que le site peut raconter : le répertoire de recherche, plus
// le lieu par défaut (la Guadeloupe de model.js, longitudes légèrement
// différentes de celles du répertoire).
export function lieux() {
  const g = PLACES[0];
  const tous = GAZETTEER.map(lieu);
  tous.push({ name: g.name, lonDeg: g.lonDeg, latDeg: g.latDeg, utcOffset: g.utcOffset, pays: false });
  return tous;
}

// Les noms des puces « idées de voyage », résolus comme dans js/main.js :
// seuls ces lieux ont une transition nommée enregistrée.
export function nomsPuces() {
  const noms = {};
  for (const idea of IDEES_VOYAGE) {
    const found = searchPlaces(idea, 1);
    if (found.length) noms[found[0].n] = true;
  }
  return noms;
}

// Tous les blocs que le conteur peut dire, avec les MÊMES ids que js/main.js.
export function corpus() {
  const parId = {};
  const blocs = [];
  const ajouter = (id, texteBrut) => {
    const texte = texteOral(texteBrut);
    if (parId[id]) {
      // même id, même texte : la déduplication attendue ; sinon, collision
      if (parId[id] !== texte) throw new Error('collision d’id de bloc : ' + id);
      return;
    }
    parId[id] = texte;
    blocs.push({ id: id, texte: texte });
  };
  const puces = nomsPuces();
  for (const scn of SCENARIOS) {
    for (const place of lieux()) {
      const atH = scn.sunriseAt ? sunriseHomeH(place.lonDeg) : scn.homeH;
      for (const b of blocsScenario(scn, atH, place, !!puces[place.name])) {
        ajouter(b.id, b.texte);
      }
    }
  }
  // la grande histoire : un bloc par paragraphe de la boîte des fuseaux
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const zone = html.match(/<div id="explain-text"[^>]*>([\s\S]*?)<\/div>/);
  if (!zone) throw new Error('explain-text introuvable dans index.html');
  const paras = zone[1].match(/<p>[\s\S]*?<\/p>/g) || [];
  paras.forEach((p, i) => {
    ajouter('histoire-' + (i + 1), p.replace(/<[^>]+>/g, ' '));
  });
  return blocs;
}

// Empreinte courte d'un texte : le manifeste s'en sert pour savoir quels
// blocs régénérer quand un texte du site change.
export function hashTexte(t) {
  return createHash('sha1').update(t, 'utf8').digest('hex').slice(0, 12);
}

// L'empreinte d'un bloc couvre aussi son amorce de prosodie éventuelle
// (previous_text) : changer le contexte change le rendu, donc régénère.
export function empreinteBloc(b) {
  return hashTexte(b.texte + (b.precedent ? '\n@\n' + b.precedent : ''));
}
