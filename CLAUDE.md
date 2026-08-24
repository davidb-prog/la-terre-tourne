# Quelle heure est-il là-bas ? — contexte projet

Épisode 3 du « Petit labo d'astronomie » : site statique d'une page qui explique les fuseaux
horaires à une enfant de 5 ans (le parent lit à voix haute). Français uniquement. Le dépôt
garde son nom de travail `la-terre-tourne` (le refrain de la série) ; le titre affiché est
« Quelle heure est-il là-bas ? ». L'épisode 1 fait référence pour l'identité visuelle et le
niveau d'exigence : <https://github.com/davidb-prog/eclipse-explorer>. L'épisode 2
(« Où va le Soleil la nuit ? », lever/coucher) est en ligne :
<https://petit-labo.fr/ou-va-le-soleil/> (dépôt
<https://github.com/davidb-prog/ou-va-le-soleil>). La famille est en ligne sous son domaine
**petit-labo.fr** : tous les liens croisés (pied de page, README) l'utilisent, jamais
`github.io` — même origine pour tous les épisodes, donc le réglage localStorage du conteur
se partage.

## Contraintes

- **Zéro dépendance, zéro build** : HTML + CSS + JS vanilla (modules ES), canvas 2D / SVG
  maison. Ça doit rester ouvrable avec `python3 -m http.server` et déployable tel quel sur
  GitHub Pages. Aucune tuile ni bibliothèque cartographique : la géographie vient de Natural
  Earth 110m, **précompilée** dans `js/geo.js` (fichier GÉNÉRÉ, ne pas éditer à la main —
  script de génération dans le scratchpad des sessions : `build-geo.mjs`).
- **Compat mobiles anciens** : pas d'optional chaining `?.` ni de nullish `??` ; pas de
  lookbehind dans les regex ; repli `@supports` pour `aspect-ratio` ; `top/right/bottom/left`
  plutôt que `inset` ; préfixer `-webkit-backdrop-filter` et `-webkit-transform` ;
  `touch-action: none` sur les canvas interactifs et leur cadre immédiat `.canvas-wrap`
  SEULEMENT — pas plus loin : bloquer tout `.globe-stage` interdisait de faire défiler la
  page en touchant le cadre des heures France/là-bas rangé sous le disque (payé) ; tester à
  390 px de large.
