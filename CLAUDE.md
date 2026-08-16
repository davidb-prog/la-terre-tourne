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
  choisir une destination ne change **jamais** l'heure — seule la caméra se recale ; le Soleil
  est fixe à l'écran entre deux sélections, posé sur l'axe horizontal, et **passe derrière la
  Terre** quand on regarde la face nuit (epsilon 0,02 sur sun[1] : sin(π) ≈ 1e-16 ne doit pas
  le classer « derrière ») ; glisser horizontalement tourne la Terre (l'heure change), jamais
  la caméra.
- Boucle rAF résiliente (`try/finally`), `prefers-reduced-motion` respecté (pas de rotation
  automatique), aria-labels sur tous les canvas.

## Structure

- `index.html` — page unique : en-tête, panneau globe (recherche + 9 puces, globe 3D dans
  `.globe-stage` avec cadre des deux heures et 3 pastilles de vue, curseur 0–24 h), deux
  cartes-horloges (France + destination), scénarios + histoire, boîte « Pourquoi les fuseaux
  horaires ? » à écouter (menu de voix), carte à plat (recherche jumelle, cadre jumeau, bouton
  lecture jumeau), note aux parents
- `css/style.css` — thème sombre de la série ; **bascule mobile ≤ 640 px** : le cadre et les
  pastilles quittent l'incrustation et se rangent sous le globe (idem pour le cadre de la
  carte) ; en plein écran mobile (repli `.fs-fallback`, le cas réel iOS), la scène ne s'étire
  pas et les suggestions s'effacent
- `js/model.js` — logique horaire pure (lieux, horloges locales, report de jour, heure solaire,
  hauteur du soleil, scénarios et phrases générées, écarts en toutes lettres)
- `js/geo.js` — GÉNÉRÉ : ~177 pays Natural Earth 110m avec ISO (~10 700 points), lacs, glaces
  (AQ/GL), arc des Antilles et petites îles (`SPECKS` : Bali, La Réunion, Tahiti…) à la main
- `js/places.js` — répertoire hors-ligne (≈ 220 lieux `{n, c|pays, q, iso, lat, lon, tz}`,
  décalages standard, demi-fuseaux gérés), `searchPlaces` (accents ignorés), drapeaux émoji,
  `DECOR` (9 villes toujours dessinées — la nuit, elles s'allument)
- `js/views.js` — `MapView` (planisphère : bandes UTC étiquetées, halo doré du midi solaire,
  nuit qui balaie, Greenwich sous UTC, hitTest), `SkyView` (ciels des vignettes), `buildClock`
  (horloge SVG), helpers (`fitCanvas`, `label`, `pointInRing`…)
- `js/view3d.js` — `Globe3D` : projection orthographique maison, polygones découpés à l'horizon
  et recousus au limbe, nuit en calottes à seuils, Soleil ancré sur l'axe horizontal (côté
  lumière, hystérésis à ±0,05 sur cos ; derrière la Terre côté nuit, rayons qui frôlent),
  villes-décor allumées la nuit, hitTest inverse — pas de lib 3D, c'est voulu
- `js/main.js` — boucle d'animation, curseur, glissers (globe : H = tourner la Terre,
  V = pencher ; carte : H = changer l'heure ; clic = choisir), `centerCameraOn` (recadrage sec
  à la sélection, biais ≤ 42° vers le Soleil si la destination est en pleine nuit), pastilles
  de vue (📍/🌗/☀️), recherche jumelle, scénarios, cadres jumeaux, plein écran, synthèse
  vocale (score des voix françaises, ton conteur phrase à phrase, menu 🗣, choix retenu en
  localStorage)
- `test/model.test.mjs` — 51 vérifications ; `test/geo.test.mjs` — 25 vérifications

## Vérification navigateur

Suite Playwright maintenue dans le scratchpad des sessions (`test-site.js`, ~60 vérifications :
desktop + mobile 390 px, sélection sans bouger la Terre, cadres jumeaux, pastilles, halo de
midi et position du Soleil par sondes de pixels, plein écran natif **et** repli iOS, zéro
erreur console). Lancer les serveurs avant : `python3 -m http.server 8123` sur le site.
Chromium : `chromium.launch()` avec repli `executablePath: '/opt/pw-browsers/chromium'`.

## Conventions

- Textes UI et commentaires en français ; apostrophe typographique « ' » dans les chaînes UI.
- Commits conventionnels (`feat:`, `fix:`, `docs:`…).
- Public : 5 ans. Phrases courtes que le parent lit à voix haute, gros visuels, pas de jargon —
  le vocabulaire technique va dans la note aux parents ou le README. « UTC » n'apparaît côté
  enfant que sur la carte à plat, expliqué dans le titre du panneau.
