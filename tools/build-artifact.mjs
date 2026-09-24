// Construit l'artifact de test familial : UNE page auto-contenue, à publier
// telle quelle sur claude.ai (outil Artifact, même URL à chaque itération —
// voir CLAUDE.md). Zéro fichier à côté : sur claude.ai, un `fetch` du
// manifeste ou d'un mp3 échoue en silence et le site retombe sur la synthèse
// (leçon du 24 sept. 2026 : trois versions publiées « en fichiers séparés »,
// voix robotique pour toute la famille).
//
//   node tools/build-artifact.mjs            # écrit tools/artifact.html (gitignoré)
//   node tools/build-artifact.mjs <sortie>   # ailleurs
//
// Ce qui entre dans la page : le CSS et la police Baloo 2 (data URI), le JS
// bundlé en un seul script (esbuild via npx, rien à installer), le manifeste
// avec chaque mp3 en data URI dans window.__VOIX_MANIFESTE (main.js le lit
// avant de tenter le réseau). Ce qui n'y entre pas : js/mesure.js — un test en
// famille n'est pas une visite.

import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const racine = fileURLToPath(new URL('..', import.meta.url));
const sortie = process.argv[2] || racine + 'tools/artifact.html';

let html = readFileSync(racine + 'index.html', 'utf8');

// -- css + police --
let css = readFileSync(racine + 'css/style.css', 'utf8');
const police = readFileSync(racine + 'assets/fonts/baloo2-latin.woff2').toString('base64');
css = css.replace('../assets/fonts/baloo2-latin.woff2', 'data:font/woff2;base64,' + police);
html = html.replace('<link rel="stylesheet" href="css/style.css">', '<style>\n' + css + '\n</style>');

// -- manifeste + sons --
const manifeste = JSON.parse(readFileSync(racine + 'assets/audio/manifest.json', 'utf8'));
for (const bloc of Object.values(manifeste.blocs)) {
  const mp3 = readFileSync(racine + 'assets/audio/' + bloc.fichier).toString('base64');
  bloc.fichier = 'data:audio/mpeg;base64,' + mp3;
}

// -- js bundlé --
const bundle = sortie + '.bundle.js';
execSync('npx --yes esbuild ' + racine + 'js/main.js --bundle --format=iife --outfile=' + bundle
  + ' --log-level=warning', { stdio: 'inherit' });
const js = readFileSync(bundle, 'utf8');
unlinkSync(bundle);
html = html.replace('<script type="module" src="js/main.js"></script>',
  '<script>window.__VOIX_MANIFESTE=' + JSON.stringify(manifeste) + ';</script>\n'
  + '<script>\n' + js + '\n</script>');
html = html.replace(/\s*<script src="js\/mesure\.js" defer><\/script>/, '');

// -- garde-fou : plus aucune référence externe --
if (/(src|href)="(js|css|assets)\//.test(html)) {
  throw new Error('il reste une référence à un fichier du site — la page ne serait pas autonome');
}
writeFileSync(sortie, html);
console.log('écrit ' + sortie + ' (' + Math.round(html.length / 1024) + ' ko, '
  + Object.keys(manifeste.blocs).length + ' clips embarqués)');
