# La Terre tourne — contexte projet

Épisode 2 du « Petit labo d'astronomie » : site statique d'une page qui explique les fuseaux
horaires à une enfant de 5 ans (le parent lit à voix haute). Français uniquement.
L'épisode 1 fait référence pour l'identité visuelle et le niveau d'exigence :
<https://github.com/davidb-prog/eclipse-explorer>.

## Contraintes

- **Zéro dépendance, zéro build** : HTML + CSS + JS vanilla (modules ES), canvas 2D / SVG maison.
  Ça doit rester ouvrable avec `python3 -m http.server` et déployable tel quel sur GitHub Pages.
  Aucune tuile ni bibliothèque cartographique : le planisphère et le globe sont dessinés à la main
  dans `js/views.js` (polygones lissés, volontairement « tout en rondeurs »).
- **Compat mobiles anciens** : pas d'optional chaining `?.` ni de nullish `??` ; repli `@supports`
  pour `aspect-ratio` ; `top/right/bottom/left` plutôt que `inset` ; préfixer
  `-webkit-backdrop-filter` quand `backdrop-filter` est utilisé ; `touch-action: none` sur les
  canvas interactifs ; tester à 390 px de large.
- `js/model.js` est **pur** (aucun accès DOM) et doit le rester : il se teste avec
  `node test/model.test.mjs`. Toutes les constantes de lieux et de décalages vivent dedans —
  ne jamais les recopier ailleurs. Même règle pour `js/geo.js` (contours lon/lat purs, testés
  par `node test/geo.test.mjs`) : c'est la source unique de la géographie, partagée par la
  carte à plat et le globe 3D.
- **Honnêteté pédagogique.** Conventions assumées du site : heure d'hiver (France UTC+1) et jour
  d'équinoxe (lever 6 h / coucher 18 h en heure solaire). Toute nouvelle simplification se
  documente dans la « note aux parents » (index.html) et dans « Ce que le site simplifie »
  (README). Vérités à préserver, couvertes par les tests : la Terre tourne vers l'est → levers
  dans l'ordre Bali → France → Guadeloupe ; 12 h en France = 7 h en Guadeloupe et 19 h à Bali ;
  20 h en France = 3 h **le lendemain** à Bali ; lever du soleil à Bali ≈ coucher en Guadeloupe
  (12 h d'écart entre elles).
- Boucle rAF résiliente (`try/finally`), `prefers-reduced-motion` respecté (pas de rotation
  automatique), aria-labels sur tous les canvas.

## Structure

- `index.html` — page unique : histoire d'intro, globe polaire + grand curseur, trois
  vignettes-maisons, boutons-scénarios + histoire, carte du monde, note aux parents
- `css/style.css` — thème sombre de la série (palette de l'épisode 1), plus rond et plus joueur
- `js/model.js` — logique horaire pure (lieux, horloges locales, report de jour, heure solaire,
  hauteur du soleil, scénarios avec leurs phrases)
- `js/geo.js` — contours lon/lat « dessinés à la main » (continents, mers intérieures, îles,
  France avec ses frontières), partagés par la carte et le globe 3D
- `js/views.js` — rendus : globe vu du pôle Nord, planisphère stylisé, ciels des vignettes,
  horloges SVG
- `js/view3d.js` — globe 3D orbitable : projection orthographique maison, polygones découpés à
  l'horizon de la sphère et recousus au limbe, nuit en calottes à seuils — pas de lib 3D, c'est
  voulu (même esprit que la vue 3D de l'épisode 1). Glisser = orbiter (le temps ne change pas)
- `js/main.js` — boucle d'animation, curseur, glisser (globe circulaire, carte horizontale,
  orbite 3D), bascule vue de dessus / globe 3D, scénarios (rotation en douceur, vers l'est)
- `test/model.test.mjs` — tests Node du modèle (46 vérifications)
- `test/geo.test.mjs` — tests Node de la géographie (14 vérifications)

## Conventions

- Textes UI et commentaires en français ; apostrophe typographique « ’ » dans les chaînes UI.
- Commits conventionnels (`feat:`, `fix:`, `docs:`…).
- Public : 5 ans. Phrases courtes que le parent lit à voix haute, gros visuels, pas de jargon —
  le mot « fuseau horaire » n'apparaît qu'une fois côté enfant (légende de la carte), le reste
  du vocabulaire technique va dans la note aux parents ou le README.
