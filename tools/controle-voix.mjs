// Contrôle « sans oreilles » de la voix enregistrée — outil LOCAL, comme
// build-voix.mjs. Évite de réécouter 165 clips un par un : chaque mp3 passe
// deux filets, et seuls les suspects restent à écouter.
//
//   node tools/controle-voix.mjs               # tout le manifeste
//   node tools/controle-voix.mjs --sans-stt    # filets mécaniques seulement
//   node tools/controle-voix.mjs --ids id1,id2 # un sous-ensemble
//   node tools/controle-voix.mjs --modele base # Whisper plus rapide (défaut : small)
//   node tools/controle-voix.mjs --seuil 0.8   # sévérité de la comparaison (défaut : 0.82)
//
// 1. Filets mécaniques (ffmpeg/ffprobe) : le fichier se décode, sa durée est
//    plausible pour son texte (vitesse de parole), pas de long blanc au
//    milieu, silence de fin mesuré (utile pour régler les pauses).
// 2. Ré-écoute automatique (openai-whisper, en local) : chaque clip est
//    transcrit, la transcription est comparée au texte du manifeste après
//    normalisation (accents, ponctuation, « 7 h 30 » ↔ « sept heures
//    trente »). Un score trop bas = à réécouter.
//
// Sortie : un bilan trié du pire au meilleur, une page de triage
// tools/controle.html (gitignorée) avec SEULEMENT les clips suspects — texte
// attendu, texte entendu, lecteur audio, commande --only prête à copier.
// Un clip signalé n'est pas forcément raté : c'est la courte liste de
// réécoute ciblée. Les transcriptions sont mises en cache par empreinte de
// fichier (tools/controle-cache.json, gitignoré) : après un re-tirage
// --only, seul le fichier refait est re-transcrit.
//
// Prérequis (macOS) : brew install ffmpeg ; pip3 install -U openai-whisper
// (le premier lancement télécharge le modèle). Zéro dépendance npm.

import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { corpus } from './voix-lib.mjs';

const racine = fileURLToPath(new URL('..', import.meta.url));
const dossierAudio = racine + 'assets/audio/';
const cheminCache = racine + 'tools/controle-cache.json';

const args = process.argv.slice(2);
const drapeau = (nom) => args.includes(nom);
const valeur = (nom) => {
  const i = args.indexOf(nom);
  return i !== -1 && args[i + 1] ? args[i + 1] : null;
};
const SEUIL = parseFloat(valeur('--seuil') || '0.82');
const MODELE = valeur('--modele') || 'small';

// ---------------------------------------------------------------- outillage
const existe = (cmd) => spawnSync('which', [cmd]).status === 0;

function hashFichier(chemin) {
  return createHash('sha1').update(readFileSync(chemin)).digest('hex').slice(0, 16);
}

// ------------------------------------------------- normalisation pour comparer
// Whisper écrit tantôt « 7h30 », tantôt « sept heures trente » : on ramène
// les deux côtés à la même forme (mots, sans accents ni ponctuation).
const MOTS_NOMBRES = ['zero', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept',
  'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize',
  'dix sept', 'dix huit', 'dix neuf', 'vingt', 'vingt et un', 'vingt deux',
  'vingt trois', 'vingt quatre', 'vingt cinq', 'vingt six', 'vingt sept',
  'vingt huit', 'vingt neuf', 'trente', 'trente et un', 'trente deux',
  'trente trois', 'trente quatre', 'trente cinq', 'trente six', 'trente sept',
  'trente huit', 'trente neuf', 'quarante', 'quarante et un', 'quarante deux',
  'quarante trois', 'quarante quatre', 'quarante cinq', 'quarante six',
  'quarante sept', 'quarante huit', 'quarante neuf', 'cinquante',
  'cinquante et un', 'cinquante deux', 'cinquante trois', 'cinquante quatre',
  'cinquante cinq', 'cinquante six', 'cinquante sept', 'cinquante huit',
  'cinquante neuf', 'soixante'];

