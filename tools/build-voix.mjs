// Génère la voix enregistrée du conteur avec ElevenLabs — outil HORS site :
// le site reste 100 % statique, les mp3 sont commités, aucune clé ne le touche.
//
//   ELEVENLABS_API_KEY=…  ELEVENLABS_VOICE_ID=…  node tools/build-voix.mjs
//
// Options :
//   --dry-run          liste les blocs (à générer / à jour) et le coût en
//                      crédits, sans rien appeler — marche sans clé
//   --only <id>        (re)génère uniquement ce bloc, même s'il est à jour
//   --calme            réglages posés (style 0, stabilité 0,75) + contexte de
//                      prosodie previous_text — pour les clips qui « bloquent »
//                      prise après prise (à combiner avec --only)
//   --essai id1,id2…   phrase-test avec chaque voix candidate, pour choisir :
//                      écrit tools/essais/essai-<voiceId>.mp3 (non commité)
//   --voice <id>       équivalent de ELEVENLABS_VOICE_ID
//
// Idempotent : le manifeste (assets/audio/manifest.json) garde le hash du
// texte de chaque bloc — on ne régénère que les textes nouveaux ou modifiés.
// Après génération, réécouter tout d'une traite : tools/ecoute.html.
// Zéro dépendance npm (Node ≥ 18 : fetch natif).

import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { corpus, empreinteBloc } from './voix-lib.mjs';

const MODELE = 'eleven_multilingual_v2';
// de la parole : 64 kb/s suffisent largement (moitié du poids de 128)
const FORMAT_SORTIE = 'mp3_44100_64';
const REGLAGES_VOIX = { stability: 0.5, similarity_boost: 0.75, style: 0.3 };
// --calme : pour les clips qui « bloquent » prise après prise. Les clips
// courts sans contexte sont le point faible du modèle (pauses dramatiques,
// syllabes étirées) : on re-tire avec des réglages posés (style 0, stabilité
// haute) ET un contexte de prosodie previous_text (la phrase qui précède le
// bloc dans le récit — entendue par le modèle, jamais prononcée). Le texte ne
// change pas : ni id ni manifeste ne bougent.
const REGLAGES_CALMES = { stability: 0.75, similarity_boost: 0.75, style: 0 };
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

