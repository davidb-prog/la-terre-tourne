# Quelle heure est-il là-bas ? 🌍

Épisode 3 du **Petit labo d'astronomie** : un site d'une page, interactif, pour expliquer les
fuseaux horaires à une enfant de 5 ans, guidée par un parent qui lit à voix haute.

- La **Terre tourne sur elle-même en 24 heures** ; le Soleil, fixe, n'éclaire qu'un côté à la fois ;
- donc **il n'est pas la même heure partout** — la **France** (« chez nous ») se compare en direct
  avec une **destination** au choix : cherche une ville ou un pays, ou clique-le sur les cartes ;
- la Terre tourne vers l'est : le soleil se lève d'abord à Bali, puis en France, puis en Guadeloupe ;
- et quand c'est le soir chez nous, à Bali… **c'est déjà demain**.

*(Le dépôt garde son nom de travail `la-terre-tourne` — c'est le refrain de la série — comme
`eclipse-explorer` affiche « La mécanique des éclipses ».)*

![Capture d'écran du site : le globe 3D, le cadre des deux heures et les cartes-horloges](docs/screenshot.png)

## Fonctionnalités

- **Le globe en 3D** : la Terre avec ses vrais continents et les frontières des ~180 pays
  (Natural Earth, embarqué dans `js/geo.js` — aucune tuile, aucune bibliothèque), la France
  surlignée en rose, la destination en doré, les 24 fuseaux en tranches, l'équateur et le
  méridien de Greenwich. Projection orthographique maison en canvas 2D, comme la vue 3D de
  l'épisode 1 : toujours zéro dépendance.
- **On attrape la Terre** : glisser horizontalement la fait tourner (l'heure change, le Soleil
  ne bouge pas), glisser verticalement la penche. Un clic sur un pays ou une ville-décor en
  fait la destination observée.
- **Le Soleil reste à sa place.** Il se pose sur l'axe horizontal, du côté d'où vient la
  lumière, ses rayons vers la Terre. Et quand la face qu'on regarde est la face nuit, il ne
  fait pas semblant de l'éclairer : il **passe derrière la Terre**, à moitié caché, ses rayons
  frôlent le globe, la mention « il éclaire l'autre côté ! » s'affiche — et les villes de la
  face nuit **allument leurs petites lumières**.

![La face nuit : Bali au centre, le Soleil passé derrière la Terre](docs/screenshot-3d.png)

- **Choisir une destination ne fait pas bouger la Terre** : les horloges ne bronchent pas d'une
  seconde, c'est la caméra qui se recale d'un coup autour du nouveau lieu (en gardant toujours
  un croissant de jour et la limite jour/nuit à l'écran). Trois **pastilles de vue** sous le
  globe : 📍 *ma destination*, 🌗 *lever/coucher* (le Soleil entier sur le côté), ☀️ *plein
  jour* (la face éclairée bien en face) — la caméra pivote, l'heure ne change jamais.
- **La recherche fonctionne sans Internet** : ≈ 220 villes et pays embarqués (accents ignorés,
  demi-fuseaux compris — cherche l'Inde !), 9 idées de voyage prêtes à cliquer (Guadeloupe,
  Bali, Tahiti, Tokyo…). Deux moteurs synchronisés, sur le globe et sur la carte à plat.
- **Le cadre des deux heures**, posé sur le globe et répliqué sur la carte : l'heure en France,
  l'heure là-bas, et l'écart en toutes lettres (« 8 h d'avance sur nous »).
- **Deux cartes-horloges** (France + destination) : horloge analogique, grosse heure digitale,
  mot-repère (« midi ! », « la nuit »…), activité du moment, badge « **déjà demain !** » /
  « **encore hier !** », et le ciel local dessiné en continu — nuit étoilée, aube rose, grand
  jour, coucher orangé.
- **Grand curseur 0–24 h** (l'heure en France) : sa piste raconte elle-même la journée. La
  Terre peut aussi tourner toute seule (un tour en 80 s), boutons lecture/pause jumeaux sur le
  globe et sur la carte.
- **Quatre boutons-scénarios** : « Quand je me réveille (7 h) », « Quand je déjeune (midi) »,
  « Quand je vais au dodo (20 h) », « Le soleil se lève là-bas ». La Terre tourne en douceur —
  toujours vers l'est, son vrai sens ! — puis une petite histoire compare la France et la
  destination.
- **La carte du monde à plat** (mêmes contours que le globe) : les 24 fuseaux en bandes
  étiquetées **par leur décalage UTC** (−11 … UTC … +11), la nuit qui balaie la carte d'est en
  ouest, un **halo doré** centré sur le vrai midi solaire, « Greenwich » écrit sous « UTC »,
  soleil « il est midi ici » et lune « il est minuit ici ». Glisser change l'heure, cliquer
  choisit la destination.

![La carte à plat : bandes UTC, halo doré de midi, cadre des deux heures](docs/screenshot-map.png)

- **« Pourquoi les fuseaux horaires ? »** : la petite histoire des 24 tranches d'orange, à lire
  ou à **écouter** — la synthèse vocale du navigateur la raconte phrase à phrase, sur un ton de
  conteur (pauses, exclamations, suspens). Le site choisit d'office la voix française la plus
  naturelle de l'appareil, un menu 🗣 permet d'en changer (choix retenu), et un conseil
  s'affiche quand l'appareil n'a que des voix robotiques.
- **Plein écran** du globe (API native, repli maison pour iOS), et une mise en page mobile
  dédiée : sous 640 px, le cadre des heures et les pastilles se rangent sous le globe pour ne
  jamais le recouvrir.
- Accessible : aria-labels sur tous les canvas, `prefers-reduced-motion` respecté (rien ne
  bouge tout seul), curseur utilisable au clavier, espace = pause.

![Le site sur mobile (390 px)](docs/screenshot-mobile.png)

## Lancer en local

Aucune dépendance, aucun build. Il faut juste un petit serveur statique
(les modules ES ne se chargent pas depuis `file://`) :

```bash
python3 -m http.server 8000
# ou : npx serve
```

puis ouvrir <http://localhost:8000>.

## Tests

Le modèle horaire, la géographie et le répertoire de lieux sont purs et se testent sous Node,
sans navigateur :

```bash
node test/model.test.mjs && node test/geo.test.mjs
```

**51 vérifications horaires**, dont les données exactes du récit : 12 h en France (hiver) → 7 h
en Guadeloupe et 19 h à Bali ; l'ordre des levers de soleil Bali → France → Guadeloupe ;
l'effet « déjà demain » (20 h chez nous = 3 h le lendemain à Bali) ; « encore hier » au petit
matin ; le miroir Bali/Guadeloupe (lever sur l'une ≈ coucher sur l'autre) ; les phrases
générées des scénarios et les écarts en toutes lettres (y compris les demi-fuseaux : l'Inde a
« 4 h 30 d'avance »).

**25 vérifications géographiques** : Paris tombe dans la France surlignée, Tokyo au Japon, le
milieu du Pacifique dans l'océan, Bali/La Réunion/Tahiti ont leur île, la recherche trouve
« reunion » sans accent, chaque pays du répertoire a son polygone…

Le site est aussi vérifié en navigateur (Playwright/Chromium, desktop + mobile 390 px) : zéro
erreur de console, heures conformes sur tous les scénarios, sélection sans bouger la Terre,
cadres jumeaux, pastilles de vue, glissers, plein écran (natif **et** repli iOS), sondes de
pixels sur le halo de midi et la position du Soleil, fluidité ≥ 25 images/s.

## Déployer sur GitHub Pages

Le workflow `.github/workflows/deploy-pages.yml` publie le site à chaque push sur `main`.
Dans les réglages du repo : **Settings → Pages → Source : « GitHub Actions »**
(le workflow tente aussi de l'activer automatiquement au premier run).

## Le modèle horaire

Tout est dans [`js/model.js`](js/model.js) (aucun accès DOM, toutes les constantes des lieux) :

- **L'horloge de référence est l'heure de France** (UTC+1 en hiver) ; l'heure locale d'un lieu
  = UTC + son décalage, avec report de jour — c'est lui qui allume les badges « déjà demain » /
  « encore hier ». Les décalages en demi-heures (Inde +5 h 30, Népal +5 h 45) sont gérés.
- **L'heure solaire** d'un lieu = UTC + longitude/15 : il est midi solaire pile quand le lieu
  fait face au Soleil. C'est elle qui pilote toute la géométrie : la rotation du globe 3D, le
  point subsolaire, le terminateur et le halo de midi de la carte, la hauteur du soleil dans
  les ciels des vignettes.
- **Jour d'équinoxe** : lever à 6 h et coucher à 18 h solaires partout ;
  hauteur du soleil = sin(π · (h − 6) / 12).

## Ce que le site simplifie

- **L'heure d'été.** Le site vit en heure d'hiver (France UTC+1, écarts −5 h avec la Guadeloupe
  et +7 h avec Bali). En été, la France passe à UTC+2 et ces écarts deviennent −6 h / +6 h. Les
  villes cherchées sont aussi en heure standard, sans heure d'été.
- **Un équinoxe permanent.** Jour et nuit durent 12 h partout, le soleil se lève vers 6 h et se
  couche vers 18 h. En réalité, ça dépend de la saison et de la latitude ; le terminateur est
  donc vertical, sans courbe saisonnière.
- **Des bandes bien droites.** Les fuseaux sont dessinés en 24 tranches régulières de 15°. Les
  vraies frontières zigzaguent : des pays entiers choisissent l'heure du voisin — la France vit
  à l'heure de Berlin (UTC+1), pas à celle de Greenwich juste à côté. C'est pour ça qu'à
  12 h 00 pile, le halo doré du midi solaire est à 15° Est, un cran à l'est de la France — dès
  12 h 10, elle baigne dedans.
- **Heure civile vs heure solaire.** Les horloges affichent l'heure du fuseau, le ciel suit
  l'heure solaire (continue). D'où de petits écarts réalistes : à « midi » à l'horloge, le
  soleil n'est pas tout à fait au zénith de Paris (il y culmine vers 12 h 50 en hiver).
- **Le cadrage de la face nuit.** Quand la destination choisie dort en pleine nuit, le globe se
  cadre en la décalant un peu vers le Soleil, pour qu'un croissant de jour et la limite
  jour/nuit restent visibles — sinon l'image ne serait que du noir.
- **Les cartes** viennent de Natural Earth 110m (domaine public), simplifiées ; seules les
  frontières des pays sont tracées, pas les régions ; Bali, La Réunion, Tahiti et les Antilles
  sont redessinées à la main (trop petites pour cette résolution).
- **La voix de lecture** est celle de l'appareil (rien ne part sur Internet) : sa qualité varie
  beaucoup. Le site note les voix françaises disponibles et prend la plus naturelle ; sur
  Chrome ou Edge, ou avec une voix « améliorée » téléchargée, la lecture devient vraiment douce.
- **Un joli hasard, exact et vérifié** : Bali (UTC+8) et la Guadeloupe (UTC−4) ont 12 h d'écart
  pile — quand le soleil se lève sur l'une, il se couche sur l'autre (à ~13 min près).

## Structure

```
index.html            page unique (globe 3D, recherche, cadres, vignettes, scénarios,
                      carte à plat, boîte des fuseaux à écouter, note aux parents)
css/style.css         thème sombre de la série, responsive (bascule mobile ≤ 640 px), aucune lib
js/model.js           logique horaire pure (lieux, horloges, soleil, scénarios) — testable sous Node
js/geo.js             GÉNÉRÉ — contours lon/lat Natural Earth 110m (pays, lacs) + îles à la main
js/places.js          répertoire de recherche hors-ligne (≈ 220 lieux), drapeaux, villes-décor
js/views.js           rendus canvas/SVG maison (carte du monde, ciels, horloges)
js/view3d.js          globe 3D (projection orthographique maison, découpe à l'horizon, nuit
                      en calottes, Soleil ancré sur l'axe — derrière la Terre côté nuit)
js/main.js            boucle d'animation + interactions (curseur, glissers, sélection,
                      pastilles de vue, scénarios, plein écran, voix)
test/model.test.mjs   tests Node du modèle horaire (51 vérifications)
test/geo.test.mjs     tests Node de la géographie et de la recherche (25 vérifications)
```

## La série

1. 🌒 [La mécanique des éclipses](https://davidb-prog.github.io/eclipse-explorer/) — pourquoi la
   Lune change de forme, et les deux coïncidences qui fabriquent une éclipse.
2. 🌅 [Où va le Soleil la nuit ?](https://davidb-prog.github.io/ou-va-le-soleil/) — le Soleil
   ne bouge pas : c'est la Terre qui tourne, et la nuit c'est quand ta maison lui tourne le dos.
3. 🌍 **Quelle heure est-il là-bas ?** (ce site) — la Terre tourne, et il n'est pas la même
   heure partout.