export function normaliser(texte) {
  let t = texte.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/(\d+)\s*h\s*(\d+)/g, '$1 heures $2')  // 7h30 / 7 h 30 → 7 heures 30
    .replace(/(\d+)\s*h\b/g, '$1 heures')
    .replace(/[-'’]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ');
  t = t.replace(/\b(\d+)\b/g, (m, n) => {
    const v = parseInt(n, 10);
    return v <= 60 ? MOTS_NOMBRES[v] : m;
  });
  // tolérances d'oreille : Whisper entend parfois « et demie » pour
  // « trente », « une heure » pour « 1 heure », le singulier pour le pluriel
  t = t.replace(/\bune heure\b/g, 'un heure')
    .replace(/\bheure\b/g, 'heures')
    .replace(/\bheures et demie\b/g, 'heures trente')
    .replace(/\bheures et quart\b/g, 'heures quinze')
    .replace(/\b(minuit|midi) et demie?\b/g, '$1 trente')
    .replace(/\b(minuit|midi) et quart\b/g, '$1 quinze');
  return t.replace(/\s+/g, ' ').trim();
}

// Blocages : la voix « cale » parfois en pleine phrase (blanc d'une demi-
// seconde, syllabe étirée) — les mots restent justes, Whisper transcrit
// proprement, la comparaison de texte ne voit RIEN. On regarde donc le
// TEMPS : l'horodatage des mots (word_timestamps) révèle les trous en
// pleine phrase (une pause après une ponctuation est normale) et les mots
// anormalement étirés.
// Calibré sur une voix de CONTEUR (les premières valeurs signalaient des
// clips validés à l'oreille) : les pauses expressives vont jusqu'à ~0,8 s,
// une pause entre deux segments Whisper est une respiration de phrase, et
// les horodatages débordent en bord de clip (le dernier mot « absorbe » le
// silence de fin gravé) — premier et dernier mots exclus de l'étirement.
export function pausesSuspectes(mots) {
  const suspects = [];
  for (let i = 0; i < mots.length; i++) {
    const [w, debut, fin, seg] = mots[i];
    const mot = String(w).trim();
    if (i + 1 < mots.length) {
      const memeSegment = seg === undefined || mots[i + 1][3] === undefined || mots[i + 1][3] === seg;
      const trou = mots[i + 1][1] - fin;
      if (trou >= 0.8 && memeSegment && !/[.!?…:;,]$/.test(mot)) {
        suspects.push('blanc de ' + trou.toFixed(1) + ' s en pleine phrase, après « ' + mot + ' »');
      }
    }
    // parole normale ≈ 0,07–0,09 s par lettre : bien au-delà, le mot traîne
    const duree = fin - debut;
    if (i > 0 && i < mots.length - 1 &&
        duree >= 1.2 && duree / Math.max(2, mot.replace(/[^a-zà-ÿ]/gi, '').length) >= 0.2) {
      suspects.push('mot étiré (« ' + mot + ' », ' + duree.toFixed(1) + ' s)');
    }
  }
  return suspects;
}

// Bégaiement : la voix répète parfois un bout de phrase (« 24 grandes
// tranches grandes tranches »). La transcription l'entend — on cherche un
// n-gramme (2 à 4 mots) immédiatement doublé dans l'entendu qui ne l'est
// pas dans l'attendu. Sur textes normalisés.
export function begaiement(entendu, attendu) {
  const T = entendu.split(' ').filter(Boolean);
  for (let n = 4; n >= 2; n--) {
    for (let i = 0; i + 2 * n <= T.length; i++) {
      const a = T.slice(i, i + n).join(' ');
      const b = T.slice(i + n, i + 2 * n).join(' ');
      if (a === b && attendu.indexOf(a + ' ' + a) === -1) return a;
    }
  }
  return null;
}

// Distance d'édition entre listes de mots → score de ressemblance dans [0, 1].
export function ressemblance(a, b) {
  const A = a.split(' ').filter(Boolean);
  const B = b.split(' ').filter(Boolean);
  if (!A.length && !B.length) return 1;
  const n = A.length, m = B.length;
  let prev = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const cur = [i];
    for (let j = 1; j <= m; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1,
        prev[j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return 1 - prev[m] / Math.max(n, m);
}

// --------------------------------------------------- filets mécaniques (ffmpeg)
function dureeDe(chemin) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries',
    'format=duration', '-of', 'csv=p=0', chemin], { encoding: 'utf8' });
  return parseFloat(out);
}