async function genererMp3(texte, voiceId, precedent, calme) {
  const url = 'https://api.elevenlabs.io/v1/text-to-speech/' + voiceId
    + '?output_format=' + FORMAT_SORTIE;
  const corps = { text: texte, model_id: MODELE,
    voice_settings: calme ? REGLAGES_CALMES : REGLAGES_VOIX };
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

// La page d'écoute-marathon : tous les clips à la suite SANS cliquer 165 fois.
// Lecture enchaînée (le texte suit en surbrillance), espace = pause, flèches =
// précédent/suivant, R (ou le bouton 🚩) = marquer « à refaire » — les
// marques persistent (localStorage) et la barre du bas donne les commandes
// --only toutes prêtes. Vitesse réglable, reprise là où on s'était arrêté.
function ecrirePageEcoute(blocs) {
  // v : la date du fichier — le navigateur met les mp3 en cache par URL, et
  // sans elle un re-tirage se réécoute... dans sa vieille version
  const fraicheur = (id) => {
    try { return Math.round(statSync(dossierAudio + id + '.mp3').mtimeMs); }
    catch (e) { return 0; }
  };
  const data = blocs.map((b) => ({ id: b.id, texte: b.texte, v: fraicheur(b.id) }));
  writeFileSync(racine + 'tools/ecoute.html', `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Écoute de contrôle</title>
<style>
body{font-family:system-ui;max-width:760px;margin:0 auto;padding:0 1rem 7rem;background:#0b1020;color:#e9edf8}
header{position:sticky;top:0;background:#0b1020ee;padding:.8rem 0 .6rem;z-index:2;border-bottom:1px solid #223}
h1{font-size:1.1rem;margin:.1em 0 .4em}
.ctrl{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap}
button{font:inherit;border:1px solid #345;border-radius:8px;background:#141b33;color:#e9edf8;padding:.45em .8em;cursor:pointer}
button:hover{background:#1b2445}
#lecture{font-size:1.15rem;padding:.45em 1.1em}
select{font:inherit;background:#141b33;color:#e9edf8;border:1px solid #345;border-radius:8px;padding:.4em}
#etat{color:#9aa5c3;margin-left:auto}
.aide{color:#67729a;font-size:.85rem;margin:.3em 0 0}
.ligne{display:flex;gap:.7rem;align-items:baseline;padding:.5rem .6rem;border-radius:8px;cursor:pointer}
.ligne:hover{background:#121937}
.ligne.actif{background:#182253;outline:1px solid #35418a}
.ligne.refaire{background:#3a1622}
.ligne.actif.refaire{outline-color:#a04}
.num{color:#67729a;min-width:2.6em;text-align:right}
.id{color:#ffcf5c;font-size:.8rem;min-width:9em}
.txt{flex:1;color:#cdd5ee}
.ligne.actif .txt{color:#fff;font-weight:600}
.err{color:#ff8899;font-size:.8rem}
.drapeau{border:none;background:none;padding:0 .2em;font-size:1rem;opacity:.35}
.ligne.refaire .drapeau{opacity:1}
footer{position:fixed;left:0;right:0;bottom:0;background:#141b33f2;border-top:1px solid #345;padding:.6rem 1rem;z-index:3}
footer .inner{max-width:760px;margin:0 auto;display:flex;gap:.8rem;align-items:center;flex-wrap:wrap}
pre{background:#0b1020;border:1px solid #345;border-radius:8px;padding:.5rem;overflow-x:auto;font-size:.8rem;width:100%;user-select:all;margin:.4rem 0 0}
</style>
<header>
<h1 id="titre">Écoute de contrôle — ${data.length} clips à la suite</h1>
<div class="ctrl">
  <button id="lecture">▶ Écouter tout</button>
  <button id="prec">⏮</button>
  <button id="suiv">⏭</button>
  <select id="vitesse"><option value="1">vitesse ×1</option><option value="1.25">×1,25</option><option value="1.5">×1,5</option><option value="2">×2</option></select>
  <span id="etat">—</span>
</div>
<p class="aide">Espace = pause · ← → = précédent/suivant · R = 🚩 à refaire (la liste des commandes s’écrit en bas)</p>
</header>
<div id="liste"></div>
<footer><div class="inner">
  <strong id="nbref">0 clip à refaire</strong>
  <button id="copier" hidden>Copier les commandes</button>
  <button id="vider" hidden>Tout démarquer</button>
  <pre id="cmds" hidden></pre>
</div></footer>
<script>
const TOUT = ${JSON.stringify(data)};
// réécoute ciblée d'une fournée : ecoute.html#ids=id1,id2,… ne garde que
// ces clips-là (lecture enchaînée, marques et commandes inchangées)
let DATA = TOUT;
let filtre = false;
(function () {
  const m = location.hash.match(/ids=([^&]+)/);
  if (!m) return;
  const voulu = {};
  for (const id of decodeURIComponent(m[1]).split(',')) voulu[id.trim()] = true;
  const f = TOUT.filter((b) => voulu[b.id]);
  if (f.length) { DATA = f; filtre = true; }
})();
window.addEventListener('hashchange', () => location.reload());
document.getElementById('titre').textContent = filtre
  ? 'Écoute ciblée — ' + DATA.length + ' clips (sur ' + TOUT.length + ')'
  : 'Écoute de contrôle — ' + DATA.length + ' clips à la suite';
const audio = new Audio();
const liste = document.getElementById('liste');
let courant = -1, enLecture = false;
let refaire = {};
try { refaire = JSON.parse(localStorage.getItem('ltt-ecoute-refaire') || '{}'); } catch (e) {}
let repris = -1;
if (!filtre) {
  try { repris = parseInt(localStorage.getItem('ltt-ecoute-position') || '-1', 10); } catch (e) {}
}

const lignes = DATA.map((b, i) => {
  const el = document.createElement('div');
  el.className = 'ligne' + (refaire[b.id] ? ' refaire' : '');
  el.innerHTML = '<span class="num">' + (i + 1) + '</span><span class="id"></span>' +
    '<span class="txt"></span><button class="drapeau" title="à refaire (R)">🚩</button>';
  el.children[1].textContent = b.id;
  el.children[2].textContent = b.texte;
  el.addEventListener('click', () => joue(i));
  el.children[3].addEventListener('click', (e) => { e.stopPropagation(); marque(i); });
  liste.appendChild(el);
  return el;
});

function sauve() {
  try {
    localStorage.setItem('ltt-ecoute-refaire', JSON.stringify(refaire));
    // en écoute ciblée, ne pas écraser la position de l'écoute complète
    if (!filtre) localStorage.setItem('ltt-ecoute-position', String(courant));
  } catch (e) {}
}
function marque(i) {
  const id = DATA[i].id;
  if (refaire[id]) delete refaire[id]; else refaire[id] = true;
  lignes[i].classList.toggle('refaire', !!refaire[id]);
  sauve(); majPied();
}
function majPied() {
  const ids = DATA.map((b) => b.id).filter((id) => refaire[id]);
  document.getElementById('nbref').textContent = ids.length + ' clip' + (ids.length > 1 ? 's' : '') + ' à refaire';
  document.getElementById('copier').hidden = !ids.length;
  document.getElementById('vider').hidden = !ids.length;
  const pre = document.getElementById('cmds');
  pre.hidden = !ids.length;
  pre.textContent = ids.map((id) => 'node tools/build-voix.mjs --only ' + id + ' --calme').join('\\n');
}
function majEtat() {
  document.getElementById('etat').textContent = courant >= 0 ? (courant + 1) + ' / ' + DATA.length : '—';
  document.getElementById('lecture').textContent = enLecture ? '⏸ Pause' : (courant >= 0 ? '▶ Reprendre' : '▶ Écouter tout');
}
function joue(i) {
  if (i < 0 || i >= DATA.length) { stop(); return; }
  if (courant >= 0) lignes[courant].classList.remove('actif');
  courant = i;
  lignes[i].classList.add('actif');
  lignes[i].scrollIntoView({ block: 'center', behavior: 'smooth' });
  audio.src = '../assets/audio/' + DATA[i].id + '.mp3?v=' + (DATA[i].v || 0);
  audio.playbackRate = parseFloat(document.getElementById('vitesse').value);
  enLecture = true;
  audio.play().catch(() => erreurClip(i));
  sauve(); majEtat();
}
function erreurClip(i) {
  const id = lignes[i].children[1];
  if (!/illisible/.test(id.textContent)) id.innerHTML += ' <span class="err">⚠ illisible</span>';
  if (!refaire[DATA[i].id]) marque(i);
  if (enLecture) setTimeout(() => { if (enLecture && courant === i) joue(i + 1); }, 400);
}
function stop() { enLecture = false; audio.pause(); majEtat(); }
audio.addEventListener('ended', () => { if (enLecture) setTimeout(() => joue(courant + 1), 150); });
audio.addEventListener('error', () => erreurClip(courant));

document.getElementById('lecture').addEventListener('click', () => {
  if (enLecture) { stop(); return; }
  if (courant >= 0 && audio.src) { enLecture = true; audio.play().catch(() => erreurClip(courant)); majEtat(); }
  else joue(repris >= 0 && repris < DATA.length ? repris : 0);
});
document.getElementById('prec').addEventListener('click', () => joue(Math.max(0, courant - 1)));
document.getElementById('suiv').addEventListener('click', () => joue(courant + 1));
document.getElementById('vitesse').addEventListener('change', () => {
  audio.playbackRate = parseFloat(document.getElementById('vitesse').value);
});
document.getElementById('copier').addEventListener('click', () => {
  navigator.clipboard.writeText(document.getElementById('cmds').textContent).catch(() => {});
});
document.getElementById('vider').addEventListener('click', () => {
  refaire = {}; lignes.forEach((l) => l.classList.remove('refaire')); sauve(); majPied();
});
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'SELECT') return;
  if (e.code === 'Space') { e.preventDefault(); document.getElementById('lecture').click(); }
  else if (e.key === 'ArrowRight') joue(courant + 1);
  else if (e.key === 'ArrowLeft') joue(Math.max(0, courant - 1));
  else if (e.key === 'r' || e.key === 'R') { if (courant >= 0) marque(courant); }
});
majPied(); majEtat();
if (repris >= 0 && repris < DATA.length) lignes[repris].scrollIntoView({ block: 'center' });
</script>
`);
}

const blocs = corpus();

// Le contexte de prosodie du mode --calme : la phrase qui précède le bloc
// dans le récit. Envoyée en previous_text (jamais prononcée), elle ancre le
// ton du modèle — le point faible des clips courts isolés.
function contexteDe(b) {
  if (b.id.indexOf('histoire-') === 0) {
    const n = parseInt(b.id.slice('histoire-'.length), 10);
    const prev = blocs.find((x) => x.id === 'histoire-' + (n - 1));
    return prev ? prev.texte : null;
  }
  if (b.id.indexOf('phrase-') === 0) return 'Et pendant ce temps, là-bas…';
  if (b.id.indexOf('scn-') === 0) return 'Chez nous…';
  if (b.id.indexOf('trans-') === 0) return 'Il est midi pile : à table !';
  return null;
}

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
const calme = drapeau('--calme');
if (calme) console.log('mode --calme : réglages posés + contexte de prosodie previous_text');
// en mode calme, la DICTION change (jamais les mots prononcés — le manifeste
// garde le texte officiel) : le deux-points se dit comme un point (la voix
// termine sa syllabe et marque un vrai arrêt au lieu d'enchaîner), et les
// heures en chiffres passent en toutes lettres — l'oralisation interne du
// moteur (« 30 » → « tren… ») est justement ce qui déraillait sur certaines
// prises, on ne lui laisse plus le choix.
const MOTS = ['zéro', 'une', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit',
  'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize',
  'dix-sept', 'dix-huit', 'dix-neuf', 'vingt', 'vingt et une', 'vingt-deux',
  'vingt-trois', 'vingt-quatre', 'vingt-cinq', 'vingt-six', 'vingt-sept',
  'vingt-huit', 'vingt-neuf', 'trente', 'trente et un', 'trente-deux',
  'trente-trois', 'trente-quatre', 'trente-cinq', 'trente-six', 'trente-sept',
  'trente-huit', 'trente-neuf', 'quarante', 'quarante et un', 'quarante-deux',
  'quarante-trois', 'quarante-quatre', 'quarante-cinq'];
const diction = (t) => {
  if (!calme) return t;
  return t.replace(/\s*:\s+/g, '. ')
    .replace(/(\d+) heures( (\d+))?/g, (m, h, _g, mn) => {
      const hh = MOTS[parseInt(h, 10)] || h;
      return hh + ' heures' + (mn ? ' ' + (MOTS[parseInt(mn, 10)] || mn) : '');
    });
};
mkdirSync(dossierAudio, { recursive: true });
for (const b of aFaire) {
  process.stdout.write(b.id + (calme ? ' (calme)' : '') + ' … ');
  const mp3 = await genererMp3(diction(b.texte), voix, b.precedent || (calme ? contexteDe(b) : null), calme);
  writeFileSync(dossierAudio + b.id + '.mp3', mp3);
  manifeste.blocs[b.id] = { texte: b.texte, hash: empreinteBloc(b), fichier: b.id + '.mp3' };
  console.log('ok (' + Math.round(mp3.length / 1024) + ' ko)');
}
// les blocs disparus du site ne doivent pas hanter le manifeste — ni leurs
// mp3 traîner sur le disque (quand un texte change, son id change avec lui)
for (const id of Object.keys(manifeste.blocs)) {
  if (blocs.some((b) => b.id === id)) continue;
  const mort = dossierAudio + manifeste.blocs[id].fichier;
  if (existsSync(mort)) unlinkSync(mort);
  delete manifeste.blocs[id];
}
manifeste.voix = voix;
manifeste.modele = MODELE;
manifeste.format = FORMAT_SORTIE;
manifeste.reglages = REGLAGES_VOIX;
writeFileSync(cheminManifeste, JSON.stringify(manifeste, null, 2) + '\n');
ecrirePageEcoute(blocs);
console.log('\nManifeste écrit. Réécouter SEULEMENT cette fournée (servir le dépôt, puis) :');
console.log('  /tools/ecoute.html#ids=' + aFaire.map((b) => b.id).join(','));
console.log('Puis committer assets/audio/ (mp3 + manifest.json).');
