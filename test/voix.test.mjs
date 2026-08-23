// Tests de la voix du conteur — zéro dépendance : `node test/voix.test.mjs`
// Le corpus vocal (blocs id + texte oral) et, quand les fichiers enregistrés
// existent, la cohérence manifeste ↔ textes du site : la voix enregistrée ne
// doit JAMAIS dire autre chose que ce que le site affiche.
//
// La garantie propre à cet épisode : les histoires des scénarios sont
// générées (elles dépendent du lieu et de l'heure) — le test de couverture
// ré-énumère TOUT ce que le site peut raconter et vérifie que chaque bloc
// réalisable est dans le corpus. Aucune combinaison oubliée, par construction.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { corpus, empreinteBloc, lieux, nomsPuces } from '../tools/voix-lib.mjs';
import { SCENARIOS, sunriseHomeH, texteOral, blocsScenario, heureOrale,
         placePhraseOrale, EMOJI_RE, PLACES, HOME } from '../js/model.js';

let failed = 0;
let passed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.error('  ✗ ' + name + (detail === undefined ? '' : ' — ' + detail)); }
}

console.log('Le texte oral (texteOral)');
check('« 6 h 30 » se dit « 6 heures 30 », « 18 h » se dit « 18 heures »',
  texteOral('à 6 h 30 puis 18 h pile') === 'à 6 heures 30 puis 18 heures pile');
check('« 7 h 00 » se dit « 7 heures » (jamais « zéro zéro »)',
  texteOral('Il est 7 h 00 : debout') === 'Il est 7 heures : debout');
check('« 1 h » se dit « 1 heure » au singulier — 11 h et 21 h restent au pluriel',
  texteOral('à 1 h puis 1 h 30') === 'à 1 heure puis 1 heure 30' &&
  texteOral('à 11 h et 21 h') === 'à 11 heures et 21 heures');
check('« 24 heures » écrit en toutes lettres ne bouge pas',
  texteOral('24 heures pour un tour') === '24 heures pour un tour');
check('les émojis disparaissent et le point se recolle',
  texteOral('Le soleil brille 🌞 .') === 'Le soleil brille.');
check('le point orphelin d’un émoji retiré après « ! » disparaît',
  texteOral('petit-déjeuner ! 🥐.') === 'petit-déjeuner !');
check('l’espace française avant « ! » et « : » est préservée',
  texteOral('Debout ! Il est midi : à table !') === 'Debout ! Il est midi : à table !');
check('les guillemets français disparaissent (la synthèse trébuche dessus)',
  texteOral('On dit qu’il « se lève »… en vrai') === 'On dit qu’il se lève… en vrai');
check('le tiret cadratin devient une virgule',
  texteOral('chez nous — et là-bas — pareil') === 'chez nous, et là-bas, pareil');

console.log('L’heure orale');
check('« 0 h 00 » se dit « minuit », « 12 h 00 » se dit « midi »',
  heureOrale(0, false).mot === 'minuit' && heureOrale(12, false).mot === 'midi');
check('minuit, midi et une heure gardent leurs minutes en mots (jamais « zéro heures » ni « un heure »)',
  heureOrale(0.5, false).mot === 'minuit 30' && heureOrale(12.5, false).mot === 'midi 30' &&
  heureOrale(1, false).mot === 'une heure' && heureOrale(1.5, false).mot === 'une heure 30' &&
  heureOrale(0.75, false).mot === 'minuit 45');
check('sans approximation, l’heure est exacte (7 h 23 reste 7 h 23)',
  heureOrale(7 + 23 / 60, false).mot === '7 h 23' && !heureOrale(7 + 23 / 60, false).presque);
check('avec approximation, l’arrondi monte à la demi-heure : 7 h 23 → presque 7 h 30',
  heureOrale(7 + 23 / 60, true).mot === '7 h 30' && heureOrale(7 + 23 / 60, true).presque);
check('une heure pile sur la demi-heure n’est pas « presque »',
  heureOrale(7.5, true).mot === '7 h 30' && !heureOrale(7.5, true).presque);
check('23 h 53 → presque minuit (l’arrondi reboucle sur le jour)',
  heureOrale(23 + 53 / 60, true).mot === 'minuit' && heureOrale(23 + 53 / 60, true).presque);
check('la phrase orale n’annonce jamais une heure déjà passée',
  (() => {
    // reconstruire les minutes annoncées depuis le mot (« minuit 30 »,
    // « une heure », « midi », « 7 h 30 »…) et comparer à l'heure réelle
    const minutesDe = (mot) => {
      const m = mot.match(/^(minuit|midi|une heure|vingt et une heures|\d+ h)( (\d+))?$/);
      const base = m[1] === 'minuit' ? 0 : m[1] === 'midi' ? 12 * 60
        : m[1] === 'une heure' ? 60 : m[1] === 'vingt et une heures' ? 21 * 60
        : parseInt(m[1], 10) * 60;
      return base + (m[3] ? parseInt(m[3], 10) : 0);
    };
    for (let h = 0; h < 24; h += 7 / 60) {
      const t = heureOrale(h, true);
      const m = minutesDe(t.mot);
      const reel = Math.round(((h % 24) + 24) % 24 * 60) % (24 * 60);
      const annonce = m === 0 && reel > 12 * 60 ? 24 * 60 : m; // minuit = fin du jour
      if (annonce < reel) return false;
    }
    return true;
  })());

