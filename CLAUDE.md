# Quelle heure est-il là-bas ? — contexte projet

Épisode 3 du « Petit labo d'astronomie » : site statique d'une page qui explique les fuseaux
horaires à une enfant de 5 ans (le parent lit à voix haute). Français uniquement. Le dépôt
garde son nom de travail `la-terre-tourne` (le refrain de la série) ; le titre affiché est
« Quelle heure est-il là-bas ? ». L'épisode 1 fait référence pour l'identité visuelle et le
niveau d'exigence : <https://github.com/davidb-prog/eclipse-explorer>. L'épisode 2
(« Où va le Soleil la nuit ? », lever/coucher) est en ligne :
<https://davidb-prog.github.io/ou-va-le-soleil/> (dépôt
<https://github.com/davidb-prog/ou-va-le-soleil>).

## Contraintes

- **Zéro dépendance, zéro build** : HTML + CSS + JS vanilla (modules ES), canvas 2D / SVG
  maison. Ça doit rester ouvrable avec `python3 -m http.server` et déployable tel quel sur
  GitHub Pages. Aucune tuile ni bibliothèque cartographique : la géographie vient de Natural
  Earth 110m, **précompilée** dans `js/geo.js` (fichier GÉNÉRÉ, ne pas éditer à la main —
  script de génération dans le scratchpad des sessions : `build-geo.mjs`).
- **Compat mobiles anciens** : pas d'optional chaining `?.` ni de nullish `??` ; pas de
  lookbehind dans les regex ; repli `@supports` pour `aspect-ratio` ; `top/right/bottom/left`
  plutôt que `inset` ; préfixer `-webkit-backdrop-filter` et `-webkit-transform` ;
  `touch-action: none` sur les canvas interactifs ; tester à 390 px de large.
- `js/model.js` est **pur** (aucun accès DOM) et doit le rester : il se teste avec
  `node test/model.test.mjs`. Toutes les constantes de lieux et de décalages vivent dedans —
  ne jamais les recopier ailleurs. Même règle pour `js/geo.js` (contours lon/lat purs) et
  `js/places.js` (répertoire de recherche) : testés par `node test/geo.test.mjs`.
