# La Terre tourne 🌍

Épisode 2 du **Petit labo d'astronomie** : un site d'une page, interactif, pour expliquer les
fuseaux horaires à une enfant de 5 ans, guidée par un parent qui lit à voix haute.

- La **Terre tourne sur elle-même en 24 heures** ; le Soleil, fixe, n'éclaire qu'un côté à la fois ;
- donc **il n'est pas la même heure partout** — trois « maisons » à comparer en direct :
  la **Guadeloupe** (UTC−4), la **France** (« chez nous », UTC+1 en hiver) et **Bali** (UTC+8) ;
- la Terre tourne vers l'est : le soleil se lève d'abord à **Bali**, puis en **France**, puis en
  **Guadeloupe** ;
- et quand c'est le soir chez nous, à Bali… **c'est déjà demain**.

![Capture d'écran du site](docs/screenshot.png)

## Fonctionnalités

- **La Terre vue de dessus** (depuis le pôle Nord) : moitié jour / moitié nuit fixes face au
  Soleil, lieux colorés qui défilent en tournant vers l'est, lueurs d'aube et de crépuscule au
  terminateur, méridien de Greenwich tracé, flèche du sens de rotation, 24 quartiers discrets
  (un par fuseau). **On attrape la Terre** au doigt ou au pointeur pour la faire tourner.
- **Grand curseur 0–24 h** (l'heure en France) : sa piste raconte elle-même la journée —
  nuit → aube → jour → crépuscule → nuit.
- **Trois vignettes-maisons** : horloge analogique + grosse heure digitale, mot-repère
  (« le matin », « midi ! », « la nuit »…), activité du moment (« on dort », « on joue dehors »…),
  badge « **déjà demain !** » / « **encore hier !** », et le ciel local dessiné en continu — nuit
  étoilée avec fenêtre allumée, aube rose, grand jour, coucher orangé. Plage et mer en Guadeloupe,
  tour Eiffel en France, temple à toits empilés à Bali.
- **Quatre boutons-scénarios** : « Quand je me réveille (7 h) », « Quand je déjeune (midi) »,
  « Quand je vais au dodo (20 h) », « Le soleil se lève à Bali ». La Terre tourne en douceur —
  toujours vers l'est, son vrai sens ! — jusqu'au moment choisi, puis une petite histoire raconte
  ce que font les enfants aux trois endroits.
- **Carte du monde stylisée** (continents dessinés à la main en canvas — aucune tuile, aucune
  bibliothèque) : la nuit balaie la carte d'est en ouest, un petit soleil marque « il est midi
  ici », une petite lune « il est minuit ici », limites discrètes des 24 fuseaux, méridien de
  Greenwich. Glisser horizontalement change aussi l'heure.
- **Note aux parents** : l'heure d'été, l'équinoxe permanent, les fuseaux qui zigzaguent, le
  miroir Bali/Guadeloupe, le sens de rotation.
- Accessible : aria-labels sur tous les canvas, `prefers-reduced-motion` respecté (rien ne bouge
  tout seul), curseur utilisable au clavier, espace = pause.

## Lancer en local

Aucune dépendance, aucun build. Il faut juste un petit serveur statique
(les modules ES ne se chargent pas depuis `file://`) :

```bash
python3 -m http.server 8000
# ou : npx serve
```

puis ouvrir <http://localhost:8000>.

## Tests

Le modèle horaire est pur et se teste sous Node, sans navigateur :

```bash
node test/model.test.mjs
```

46 vérifications, dont les données exactes du récit : **12 h en France (hiver) → 7 h en
Guadeloupe et 19 h à Bali** ; l'ordre des levers de soleil **Bali → France → Guadeloupe** ;
l'effet « **déjà demain** » (20 h chez nous = 3 h le lendemain à Bali) ; « encore hier » au petit
matin ; le miroir Bali/Guadeloupe (lever sur l'une ≈ coucher sur l'autre).

Le site a aussi été vérifié en navigateur (Playwright/Chromium) : zéro erreur de console, heures
affichées conformes sur tous les scénarios, glisser du globe et de la carte opérationnels, rendu
à 390 px sans débordement horizontal.

## Déployer sur GitHub Pages

Le workflow `.github/workflows/deploy-pages.yml` publie le site à chaque push sur `main`.
Dans les réglages du repo : **Settings → Pages → Source : « GitHub Actions »**
(le workflow tente aussi de l'activer automatiquement au premier run).

## Le modèle horaire

Tout est dans [`js/model.js`](js/model.js) (aucun accès DOM, toutes les constantes des lieux) :

- **Les trois lieux et leurs données réelles** : Pointe-à-Pitre ≈ 61,5° O, UTC−4 toute l'année ;
  Paris ≈ 2,35° E, UTC+1 en hiver ; Denpasar (Bali) ≈ 115,2° E, UTC+8 toute l'année.
  Écarts avec la France en hiver : Guadeloupe **−5 h**, Bali **+7 h** ; la France a **1 h
  d'avance sur le méridien de Greenwich**.
- **L'horloge de référence est l'heure de France** ; l'heure locale d'un lieu = UTC + décalage du
  fuseau, avec report de jour — c'est lui qui allume les badges « déjà demain » / « encore hier ».
- **L'heure solaire** d'un lieu = UTC + longitude/15 : il est midi solaire pile quand le lieu fait
  face au Soleil. C'est elle qui pilote toute la géométrie : angle des lieux sur le globe polaire,
  point subsolaire et terminateur sur la carte, hauteur du soleil dans les ciels des vignettes.
- **Jour d'équinoxe** : lever à 6 h et coucher à 18 h solaires partout ;
  hauteur du soleil = sin(π · (h − 6) / 12).

## Ce que le site simplifie

- **L'heure d'été.** Le site vit en heure d'hiver (France UTC+1, écarts −5 h / +7 h). En été, la
  France passe à UTC+2 et les écarts deviennent −6 h / +6 h — expliqué dans la « note aux
  parents » ; la Guadeloupe et Bali ne changent jamais d'heure.
- **Un équinoxe permanent.** Jour et nuit durent 12 h partout, le soleil se lève vers 6 h et se
  couche vers 18 h. En réalité, la durée du jour dépend de la saison et de la latitude ; le
  terminateur de la carte est donc vertical, sans courbe saisonnière.
- **Heure civile vs heure solaire.** Les horloges affichent l'heure du fuseau (décalage entier),
  le ciel suit l'heure solaire (continue). D'où de petits écarts réalistes : à « midi » à
  l'horloge, le soleil n'est pas tout à fait au zénith de Paris (il y culmine vers 12 h 50 en
  hiver) ; à l'horloge, le soleil se lève vers 6 h 51 en France, 6 h 06 en Guadeloupe, 6 h 19 à
  Bali.
- **Cartes stylisées.** Globe et planisphère sont dessinés à la main, continents très simplifiés
  « tout en rondeurs » — pour se repérer, pas pour naviguer.
- **Un joli hasard, exact et vérifié** : Bali (UTC+8) et la Guadeloupe (UTC−4) ont 12 h d'écart —
  quand le soleil se lève à Bali, il vient de se coucher en Guadeloupe (à ~13 min près), pendant
  qu'en France il est presque minuit. Le « milieu de la nuit » en Guadeloupe, c'est au réveil
  français : 7 h chez nous = 2 h du matin là-bas.

## Structure

```
index.html            page unique (globe, curseur, vignettes, scénarios, carte, note aux parents)
css/style.css         thème sombre de la série, responsive, aucune lib
js/model.js           logique horaire pure (lieux, horloges, soleil) — testable sous Node
js/views.js           rendus canvas/SVG maison (globe polaire, carte du monde, ciels, horloges)
js/main.js            boucle d'animation + interactions (curseur, glisser, scénarios)
test/model.test.mjs   tests Node du modèle
```

## La série

1. 🌒 [La mécanique des éclipses](https://davidb-prog.github.io/eclipse-explorer/) — pourquoi la
   Lune change de forme, et les deux coïncidences qui fabriquent une éclipse.
2. 🌍 **La Terre tourne** (ce site) — pourquoi il n'est pas la même heure partout.