// Les plages de silence (< −35 dB pendant ≥ 1,2 s) : un blanc AU MILIEU d'un
// clip est suspect ; le silence de FIN est normal (on le mesure, il sert à
// régler les pauses entre blocs).
function silencesDe(chemin, duree) {
  const res = spawnSync('ffmpeg', ['-i', chemin, '-af',
    'silencedetect=noise=-35dB:d=1.2', '-f', 'null', '-'], { encoding: 'utf8' });
  const log = res.stderr || '';
  const plages = [];
  let debut = null;
  for (const ligne of log.split('\n')) {
    const s = ligne.match(/silence_start: ([\d.]+)/);
    const e = ligne.match(/silence_end: ([\d.]+)/);
    if (s) debut = parseFloat(s[1]);
    if (e && debut !== null) { plages.push([debut, parseFloat(e[1])]); debut = null; }
  }
  if (debut !== null) plages.push([debut, duree]); // silence jusqu'à la fin
  return plages;
}

// ------------------------------------------------------------------- le bilan
// (le corps ne s'exécute qu'en lancement direct — les fonctions ci-dessus
// restent importables par les tests)
const lanceDirectement = process.argv[1] &&
  import.meta.url === new URL('file://' + process.argv[1]).href;
if (lanceDirectement) principal();