console.log('La phrase orale d’un lieu');
const bali = PLACES[2];
check('à midi chez nous, la phrase orale de Bali dit 19 h sans émoji',
  placePhraseOrale(12, bali, false, false) ===
  'Il est 19 h : le soleil se couche, on dîne.');
check('au dodo (20 h), Bali est « déjà demain » — en phrase séparée à l’oral',
  placePhraseOrale(20, bali, false, false).indexOf('. Et c’est déjà demain !') !== -1);
check('« une histoire… et au lit » devient une phrase pleine SANS le mot « histoire » à l’oral',
  placePhraseOrale(20.75, HOME, false, false).indexOf('on lit un livre avant de dormir') !== -1 &&
  placePhraseOrale(20.75, HOME, false, false).indexOf('istoire') === -1);
check('21 h se dit « vingt et une heures » (le moteur fait la faute de genre en chiffres)',
  heureOrale(21, false).mot === 'vingt et une heures' &&
  heureOrale(21.5, false).mot === 'vingt et une heures 30');
check('avant un report de jour, le « ! » de l’activité s’adoucit en point',
  placePhraseOrale(23, bali, false, false).indexOf('petit-déjeuner. Et c’est déjà demain !') !== -1);
check('même fuseau que la France : la coïncidence se célèbre à l’oral',
  placePhraseOrale(12, HOME, true, false).indexOf('la même heure que chez nous') === 0 ||
  placePhraseOrale(12, HOME, true, false).indexOf('C’est la même heure') === 0);

console.log('Les blocs d’un scénario');
{
  const scnReveil = SCENARIOS[0];
  const b = blocsScenario(scnReveil, scnReveil.homeH, bali, true);
  check('un récit = 4 blocs : chez nous, la France, la transition, le lieu',
    b.length === 4 && b[0].id === 'voix-chez-nous' && b[1].id === 'scn-reveil-france' &&
    b[2].id === 'trans-bali' && b[3].id.indexOf('phrase-') === 0);
  check('les annonces portent la pause courte (120 ms), les phrases la pleine',
    b[0].pause === 120 && b[2].pause === 120 &&
    b[1].pause === undefined && b[3].pause === undefined);
  const c = blocsScenario(scnReveil, scnReveil.homeH, { name: 'Oulan-Bator', lonDeg: 106.9, latDeg: 47.9, utcOffset: 8, pays: false }, false);
  check('hors puces, la transition devient « là-bas » (bloc générique enregistré)',
    c[2].id === 'trans-ailleurs' && c[2].texte === 'Et pendant ce temps, là-bas…');
  check('même heure locale ⇒ même bloc de phrase (Bali et Oulan-Bator partagent le fichier)',
    c[3].id === b[3].id && c[3].texte === b[3].texte);
  const scnLever = SCENARIOS[3];
  const d = blocsScenario(scnLever, sunriseHomeH(bali.lonDeg), bali, true);
  check('le scénario du lever parle en « presque » (heure continue assumée à l’oral)',
    d[1].texte.indexOf('presque') !== -1 || d[3].texte.indexOf('presque') !== -1);
}

console.log('Le corpus vocal');
const blocs = corpus();
{
  const groupes = {};
  for (const b of blocs) {
    const g = b.id.split('-')[0];
    groupes[g] = (groupes[g] || 0) + 1;
  }
  check('l’ossature y est : 1 « chez nous », 3 textes France, 10 transitions, 6 paragraphes d’histoire',
    groupes.voix === 1 && groupes.scn === 3 && groupes.trans === 10 && groupes.histoire === 6,
    JSON.stringify(groupes));
  check('les phrases générées énumérées restent bornées (100 à 250 blocs)',
    groupes.phrase >= 100 && groupes.phrase <= 250, groupes.phrase);
}
{
  const ids = {};
  const textes = {};
  let ok = true;
  let dup = false;
  for (const b of blocs) {
    if (ids[b.id]) ok = false;
    ids[b.id] = true;
    if (textes[b.texte]) dup = true;
    textes[b.texte] = true;
    if (!/^[a-z0-9-]+$/.test(b.id)) ok = false;
    if (!b.texte || b.texte.length < 5) ok = false;
  }
  check('identifiants uniques en kebab-case, textes non vides', ok);
  check('aucun texte enregistré deux fois sous deux ids (pas de crédits gâchés)', !dup);
}
check('les transitions des 9 puces sont nommées, plus le « là-bas » générique',
  ['ailleurs', 'guadeloupe', 'bali', 'tahiti', 'tokyo', 'new-york', 'sydney',
    'la-reunion', 'noumea', 'thailande']
    .every((s) => blocs.some((b) => b.id === 'trans-' + s)));