- **Honnêteté pédagogique.** Conventions assumées du site : heure d'hiver (France UTC+1) et
  jour d'équinoxe (lever 6 h / coucher 18 h en heure solaire). Toute nouvelle simplification se
  documente dans la « note aux parents » (index.html) et dans « Ce que le site simplifie »
  (README). Vérités à préserver, couvertes par les tests : la Terre tourne vers l'est → levers
  dans l'ordre Bali → France → Guadeloupe ; 12 h en France = 7 h en Guadeloupe et 19 h à Bali ;
  20 h en France = 3 h **le lendemain** à Bali ; lever du soleil à Bali ≈ coucher en Guadeloupe
  (12 h d'écart entre elles) ; à 12 h 00 légales, le midi solaire est à 15° Est (la France vit
  à l'heure de Berlin) — le halo doré de la carte est centré sur le **vrai** midi solaire.
- **Invariants d'interaction** (voulus par l'utilisateur, vérifiés par les tests) :
  choisir une destination ne change **jamais** l'heure — son point pulse sur la vue du pôle et
  la caméra du globe 3D vole vers le lieu ; sur le globe 3D, le Soleil est fixe à l'écran
  entre deux sélections, posé sur l'axe horizontal ; le cadrage est **borné** par
  `cameraFrame` (model.js) à 50°–90° du midi solaire — donc **jamais la face jour pile en
  face** (la limite jour/nuit reste toujours à l'écran) et **jamais le Soleil caché derrière
  la Terre** après un recadrage (un lieu en pleine nuit s'affiche vers le bord sombre) ; le
  Soleil ne passe derrière la Terre que fugitivement, pendant un vol de caméra qui contourne
  par la face nuit (epsilon 0,02 sur sun[1] : sin(π) ≈ 1e-16 ne doit pas le classer
  « derrière ») ; glisser tourne la Terre (l'heure change — rotatif sur la vue du pôle,
  horizontal sur le globe et la carte), jamais la caméra ; **pincer à deux doigts** (tactile)
  zoome les deux vues du jeu **sans jamais changer l'heure ni sélectionner de pays** — globe :
  seul le rayon grossit (`globe3d.zoom`, borné 1–2,6, le Soleil sort du cadre en s'approchant) ;
  carte : zoom autour des doigts + promenade à deux doigts (`map.zoom`/`panX`/`panY`, borné
  1–3, pan borné au cadre), textes/points/icônes à taille d'écran constante (`fixed` dans
  MapView), le glisser-heure à un doigt divisé par le zoom.
- Boucle rAF résiliente (`try/finally`), `prefers-reduced-motion` respecté (pas de rotation
  automatique), aria-labels sur tous les canvas.

## Structure

- `index.html` — page unique, organisée comme l'épisode 2 : grille principale avec la colonne
  « chez nous » d'abord (`.home-col` : deux cartes-horloges France + destination, puis
  recherche `search-panel` + 9 puces), et à droite le panneau `pole-panel` « 🚀 Depuis
  l'espace » (**Terre vue du pôle Nord** `pole-view` dans `.globe-stage`, cadre des deux
  heures) ; barre d'heures collante `sticky-times` (troisième jumeau du cadre, `aria-hidden`,
  mobile seulement) ; frise du temps pleine largeur (`time-panel`, curseur 0–24 h) ; scénarios +
  histoire (bouton 🔇/🔊 `btn-scn-voice` de version sonore) ; boîte « Pourquoi les fuseaux
  horaires ? » à écouter (menu de voix ; `<details>` `explain-fold`, **repliée sur mobile
  ≤ 640 px** — le résumé ne s'affiche qu'en mobile et duplique le h2 de `.explain-head`,
  chacun masqué à l'autre taille ; main.js la garde ouverte sur ordinateur) ;
  **jeu** « Amuse-toi à trouver l'heure… »
  (`.game-head` puis `.game-grid` : globe 3D avec les 2 boutons de lieux 🏠 chez nous /
  destination **incrustés dans son ciel, sous la Terre** (toutes tailles ; `width:
  max-content` sinon l'absolu `left:50%` replie les boutons), carte à plat avec sa recherche
  jumelle et les 9 idées répliquées (masquées sur mobile), et le bloc `.game-side` — le cadre
  jumeau `-globe` seul. Côte à côte dès 961 px avec `.game-side` sous le globe ; sur mobile
  l'ordre (par `order` CSS) est globe → cadre → carte, les deux vues tiennent sur un écran,
  et titre + recherche de la carte passent sous elle. Pas de plein écran) ; note aux parents
- `css/style.css` — thème sombre de la série ; sur la vue du pôle, le cadre des heures est
  incrusté (il se range dessous en **mobile ≤ 640 px**) ; dans le jeu (`.game-grid`), le cadre
  et les boutons de lieux sont **toujours** rangés sous le globe, à toutes les tailles — rien
  ne mord sur les vues ; section « lisibilité mobile » **en fin de feuille** (planchers
  ≥ ~12,5 px : hints des titres de canvas sur leur ligne, graduation du curseur, cadre des
  heures, sous-titres de scénarios — en fin de feuille exprès : à spécificité égale, elle doit
  passer après les tailles de base)
- `js/model.js` — logique horaire pure (lieux, horloges locales, report de jour, heure solaire,
  hauteur du soleil, scénarios et phrases générées — dont le cas « même fuseau que la
  France » —, écarts en toutes lettres, prépositions de lieu `placeLocative`, cadrage caméra
  borné `cameraFrame`)
- `js/geo.js` — GÉNÉRÉ : ~177 pays Natural Earth 110m avec ISO (~10 700 points), lacs, glaces
  (AQ/GL), arc des Antilles et petites îles (`SPECKS` : Bali, La Réunion, Tahiti…) à la main
- `js/places.js` — répertoire hors-ligne (≈ 220 lieux `{n, c|pays, q, iso, lat, lon, tz}`,
  décalages standard, demi-fuseaux gérés ; les pays multi-fuseaux portent l'heure de leur
  capitale — documenté note aux parents + README), `searchPlaces` (accents ignorés), drapeaux
  émoji (avec repli 📍 dans main.js quand l'OS ne les rend pas — Windows — détecté par
  **mesure de largeur** : la paire 🇹🇭 se ligature en un glyphe si les drapeaux existent ;
  surtout pas un test de couleur, les lettres de Windows sont en couleur aussi), `DECOR`
  (9 villes toujours dessinées — la nuit, elles s'allument)
- `js/views.js` — `MapView` (planisphère : bandes UTC étiquetées, halo doré du midi solaire,
  nuit qui balaie, Greenwich sous UTC, hitTest), `PoleView` (la **vue principale** : Terre vue
  du pôle Nord, 24 tranches tournantes, moitié nuit fixe, Soleil à droite rapproché si la
  largeur manque, lieux sur leurs cercles, pulsation à la sélection, `layout` pour le glisser
  rotatif), `SkyView` (ciels des vignettes), `buildClock` (horloge SVG), helpers (`fitCanvas`,
  `label`, `pointInRing`…)
- `js/view3d.js` — `Globe3D` : projection orthographique maison, polygones découpés à l'horizon
  et recousus au limbe, nuit en calottes à seuils, Soleil ancré sur l'axe horizontal (côté
  lumière, hystérésis à ±0,05 sur cos ; le rendu « derrière la Terre, rayons qui frôlent » ne
  sert plus que pendant les vols de caméra), mode **compact** sous 520 px de canvas (Terre à
  0,315 au lieu de 0,28 du côté court, Soleil rapproché), villes-décor allumées la nuit,
  hitTest inverse — pas de lib 3D, c'est voulu
- `js/main.js` — boucle d'animation, curseur, glissers (vue du pôle : rotatif = changer
  l'heure ; globe : H = tourner la Terre, V = pencher, clic = choisir ; carte : H = changer
  l'heure, clic = choisir ; globe et carte : pince à deux doigts = zoomer, via `makePinch` —
  suivi des pointeurs tactiles, neutralise glisser et clic pendant la pince),
  `centerCameraOn` + `flyCameraTo` (vol animé vers le cadrage
  `cameraFrame`, contournement par la face nuit si le Soleil change de côté, saut sec en
  `prefers-reduced-motion`), boutons de lieux (🏠 chez nous / destination à son nom),
  recherche jumelle, scénarios (le scénario actif `activeScn` se rejoue quand la destination
  change : l'histoire suit sans re-clic ; il s'efface dès qu'on reprend la main), cadres
  jumeaux (`''`/`-globe`/`-sticky` — la barre collante mobile apparaît quand les
  cartes-horloges sortent de l'écran par le haut, `IntersectionObserver` avec garde : sans
  lui elle reste masquée ; même garde `matchMedia` pour replier `explain-fold` sur mobile et
  le rouvrir sur ordinateur), et le **conteur** `narrator` : un seul moteur de synthèse vocale
  (score des voix françaises, ton conteur phrase à phrase, menu 🗣, choix retenu en
  localStorage) partagé entre l'histoire des fuseaux et la **version sonore des scénarios**
  (bouton 🔇/🔊, choix retenu ; on ne lit pas les bulles telles quelles — enchaînements
  « Chez nous… / Et pendant ce temps, [préposition `placeLocative`] … » ajoutés à l'oral,
  émojis retirés, espace recollé avant le point final sinon lu « point »)
- `test/model.test.mjs` — 63 vérifications ; `test/geo.test.mjs` — 25 vérifications

## Vérification navigateur

Suite Playwright maintenue dans le scratchpad des sessions (`test-site.js` : desktop +
mouvement réduit + mobile 390 px, structure de la page — heures chez nous/là-bas d'abord puis
« Depuis l'espace », recherche dans la colonne des cartes, frise pleine largeur, jeu côte à
côte sur ordinateur —, glisser rotatif du disque (quart de tour ≈ 6 h), sélection sans
changer l'heure, boutons de lieux, bascule 🔇/🔊 des scénarios, sondes de pixels sur le
Soleil et le croissant de nuit — jamais de « plein jour » plein cadre, Soleil jamais coincé
derrière la Terre, entier même rapproché sur mobile —, zéro erreur console). Le zoom à deux
doigts a sa suite dédiée (`test-pinch.js` : touches synthétisées par CDP
`Input.dispatchTouchEvent`, pince/dépince sur les deux vues du jeu, heure et destination
inchangées, retour exact à la vue de départ, glissers à un doigt intacts, souris intacte). Lancer les
serveurs avant : `python3 -m http.server 8123` sur le site. Chromium : `chromium.launch()`
avec repli `executablePath: '/opt/pw-browsers/chromium'`.

## Conventions

- Textes UI et commentaires en français ; apostrophe typographique « ' » dans les chaînes UI.
- Commits conventionnels (`feat:`, `fix:`, `docs:`…).
- Public : 5 ans. Phrases courtes que le parent lit à voix haute, gros visuels, pas de jargon —
  le vocabulaire technique va dans la note aux parents ou le README. « UTC » n'apparaît côté
  enfant que sur la carte à plat, expliqué dans le titre du panneau.