function principal() {
const manifeste = JSON.parse(readFileSync(dossierAudio + 'manifest.json', 'utf8'));
const blocsCorpus = {};
for (const b of corpus()) blocsCorpus[b.id] = b.texte;

let ids = Object.keys(manifeste.blocs);
if (valeur('--ids')) {
  const voulu = valeur('--ids').split(',').filter(Boolean);
  ids = ids.filter((id) => voulu.includes(id));
}
if (!ids.length) {
  console.error('Aucun bloc à contrôler (manifeste vide ? --ids inconnu ?).');
  process.exit(1);
}

// un bloc du corpus absent du manifeste n'a PAS de fichier : le site lira ses
// histoires à la synthèse — le signaler tout de suite, pas en silence
const pasEnregistres = Object.keys(blocsCorpus).filter((id) => !manifeste.blocs[id]);
if (pasEnregistres.length) {
  console.error('⚠ ' + pasEnregistres.length + ' bloc(s) du corpus ne sont pas encore enregistrés');
  console.error('  (' + pasEnregistres.slice(0, 5).join(', ') + (pasEnregistres.length > 5 ? ', …' : '') + ')');
  console.error('  → node tools/build-voix.mjs pour les générer, puis relancer ce contrôle.');
}

if (!existe('ffprobe') || !existe('ffmpeg')) {
  console.error('ffmpeg/ffprobe introuvables — brew install ffmpeg');
  process.exit(1);
}
const sttActif = !drapeau('--sans-stt');
if (sttActif && !existe('whisper')) {
  console.error('whisper introuvable (pip3 install -U openai-whisper).');
  console.error('Pour les filets mécaniques seulement : --sans-stt');
  process.exit(1);
}

let cache = {};
try { cache = JSON.parse(readFileSync(cheminCache, 'utf8')); } catch (e) { /* premier passage */ }

console.log('Contrôle de ' + ids.length + ' clips…');
const bilans = [];
const aTranscrire = [];
for (const id of ids) {
  const bloc = manifeste.blocs[id];
  const chemin = dossierAudio + bloc.fichier;
  const bilan = { id: id, texte: bloc.texte, fichier: bloc.fichier, raisons: [], score: null };
  bilans.push(bilan);
  if (!existsSync(chemin)) { bilan.raisons.push('fichier manquant'); continue; }
  if (blocsCorpus[id] === undefined) bilan.raisons.push('bloc absent du corpus (fantôme ?)');
  else if (blocsCorpus[id] !== bloc.texte) bilan.raisons.push('texte du manifeste ≠ corpus (régénérer)');

  // filet 1 : durée plausible pour la longueur du texte
  let duree;
  try { duree = dureeDe(chemin); } catch (e) { bilan.raisons.push('mp3 illisible (ffprobe)'); continue; }
  bilan.duree = duree;
  if (!(duree > 0.4)) bilan.raisons.push('durée quasi nulle');
  if (duree > 30) bilan.raisons.push('durée aberrante (' + duree.toFixed(1) + ' s)');
  const cps = bloc.texte.length / duree; // vitesse de parole ≈ 10–20 caractères/s
  bilan.cps = cps;
  if (bloc.texte.length > 25) {
    if (cps > 22) bilan.raisons.push('trop court pour son texte (' + cps.toFixed(0) + ' car/s) — texte coupé ?');
    if (cps < 7) bilan.raisons.push('trop long pour son texte (' + cps.toFixed(0) + ' car/s) — blanc ou redite ?');
  }

  // filet 2 : blancs au milieu, silence de fin
  const plages = silencesDe(chemin, duree);
  for (const [s, e] of plages) {
    if (s > 0.3 && e < duree - 0.2) {
      bilan.raisons.push('blanc de ' + (e - s).toFixed(1) + ' s au milieu (à ' + s.toFixed(1) + ' s)');
    }
  }
  const fin = plages.length && plages[plages.length - 1][1] >= duree - 0.05
    ? duree - plages[plages.length - 1][0] : 0;
  bilan.silenceFin = Math.max(0, Math.min(fin, duree));

  // filet 3 : la ré-écoute automatique (transcription à comparer + horodatage
  // des mots — les entrées de cache sans `mots` datent d'avant, on les refait)
  if (sttActif) {
    const h = hashFichier(chemin);
    bilan.hash = h;
    const connu = cache[id];
    if (connu && connu.hash === h && connu.mots) {
      bilan.entendu = connu.entendu;
      bilan.mots = connu.mots;
    } else {
      aTranscrire.push({ id: id, chemin: chemin });
    }
  }
}

if (aTranscrire.length) {
  console.log('Transcription de ' + aTranscrire.length + ' clips (whisper --model ' + MODELE +
    ', les autres viennent du cache)…');
  const tmp = mkdtempSync(join(tmpdir(), 'controle-voix-'));
  const res = spawnSync('whisper', [
    ...aTranscrire.map((t) => t.chemin),
    '--model', MODELE, '--language', 'French', '--task', 'transcribe',
    '--output_format', 'json', '--word_timestamps', 'True',
    '--output_dir', tmp, '--verbose', 'False', '--fp16', 'False',
  ], { encoding: 'utf8', stdio: ['ignore', 'inherit', 'inherit'] });
  if (res.status !== 0) {
    console.error('whisper a échoué — réessayer, ou --sans-stt pour les filets mécaniques.');
    process.exit(1);
  }
  for (const t of aTranscrire) {
    const base = t.chemin.split('/').pop().replace(/\.mp3$/, '');
    const fjson = join(tmp, base + '.json');
    let entendu = '';
    let mots = [];
    if (existsSync(fjson)) {
      const data = JSON.parse(readFileSync(fjson, 'utf8'));
      entendu = String(data.text || '').replace(/\s+/g, ' ').trim();
      (data.segments || []).forEach((seg, si) => {
        for (const w of seg.words || []) mots.push([w.word, w.start, w.end, si]);
      });
    }
    const bilan = bilans.find((b) => b.id === t.id);
    bilan.entendu = entendu;
    bilan.mots = mots;
    cache[t.id] = { hash: bilan.hash, entendu: entendu, mots: mots };
  }
  rmSync(tmp, { recursive: true, force: true });
  writeFileSync(cheminCache, JSON.stringify(cache, null, 1) + '\n');
}

if (sttActif) {
  for (const b of bilans) {
    if (b.entendu === undefined) continue;
    const attendu = normaliser(b.texte);
    const entendu = normaliser(b.entendu);
    b.score = ressemblance(attendu, entendu);
    if (b.score < SEUIL) {
      b.raisons.push('la ré-écoute entend autre chose (score ' + b.score.toFixed(2) + ')');
    }
    const rep = begaiement(entendu, attendu);
    if (rep) b.raisons.push('bégaiement possible : « ' + rep + ' » entendu deux fois de suite');
    for (const p of pausesSuspectes(b.mots || [])) b.raisons.push(p);
  }
}

// ------------------------------------------------------------------ la sortie
const suspects = bilans.filter((b) => b.raisons.length);
bilans.sort((a, b) => (a.score === null ? 1 : a.score) - (b.score === null ? 1 : b.score));

const finMoy = bilans.filter((b) => b.silenceFin !== undefined);
if (finMoy.length) {
  const moy = finMoy.reduce((n, b) => n + b.silenceFin, 0) / finMoy.length;
  console.log('\nSilence de fin moyen gravé dans les clips : ' + (moy * 1000).toFixed(0) +
    ' ms (repère pour les pauses entre blocs).');
}

console.log('\n' + suspects.length + ' clip(s) à réécouter sur ' + bilans.length + ' :\n');
for (const b of bilans) {
  if (!b.raisons.length) continue;
  console.log('  ✗ ' + b.id + (b.score !== null ? ' (score ' + b.score.toFixed(2) + ')' : ''));
  for (const r of b.raisons) console.log('      – ' + r);
  if (b.entendu !== undefined) {
    console.log('      attendu : ' + b.texte);
    console.log('      entendu : ' + b.entendu);
  }
}

// La page de triage : seulement les suspects, avec lecteur + commande --only.
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const lignes = bilans.filter((b) => b.raisons.length).map((b) =>
  '<div class="bloc"><h2>' + esc(b.id) +
  (b.score !== null ? ' <span class="score">score ' + b.score.toFixed(2) + '</span>' : '') + '</h2>' +
  '<audio controls preload="none" src="../assets/audio/' + esc(b.fichier) + '?v=' + esc(b.hash || '0') + '"></audio>' +
  '<ul>' + b.raisons.map((r) => '<li>' + esc(r) + '</li>').join('') + '</ul>' +
  '<p><strong>Attendu :</strong> ' + esc(b.texte) + '</p>' +
  (b.entendu !== undefined ? '<p><strong>Entendu :</strong> ' + esc(b.entendu) + '</p>' : '') +
  '<code>node tools/build-voix.mjs --only ' + esc(b.id) + ' --calme</code></div>').join('\n');
writeFileSync(racine + 'tools/controle.html',
  '<!doctype html><meta charset="utf-8"><title>Clips à réécouter</title>\n' +
  '<style>body{font-family:system-ui;max-width:760px;margin:2rem auto;padding:0 1rem;' +
  'background:#0b1020;color:#e9edf8}h2{font-size:1rem;color:#ffcf5c;margin:1.6em 0 .2em}' +
  '.score{color:#ff8899;font-weight:normal}audio{width:100%}ul{margin:.3em 0;color:#ffb0b0}' +
  'p{margin:.3em 0;color:#9aa5c3}code{display:block;margin:.4em 0;padding:.35em .5em;' +
  'background:#141b33;border-radius:6px;color:#8fd3ff;user-select:all}</style>\n' +
  '<h1>' + suspects.length + ' clip(s) à réécouter (sur ' + bilans.length + ')</h1>\n' +
  '<p>Servir le dépôt (python3 -m http.server) et ouvrir /tools/controle.html.<br>' +
  'Un clip signalé n’est pas forcément raté : écouter, et re-tirer avec la commande sous le clip.</p>\n' +
  (lignes || '<p>Rien à signaler — tout est bon à l’oreille de la machine 🎉</p>') + '\n');

console.log('\nPage de triage : tools/controle.html (servir le dépôt puis ouvrir /tools/controle.html)');
if (suspects.length) {
  console.log('Re-tirer les suspects un par un après écoute :');
  console.log('  node tools/build-voix.mjs --only <id>   puis relancer ce contrôle (cache : seuls');
  console.log('  les fichiers refaits sont re-transcrits).');
  process.exit(1);
}
console.log('Rien à signaler : les ' + bilans.length + ' clips passent tous les filets.');
}