// EMOJI_RE porte le drapeau /g (stateful avec .test) : on le clone sans
const emojiUne = new RegExp(EMOJI_RE.source, 'u');
check('aucun émoji dans les textes oraux',
  blocs.every((b) => !emojiUne.test(b.texte)));
check('aucune heure en chiffres non oralisée (« N h ») ne subsiste',
  blocs.every((b) => !/\d\s*h\b/.test(b.texte)));
// les leçons payées à l'enregistrement : ces tournures font trébucher la voix
check('jamais « 0 heures », « 1 heure(s) », « 12 heures » ni « 21 heures » en chiffres à l’oral',
  blocs.every((b) => !/\b(0|1|12|21) heures?\b/.test(b.texte)),
  blocs.filter((b) => /\b(0|1|12|21) heures?\b/.test(b.texte)).map((b) => b.id).join(', '));
// (les paragraphes d'histoire, écrits main, gardent le droit au « … » de
// suspense — ils se valident à l'oreille ; les phrases GÉNÉRÉES, jamais)
check('jamais de points de suspension en plein flux dans les phrases générées',
  blocs.every((b) => b.id.indexOf('histoire-') === 0 || !/… [a-zà-öø-ÿ]/.test(b.texte)),
  blocs.filter((b) => b.id.indexOf('histoire-') !== 0 && /… [a-zà-öø-ÿ]/.test(b.texte))
    .map((b) => b.id).join(', '));
check('aucun guillemet ni tiret cadratin dans les textes oraux',
  blocs.every((b) => !/[«»—]/.test(b.texte)));
check('apostrophes typographiques « ’ » partout (jamais le « \' » droit)',
  blocs.every((b) => b.texte.indexOf("'") === -1));
check('le corpus tient dans le plan Starter d’ElevenLabs (< 15 000 crédits)',
  blocs.reduce((n, b) => n + b.texte.length, 0) < 15000);

console.log('La couverture : tout ce que le site peut raconter est dans le corpus');
{
  const parId = {};
  for (const b of blocs) parId[b.id] = b.texte;
  const puces = nomsPuces();
  let manquants = 0;
  let divergents = 0;
  for (const scn of SCENARIOS) {
    for (const place of lieux()) {
      const atH = scn.sunriseAt ? sunriseHomeH(place.lonDeg) : scn.homeH;
      for (const b of blocsScenario(scn, atH, place, !!puces[place.name])) {
        const oral = texteOral(b.texte);
        if (!parId[b.id]) manquants++;
        else if (parId[b.id] !== oral) divergents++;
      }
    }
  }
  check('chaque scénario × chaque lieu du répertoire : tous les blocs sont dans le corpus',
    manquants === 0, manquants + ' manquant(s)');
  check('et chaque bloc y porte exactement le texte que le site dirait',
    divergents === 0, divergents + ' divergent(s)');
}

console.log('Le manifeste des fichiers enregistrés');
const manifeste = JSON.parse(readFileSync(new URL('../assets/audio/manifest.json', import.meta.url), 'utf8'));
const enregistres = Object.keys(manifeste.blocs);
if (enregistres.length === 0) {
  check('pas encore de fichiers enregistrés : le site lit tout à la synthèse (repli)', true);
} else {
  check('chaque bloc du corpus a son fichier enregistré',
    blocs.every((b) => manifeste.blocs[b.id]),
    blocs.filter((b) => !manifeste.blocs[b.id]).map((b) => b.id).slice(0, 5).join(', '));
  check('chaque fichier dit ENCORE le texte du site (texte et empreinte à jour)',
    blocs.every((b) => {
      const m = manifeste.blocs[b.id];
      return m && m.texte === b.texte && m.hash === empreinteBloc(b);
    }),
    blocs.filter((b) => {
      const m = manifeste.blocs[b.id];
      return !m || m.texte !== b.texte || m.hash !== empreinteBloc(b);
    }).map((b) => b.id).slice(0, 5).join(', '));
  check('aucun bloc fantôme dans le manifeste',
    enregistres.every((id) => blocs.some((b) => b.id === id)));
  const dossier = new URL('../assets/audio/', import.meta.url);
  check('tous les mp3 du manifeste existent sur le disque',
    enregistres.every((id) => existsSync(new URL(manifeste.blocs[id].fichier, dossier))));
  check('aucun mp3 orphelin dans assets/audio/',
    readdirSync(dossier).filter((f) => f.endsWith('.mp3'))
      .every((f) => enregistres.some((id) => manifeste.blocs[id].fichier === f)));
  check('la voix et le modèle sont notés dans le manifeste',
    typeof manifeste.voix === 'string' && manifeste.voix.length > 0 &&
    manifeste.modele === 'eleven_multilingual_v2');
}

console.log('');
if (failed > 0) {
  console.error(failed + ' test(s) en échec, ' + passed + ' réussi(s).');
  process.exit(1);
}
console.log('Tous les tests de la voix passent (' + passed + ').');