- **La page se manipule, elle ne se sélectionne pas** (verrou anti-gestes d'enfant) :
  `user-select: none` sur `body` (préfixé, + `-webkit-touch-callout: none` et
  `-webkit-tap-highlight-color: transparent` ; les `input` redeviennent sélectionnables) ;
  `* { touch-action: pan-x pan-y }` — le doigt défile mais ni pincement ni double-tap ne
  zooment la page, les `touch-action: none` des canvas, plus spécifiques, gagnent ;
  viewport `maximum-scale=1, user-scalable=no` AVEC le filet JS `gesturestart` →
  `preventDefault` (Safari iOS ignore `user-scalable` depuis iOS 10). Les zooms
  d'accessibilité du système restent utilisables — choix assumé pour un site d'enfant.
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
  seul le rayon grossit (`globe3d.zoom`, borné 1–5, le Soleil sort du cadre en s'approchant,
  l'arc des Antilles grossit avec le zoom) ;
  carte : zoom autour des doigts (`map.zoom`/`panX`/`panY`, borné 1–6, pan borné au cadre)
  puis promenade à **un ou deux doigts** — zoomée, un doigt promène la carte au lieu de
  changer l'heure, le glisser-heure revient à zoom 1 —, textes/points/icônes à taille
  d'écran constante (`fixed` dans MapView) ; un clic hors de tout polygone choisit le
  **lieu du répertoire le plus proche** (~3°, repli de `resolveHit`) — c'est ce qui rend
  cliquables la Guadeloupe, Tahiti et les petites îles `SPECKS`, sans polygone Natural
  Earth ; **double-tap sur une vue zoomée** = retour au
  zoom 1 en douceur (`makeDoubleTap`/`makeDezoom`, saut sec en mouvement réduit) — pour
  qu'il ne choisisse pas un pays au passage, la sélection au tap est différée de
  `DBL_TAP_MS` tant que la vue est zoomée (fenêtre du double-tap et délai égaux exprès) ;
  à zoom 1 la sélection reste immédiate.
- **Boutons à largeur stable** (patron de la famille) : les deux boutons ⏸/▶ jumeaux
  (`btn-spin`, `-globe` — la carte à plat a perdu le sien, demandé par David : le globe
  suffit, les deux vues tournent ensemble) et le 🔇/🔊 portent leurs deux libellés
  **empilés** (grille 1×1, `aria-pressed` montre l'un et cache l'autre) — l'ancien libellé
  « ▶ Elle tourne toute seule » changeait la largeur des boutons et décalait toute la
  page à chaque clic. Libellés harmonisés : « ⏸ Pause » / « ▶ Lecture » et
  « 🔊 avec la voix » / « 🔇 sans la voix » (`.scenario-title` garde titre et bouton sur
  UNE ligne sans repli : le texte se replie, pas le bouton ; le jumeau de voix
  `btn-scn-voice-jeu` qui vivait sur le titre du globe 3D a été retiré, demandé par
  David — voir ci-dessous, les clics du jeu ne parlent plus). Les couleurs des 4
  boutons-scénarios sont celles de la famille (reprises d'ou-va-le-soleil : matin rose,
  midi bleu, soir or, nuit violet — la classe du 4ᵉ est `scn-lever-la-bas`, l'ancienne
  `scn-bali-lever` ne s'appliquait plus). Sans moment affiché, cliquer un pays reste
  **silencieux** — le commentaire audio à chaque clic a été essayé puis retiré à la
  demande de David (la voix ne raconte que les scénarios). Un clic direct sur le globe 3D
  ou la carte à plat ne relance **jamais** la version sonore, même quand un scénario est
  affiché (`choosePlace(hit, { sansVoix: true })` : le texte de l'histoire suit la
  destination, la voix en cours se coupe au lieu de raconter l'ancienne — retiré aussi à
  la demande de David) ; la voix ne suit la destination que choisie par la recherche, les
  puces ou le ✕ d'une carte-horloge. Pied de page harmonisé (charte `docs/charte.md`
  du portail, patron repris d'ou-va-le-soleil) : ligne-titre avec l'emoji de série 🔭,
  les autres épisodes en liens cliquables (sans « La mécanique des éclipses ») portant
  chacun le **médaillon SVG de sa carte** du portail (tuile ~30 px, soulignement sur le
  titre seul), et bouton « Tous les épisodes » vers <https://petit-labo.fr/> portant la
  **fiole maître au « ? »** petites-tailles (plus d'emoji-illustration devant ces liens).
- **Marque de la famille** (charte du portail) : titres en **Baloo 2 auto-hébergée**
  (`assets/fonts/baloo2-latin.woff2`, OFL, `font-display: swap`, repli
  `"Arial Rounded MT Bold", "Trebuchet MS", system-ui` — la pile `--titres`, appliquée à
  tout ce qui titre, jamais au corps du texte ni aux boutons ; la légende de la carte à
  plat est une phrase, elle reste en pile système) ; **fiole de la série** (l'étoile
  dedans) en SVG inline ~24 px à côté du kicker centré ; le favicon reste
  l'emoji-signature 🌍 (décision de la charte).
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
  horaires ? » à écouter (`<details>` `explain-fold`, **repliée sur mobile
  ≤ 640 px** — le résumé ne s'affiche qu'en mobile et duplique le h2 de `.explain-head`,
  chacun masqué à l'autre taille ; main.js la garde ouverte sur ordinateur) ;
  **jeu** « Amuse-toi à trouver l'heure… »
  (`.game-head` — titre + consigne seuls — puis `.game-grid` : globe 3D avec ⏸/▶ dans
  son titre, les 2 boutons de lieux 🏠 chez nous /
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
  borné `cameraFrame`) + les textes du conteur (`texteOral`, `heureOrale` — minuit, midi et « une heure » en mots, minutes accolées, et
  l'arrondi assumé « presque X h 30 » du scénario du lever —, `placePhraseOrale`,
  `blocsScenario` : les blocs `{id, texte, pause}` d'un récit, ids par empreinte du texte
  `idBloc` — LA source commune du site, du corpus et des tests)
- `js/geo.js` — GÉNÉRÉ : ~177 pays Natural Earth 110m avec ISO (~10 700 points), lacs, glaces
  (AQ/GL), arc des Antilles et petites îles (`SPECKS` : Bali, La Réunion, Tahiti…) à la main
- `js/places.js` — répertoire hors-ligne (≈ 220 lieux `{n, c|pays, q, iso, lat, lon, tz}`,
  décalages standard, demi-fuseaux gérés ; les pays multi-fuseaux portent l'heure de leur
  capitale — documenté note aux parents + README), `searchPlaces` (accents ignorés), drapeaux
  émoji (avec repli 📍 dans main.js quand l'OS ne les rend pas — Windows — détecté par
  **mesure de largeur** : la paire 🇹🇭 se ligature en un glyphe si les drapeaux existent ;
  surtout pas un test de couleur, les lettres de Windows sont en couleur aussi), `DECOR`
  (9 villes toujours dessinées — la nuit, elles s'allument), `IDEES_VOYAGE` (les 9 puces,
  partagées interface/corpus vocal : seuls ces lieux ont une transition nommée enregistrée)
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
  suivi des pointeurs tactiles, neutralise glisser et clic pendant la pince — et double-tap
  = dézoomer, via `makeDoubleTap` + `makeDezoom`),
  `centerCameraOn` + `flyCameraTo` (vol animé vers le cadrage
  `cameraFrame`, contournement par la face nuit si le Soleil change de côté, saut sec en
  `prefers-reduced-motion`), boutons de lieux (🏠 chez nous / destination à son nom),
  recherche jumelle, scénarios (le scénario actif `activeScn` se rejoue quand la destination
  change : l'histoire suit sans re-clic — muette, voix coupée, si le changement vient d'un
  clic sur le globe 3D ou la carte à plat ; il s'efface dès qu'on reprend la main ; un **appui**
  sur un bouton remonte la page en douceur jusqu'à la vue du pôle — `showPoleView`, patron
  d'ou-va-le-soleil : calée sous la barre collante sur mobile, seulement si hors champ sur
  grand écran, jamais lors des rejouages automatiques pour ne pas défiler sous le doigt qui
  choisit un pays), cadres
  jumeaux (`''`/`-globe`/`-sticky` — la barre collante mobile apparaît quand les
  cartes-horloges sortent de l'écran par le haut, `IntersectionObserver` avec garde : sans
  lui elle reste masquée ; même garde `matchMedia` pour replier `explain-fold` sur mobile et
  le rouvrir sur ordinateur), et le **conteur** `narrator` (patron canonique de la famille,
  porté depuis `ou-va-le-soleil/js/main.js`) : UN seul moteur `narrate(items)`/`stop()`
  partagé entre l'histoire des fuseaux et la **version sonore des scénarios** (bouton 🔇/🔊,
  choix retenu sous la clé de famille `petit-labo-son` — l'ancienne clé `ltt-scn-voice` se
  lit en secours). Chaque bloc joue son **mp3 enregistré** si le manifeste dit qu'il porte
  encore le texte exact (`audioSrc`), sinon **synthèse** (le score des voix françaises
  choisit seul la meilleure ; le menu 🗣 d'avant la voix enregistrée a été retiré, ton
  conteur phrase à phrase conservé) — avec la règle propre à
  cet épisode : **une histoire = une voix** (un seul bloc sans fichier → tout le récit passe
  en synthèse). Un seul élément `<audio>` réutilisé (iOS rejoue sans geste), préchargement
  `fetch` du bloc suivant, pauses par bloc (120 ms après les annonces en « … »),
  `visibilitychange → stop()` (+ `pagehide` en secours). Les blocs viennent de
  `blocsScenario` (model.js) : mêmes ids et textes que le corpus et les tests ; les lieux
  hors puces s'entendent « là-bas » (`trans-ailleurs`), les 9 `IDEES_VOYAGE` (places.js) ont
  leur transition nommée
- `tools/voix-lib.mjs` — le **corpus vocal par énumération** : chaque scénario × chaque lieu
  du répertoire (+ la Guadeloupe par défaut de model.js) passe par `blocsScenario`, dédupliqué
  par id → 165 blocs, ~11 600 caractères. `tools/build-voix.mjs` — génération ElevenLabs
  HORS site (copié de l'épisode 2 : `--dry-run`, `--essai`, `--only`, manifeste idempotent) +
  les acquis de cet épisode : `--calme` (réglages posés style 0/stabilité 0,75, contexte de
  prosodie `previous_text`, diction « : » dit comme un point et heures en toutes lettres —
  pour les clips qui accrochent prise après prise ; le manifeste garde le texte officiel,
  seuls les mots PRONONCÉS doivent rester identiques), et la page d'écoute-marathon
  `tools/ecoute.html` (gitignorée, régénérée à chaque run) : lecture enchaînée des 165 clips,
  marquage 🚩 → commandes `--only … --calme`, écoute ciblée d'une fournée par `#ids=…`
  (build-voix imprime l'URL de ce qu'il vient de générer), et anti-cache `?v=` sur chaque
  mp3 — SANS lui, le navigateur ressert l'ancienne version d'un clip re-tiré (leçon payée :
  six « re-tirages ratés » qui étaient le même fichier en cache) ;
  `assets/audio/manifest.json` — les 165 blocs enregistrés (la synthèse reste le repli)
- `test/model.test.mjs` — 63 vérifications ; `test/geo.test.mjs` — 25 vérifications ;
  `test/voix.test.mjs` — 47 vérifications (textes oraux, arrondi jamais en retard, blocs,
  **couverture** : tout ce que le site peut raconter est dans le corpus, manifeste ↔ site)

## La voix enregistrée (ElevenLabs)

Le conteur peut jouer des **mp3 commités** dans `assets/audio/` au lieu de la synthèse. La
référence de la famille est le skill `petit-labo` (references/voix-enregistree.md) et son
compagnon `generer-voix-petit-labo` ; règles dures :

- **Le site reste 100 % statique** : génération HORS site par `tools/build-voix.mjs`
  (Node ≥ 18, zéro dépendance, `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` en variables
  d'environnement — jamais commitées, jamais côté site). Modèle `eleven_multilingual_v2`,
  sortie 64 kb/s.
- **La clé API vit sur la machine de David**, JAMAIS dans un cloud environment
  (`api.elevenlabs.io` y est bloqué par le réseau). Un seul rangement : le fichier gitignoré
  `.cle-elevenlabs` (chmod 600) à la racine du dépôt — jamais collée dans une conversation.
  La génération se fait en local ; depuis le cloud on prépare corpus et outillage, puis on
  passe la main.
- **La voix enregistrée ne ment jamais** : le manifeste stocke le texte oral exact de chaque
  bloc, `audioSrc` ne joue un mp3 que si son texte correspond ENCORE, `node test/voix.test.mjs`
  échoue si un texte a changé sans régénération — et la **couverture par énumération** (propre
  à cet épisode : les histoires sont générées) garantit qu'aucune combinaison scénario × lieu
  ne manque au corpus. Corollaire : **tout changement des phrases de `model.js` ou des textes
  parlés d'`index.html` invalide des blocs** — re-passer par `--dry-run` et régénérer avant de
  committer.
- **Une histoire = une voix** : un bloc manquant fait passer tout le récit en synthèse (règle
  d'oreille, dans `narrate` de main.js) — ne pas « optimiser » en mélangeant.
- **Figer les textes avant d'enregistrer**, valider à l'écoute (`tools/ecoute.html`,
  gitignoré), puis UN seul commit d'`assets/audio/` (mp3 + manifeste) — l'audio commité ne se
  delta-compresse pas, chaque régénération commitée est un blob mort à vie.
- **La revue des ~165 clips ne se fait pas à l'oreille un par un** :
  `node tools/controle-voix.mjs` (local, comme build-voix — prérequis `brew install ffmpeg`
  et `pip3 install -U openai-whisper`) vérifie chaque mp3 mécaniquement (durée plausible
  pour son texte, blancs au milieu, silence de fin mesuré) puis le transcrit (Whisper,
  horodatage des mots) et compare au texte du manifeste (normalisation « 7 h 30 » ↔ « sept
  heures trente », seuil 0,82, détecteur de bégaiement : n-gramme doublé dans l'entendu,
  absent de l'attendu, blancs ≥ 0,8 s en pleine phrase et mots étirés — calibré voix de
  conteur : pauses inter-segments et bords de clip exclus, l'oreille reste la référence) ; il écrit `tools/controle.html` (gitignoré) avec SEULEMENT les suspects — lecteur,
  attendu/entendu, commande `--only` prête. Cache par empreinte de fichier
  (`tools/controle-cache.json`, gitignoré) : après un re-tirage, seul le fichier refait est
  re-transcrit. Un clip signalé n'est pas forcément raté — c'est la courte liste de
  réécoute ; l'oreille reste juge en dernier ressort.

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
