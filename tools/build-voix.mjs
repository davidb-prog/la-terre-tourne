// Génère la voix enregistrée du conteur avec ElevenLabs — outil HORS site :
// le site reste 100 % statique, les mp3 sont commités, aucune clé ne le touche.
//
//   ELEVENLABS_API_KEY=…  ELEVENLABS_VOICE_ID=…  node tools/build-voix.mjs
//
// Options :
//   --dry-run          liste les blocs (à générer / à jour) et le coût en
//                      crédits, sans rien appeler — marche sans clé
//   --only <id>        (re)génère uniquement ce bloc, même s'il est à jour
//   --essai id1,id2…   phrase-test avec chaque voix candidate, pour choisir :
//                      écrit tools/essais/essai-<voiceId>.mp3 (non commité)
//   --voice <id>       équivalent de ELEVENLABS_VOICE_ID
//
// Idempotent : le manifeste (assets/audio/manifest.json) garde le hash du
// texte de chaque bloc — on ne régénère que les textes nouveaux ou modifiés.
// Après génération, réécouter tout d'une traite : tools/ecoute.html.
// Zéro dépendance npm (Node ≥ 18 : fetch natif).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { corpus, empreinteBloc } from './voix-lib.mjs';

const MODELE = 'eleven_multilingual_v2';
// de la parole : 64 kb/s suffisent largement (moitié du poids de 128)
const FORMAT_SORTIE = 'mp3_44100_64';
const REGLAGES_VOIX = { stability: 0.5, similarity_boost: 0.75, style: 0.3 };
// la phrase-test du mode --essai : expressive, avec suspens et exclamation
const PHRASE_ESSAI = 'Quand tu prends ton petit-déjeuner, à Bali le soleil se couche déjà… '
  + 'La Terre est ronde, et elle tourne — c’est pour ça qu’il n’est pas la même heure partout !';

const racine = fileURLToPath(new URL('..', import.meta.url));
const dossierAudio = racine + 'assets/audio/';
const cheminManifeste = dossierAudio + 'manifest.json';

const args = process.argv.slice(2);
const drapeau = (nom) => args.includes(nom);
const valeur = (nom) => {
  const i = args.indexOf(nom);
  return i !== -1 && args[i + 1] ? args[i + 1] : null;
};

const manifeste = lireManifeste();
const cle = process.env.ELEVENLABS_API_KEY || '';
// la voix : --voice, sinon la variable d'environnement, sinon celle déjà
// retenue dans le manifeste (pratique pour les retouches --only)
const voix = valeur('--voice') || process.env.ELEVENLABS_VOICE_ID || manifeste.voix || '';

async function genererMp3(texte, voiceId, precedent) {
  const url = 'https://api.elevenlabs.io/v1/text-to-speech/' + voiceId
    + '?output_format=' + FORMAT_SORTIE;
  const corps = { text: texte, model_id: MODELE, voice_settings: REGLAGES_VOIX };
  // le contexte de prosodie des fragments (« …et fabrique… ») : influence le
  // ton sans être prononcé
  if (precedent) corps.previous_text = precedent;
  const rep = await fetch(url, {
    method: 'POST',
    headers: { 'xi-api-key': cle, 'content-type': 'application/json' },
    body: JSON.stringify(corps),
  });
  if (!rep.ok) {
    throw new Error('ElevenLabs ' + rep.status + ' : ' + (await rep.text()).slice(0, 300));
  }
  return Buffer.from(await rep.arrayBuffer());
}

function lireManifeste() {
  try {
    return JSON.parse(readFileSync(cheminManifeste, 'utf8'));
  } catch (e) {
    return { voix: null, modele: null, blocs: {} };
  }
}

function ecrirePageEcoute(blocs) {
  const lignes = blocs.map((b) =>
    '<div class="bloc"><h2>' + b.id + '</h2><audio controls preload="none" src="../assets/audio/'
    + b.id + '.mp3"></audio><p>' + b.texte + '</p></div>').join('\n');
  writeFileSync(racine + 'tools/ecoute.html',
    '<!doctype html><meta charset="utf-8"><title>Écoute de contrôle</title>\n'
    + '<style>body{font-family:system-ui;max-width:720px;margin:2rem auto;padding:0 1rem;'
    + 'background:#0b1020;color:#e9edf8}h2{font-size:1rem;color:#ffcf5c;margin:1.4em 0 .2em}'
    + 'audio{width:100%}p{margin:.4em 0 0;color:#9aa5c3}</style>\n'
    + '<h1>Écoute de contrôle — tous les blocs</h1>\n'
    + '<p>Servir le dépôt (python3 -m http.server) et ouvrir /tools/ecoute.html</p>\n'
    + lignes + '\n');
}

const blocs = corpus();

// -- mode essai : une phrase-test par voix candidate, pour choisir la voix --
if (drapeau('--essai') || valeur('--essai')) {
  const ids = (valeur('--essai') || '').split(',').filter(Boolean);
  if (!cle || ids.length === 0) {
    console.error('usage : ELEVENLABS_API_KEY=… node tools/build-voix.mjs --essai voiceId1,voiceId2');
    process.exit(1);
  }
  mkdirSync(racine + 'tools/essais', { recursive: true });
  for (const v of ids) {
    process.stdout.write('essai ' + v + ' … ');
    const mp3 = await genererMp3(PHRASE_ESSAI, v);
    writeFileSync(racine + 'tools/essais/essai-' + v + '.mp3', mp3);
    console.log('ok (tools/essais/essai-' + v + '.mp3)');
  }
  console.log('\nÉcouter les essais, puis générer tout avec la voix choisie :');
  console.log('  ELEVENLABS_API_KEY=… ELEVENLABS_VOICE_ID=<gagnante> node tools/build-voix.mjs');
  process.exit(0);
}

// -- plan : quels blocs générer ? --
const seulement = valeur('--only');
const aFaire = [];
let total = 0;
for (const b of blocs) {
  total += b.texte.length;
  const connu = manifeste.blocs[b.id];
  const aJour = connu && connu.hash === empreinteBloc(b)
    && existsSync(dossierAudio + b.id + '.mp3') && manifeste.voix === voix;
  const force = seulement === b.id;
  if (seulement && !force) continue;
  if (!aJour || force) aFaire.push(b);
}
const credits = aFaire.reduce((n, b) => n + b.texte.length, 0);
console.log(blocs.length + ' blocs (' + total + ' caractères) — à générer : '
  + aFaire.length + ' (≈ ' + credits + ' crédits)');

if (drapeau('--dry-run')) {
  for (const b of aFaire) console.log('  → ' + b.id + ' (' + b.texte.length + ' car.)');
  process.exit(0);
}
if (aFaire.length === 0) {
  console.log('Tout est à jour.');
  ecrirePageEcoute(blocs);
  process.exit(0);
}
if (!cle || !voix) {
  console.error('Il faut ELEVENLABS_API_KEY et ELEVENLABS_VOICE_ID (ou --voice).');
  process.exit(1);
}

// -- génération (séquentielle : respecte les limites de débit du plan) --
mkdirSync(dossierAudio, { recursive: true });
for (const b of aFaire) {
  process.stdout.write(b.id + ' … ');
  const mp3 = await genererMp3(b.texte, voix, b.precedent);
  writeFileSync(dossierAudio + b.id + '.mp3', mp3);
  manifeste.blocs[b.id] = { texte: b.texte, hash: empreinteBloc(b), fichier: b.id + '.mp3' };
  console.log('ok (' + Math.round(mp3.length / 1024) + ' ko)');
}
// les blocs disparus du site ne doivent pas hanter le manifeste
for (const id of Object.keys(manifeste.blocs)) {
  if (!blocs.some((b) => b.id === id)) delete manifeste.blocs[id];
}
manifeste.voix = voix;
manifeste.modele = MODELE;
manifeste.format = FORMAT_SORTIE;
manifeste.reglages = REGLAGES_VOIX;
writeFileSync(cheminManifeste, JSON.stringify(manifeste, null, 2) + '\n');
ecrirePageEcoute(blocs);
console.log('\nManifeste écrit. Réécouter : servir le dépôt puis ouvrir /tools/ecoute.html');
console.log('Puis committer assets/audio/ (mp3 + manifest.json).');
