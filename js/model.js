// Modèle horaire pur de « La Terre tourne » — aucun accès DOM, testable sous Node.
//
// Convention du site (la plus simple pour une enfant de 5 ans) :
// - l'horloge de référence est l'heure de la FRANCE en HIVER (UTC+1) — l'heure d'été
//   est expliquée dans la « note aux parents », pas simulée ;
// - modèle « jour d'équinoxe » : partout sur Terre, le soleil se lève à 6 h et se couche
//   à 18 h en HEURE SOLAIRE locale (heure solaire = UTC + longitude/15). Les horloges
//   civiles, elles, affichent l'heure du fuseau (décalage entier du lieu) ;
// - la Terre tourne vers l'est : vue du pôle Nord, elle tourne dans le sens inverse des
//   aiguilles d'une montre ; le soleil se lève donc d'abord à l'est (Bali), puis en
//   France, puis à l'ouest (Guadeloupe).

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

// Les trois lieux du récit, d'ouest en est. Longitudes réelles (positives vers l'est) :
// Pointe-à-Pitre ≈ 61,5° O, Paris ≈ 2,35° E, Denpasar (Bali) ≈ 115,2° E.
// Décalages : Guadeloupe UTC−4 toute l'année, France UTC+1 (hiver), Bali UTC+8 toute l'année.
export const PLACES = [
  { id: 'guadeloupe', name: 'Guadeloupe', emoji: '🏝️', lonDeg: -61.5, latDeg: 16.25,
    utcOffset: -4, color: '#46c2a5', scene: 'plage' },
  { id: 'france', name: 'France', emoji: '🏠', lonDeg: 2.35, latDeg: 46.5,
    utcOffset: 1, color: '#ff6b9d', scene: 'ville', home: true },
  { id: 'bali', name: 'Bali', emoji: '🌺', lonDeg: 115.2, latDeg: -8.6,
    utcOffset: 8, color: '#a98bff', scene: 'temple' },
];

export const HOME = PLACES[1]; // la France : « chez nous », centre du récit
export const GREENWICH_LON = 0; // méridien zéro — la France est 1 h en avance dessus (hiver)

export function wrap24(h) { return ((h % 24) + 24) % 24; }
export function wrapLon(lon) { return ((lon + 180) % 360 + 360) % 360 - 180; }

// Heure UTC (non repliée) à partir de l'heure affichée en France.
export function utcHours(homeH) { return homeH - HOME.utcOffset; }

// Horloge civile d'un lieu : heure locale dans [0, 24) et décalage de jour par rapport
// au jour en cours en France (−1 = « encore hier », +1 = « déjà demain »).
export function localClock(homeH, place) {
  const raw = utcHours(homeH) + place.utcOffset;
  const dayShift = Math.floor(raw / 24);
  return { hours: raw - dayShift * 24, dayShift: dayShift };
}

// Heure solaire locale : midi solaire quand le lieu fait exactement face au Soleil.
export function solarHours(homeH, lonDeg) {
  return wrap24(utcHours(homeH) + lonDeg / 15);
}

// Hauteur du soleil normalisée dans [−1, 1] (équinoxe) : 0 au lever (6 h solaire) et au
// coucher (18 h), 1 à midi solaire, −1 à minuit solaire.
export function sunAltitude(solarH) {
  return Math.sin(Math.PI * (solarH - 6) / 12);
}

// État du ciel, en bandes simples autour du lever (6 h) et du coucher (18 h) solaires.
export function skyState(solarH) {
  if (solarH < 5.25 || solarH >= 18.75) return 'night';
  if (solarH < 6.75) return 'dawn';
  if (solarH < 17.25) return 'day';
  return 'dusk';
}

// Angle d'un lieu pour la vue du pôle Nord, en radians dans le sens trigonométrique
// (= vers l'est) : 0 quand le lieu fait face au Soleil (midi solaire), +π/2 au coucher.
export function placeAngle(homeH, lonDeg) {
  return (solarHours(homeH, lonDeg) - 12) / 24 * TAU;
}

// Longitude du point « soleil au zénith » (il est midi solaire pile sur ce méridien).
// Elle diminue de 15° par heure : le jour balaie la carte d'est en ouest.
export function subsolarLon(homeH) {
  return wrapLon((12 - utcHours(homeH)) * 15);
}

// Cadrage de la caméra du globe 3D quand on vole vers un lieu — pur, testé.
// Le lieu est aussi centré que possible, mais l'angle entre le centre de la
// vue et le point face au Soleil reste borné :
// - au moins CAM_OFF_NOON_MIN : on ne regarde jamais la face jour pile en
//   face (image incompréhensible : tout est éclairé alors que le Soleil est
//   dessiné sur le côté) — la limite jour/nuit reste toujours à l'écran ;
// - au plus CAM_OFF_NOON_MAX : le Soleil ne finit jamais caché derrière la
//   Terre — un lieu en pleine nuit s'affiche donc vers le bord sombre, à
//   l'opposé du Soleil, au lieu d'être centré sur un écran tout noir.
export const CAM_OFF_NOON_MIN = 50 * DEG;
export const CAM_OFF_NOON_MAX = 90 * DEG;
export function cameraFrame(homeH, lonDeg, latDeg) {
  const theta = placeAngle(homeH, lonDeg);
  const sign = theta >= 0 ? 1 : -1;
  const mag = Math.min(CAM_OFF_NOON_MAX, Math.max(CAM_OFF_NOON_MIN, Math.abs(theta)));
  return {
    yaw: -Math.PI / 2 - sign * mag,
    pitch: Math.max(-50 * DEG, Math.min(50 * DEG, latDeg * DEG * 0.7)),
  };
}

// Heure de France à laquelle le soleil se lève / se couche à la longitude donnée.
export function sunriseHomeH(lonDeg) { return wrap24(6 - lonDeg / 15 + HOME.utcOffset); }
export function sunsetHomeH(lonDeg) { return wrap24(18 - lonDeg / 15 + HOME.utcOffset); }

// Heure « horloge » lisible : arrondit à la minute, avec retenue (23 h 59,6 → 0 h 00).
export function formatHM(hours) {
  const total = Math.round(wrap24(hours) * 60) % (24 * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return { h: h, m: m, text: h + ' h ' + (m < 10 ? '0' + m : String(m)) };
}

// Mot d'accompagnement de l'heure, à hauteur d'enfant.
export function periodWord(hours) {
  const c = formatHM(hours);
  if (c.h === 12 && c.m === 0) return 'midi !';
  if (c.h === 0 && c.m === 0) return 'minuit !';
  if (c.h < 6) return 'la nuit';
  if (c.h < 12) return 'le matin';
  if (c.h < 18) return 'l’après-midi';
  if (c.h < 22) return 'le soir';
  return 'la nuit';
}

// Ce que font (à peu près) les enfants à cette heure-là — pour les vignettes.
const ACTIVITIES = [
  { until: 6, emoji: '😴', text: 'On dort profondément' },
  { until: 8, emoji: '🥐', text: 'On se réveille, petit-déjeuner !' },
  { until: 12, emoji: '🎨', text: 'On joue, on apprend' },
  { until: 14, emoji: '🍽️', text: 'On déjeune' },
  { until: 17, emoji: '⚽', text: 'On joue dehors' },
  { until: 19, emoji: '🛁', text: 'C’est l’heure du bain' },
  { until: 20.5, emoji: '🍲', text: 'On dîne' },
  { until: 22, emoji: '📖', text: 'Une histoire… et au lit' },
  { until: 24, emoji: '😴', text: 'On dort profondément' },
];
export function activityFor(localHours) {
  const h = wrap24(localHours);
  for (let i = 0; i < ACTIVITIES.length; i++) {
    if (h < ACTIVITIES[i].until) return ACTIVITIES[i];
  }
  return ACTIVITIES[ACTIVITIES.length - 1];
}

export function dayBadge(dayShift) {
  if (dayShift > 0) return 'déjà demain !';
  if (dayShift < 0) return 'encore hier !';
  return '';
}

// Les morceaux d'une phrase de lieu, partagés entre la version écrite
// (bulles) et la version orale (conteur) pour qu'elles ne divergent jamais.
function phraseBits(homeH, place) {
  const c = localClock(homeH, place);
  const s = skyState(solarHours(homeH, place.lonDeg));
  const skyTxt = s === 'dawn' ? 'le soleil se lève' : s === 'day' ? 'le soleil brille'
    : s === 'dusk' ? 'le soleil se couche' : 'il fait nuit';
  const act = activityFor(c.hours);
  const actTxt = act.text.charAt(0).toLowerCase() + act.text.slice(1);
  return { clock: c, skyTxt: skyTxt, act: act, actTxt: actTxt };
}

// Une phrase courte sur un lieu à cet instant, à lire à voix haute : l'heure,
// l'état du ciel, l'activité — et le report de jour s'il y en a un. Quand le
// lieu vit sur le même fuseau que la France (sameAsHome), on ne répète pas
// l'heure platement : on célèbre la coïncidence.
export function placePhrase(homeH, place, sameAsHome) {
  const b = phraseBits(homeH, place);
  const hm = formatHM(b.clock.hours);
  if (sameAsHome) {
    return 'C’est la même heure que chez nous — il est aussi ' + hm.text + ' : ' +
      b.skyTxt + ', ' + b.actTxt + ' ' + b.act.emoji + '.';
  }
  let txt = 'Il est ' + hm.text + ' : ' + b.skyTxt + ', ' + b.actTxt + ' ' + b.act.emoji;
  if (b.clock.dayShift > 0) txt += ' — et c’est déjà demain !';
  else if (b.clock.dayShift < 0) txt += ' — et là-bas, on est encore hier !';
  else txt += '.';
  return txt;
}

// « à Paris », « en France », « au Portugal », « aux Fidji »… — le lieu avec
// sa préposition française, pour les phrases dites à voix haute. Règle
// simple : les villes et les îles prennent « à » (avec l'article soudé :
// « au Caire », « aux Marquises »), les pays féminins ou commençant par une
// voyelle « en », les autres « au » — plus les exceptions du répertoire.
const LOCATIVE_SPECIAL = {
  'Mexique': 'au ', 'Mozambique': 'au ', 'Cambodge': 'au ', 'Zimbabwe': 'au ',
  'Belize': 'au ', 'Suriname': 'au ', 'Honduras': 'au ', 'Laos': 'au ',
  'États-Unis': 'aux ', 'Pays-Bas': 'aux ', 'Philippines': 'aux ',
  'Fidji': 'aux ', 'Comores': 'aux ', 'Seychelles': 'aux ', 'Maldives': 'aux ',
  'Bahamas': 'aux ', 'Samoa': 'aux ', 'Tonga': 'aux ', 'Kiribati': 'aux ',
  'Cuba': 'à ', 'Madagascar': 'à ', 'Malte': 'à ', 'Chypre': 'à ',
  'Bahreïn': 'à ', 'Djibouti': 'à ', 'Singapour': 'à ', 'Oman': 'à ',
  'Monaco': 'à ', 'Dominique': 'à la ', 'Barbade': 'à la ',
  'Corée du Nord': 'en ', 'Corée du Sud': 'en ', 'Afrique du Sud': 'en ',
  'Guadeloupe': 'en ', 'Martinique': 'en ',
  'Polynésie française': 'en ', 'Nouvelle-Calédonie': 'en ',
};
export function placeLocative(place) {
  const name = place.name;
  if (LOCATIVE_SPECIAL[name]) return LOCATIVE_SPECIAL[name] + name;
  if (name.indexOf('Les ') === 0) return 'aux ' + name.slice(4);
  if (name.indexOf('Le ') === 0) return 'au ' + name.slice(3);
  if (place.pays) {
    if (/^[AEIOUÉÈÊÎÏÔ]/.test(name) || /e$/.test(name)) return 'en ' + name;
    return 'au ' + name;
  }
  return 'à ' + name; // villes et îles : « à Paris », « à Bali », « à La Réunion »
}

// L'écart d'heures avec chez nous, en toutes lettres (pour le cadre du globe).
export function offsetDiffText(place) {
  const d = place.utcOffset - HOME.utcOffset;
  if (d === 0) return 'la même heure que chez nous !';
  const a = Math.abs(d);
  const hh = Math.floor(a);
  const mm = Math.round((a - hh) * 60);
  const fmt = hh + ' h' + (mm ? ' ' + (mm < 10 ? '0' + mm : mm) : '');
  return d > 0 ? fmt + ' d’avance sur nous' : fmt + ' de retard sur nous';
}

// ------------------------------------------------------- la voix du conteur
// Les textes dits à voix haute, purs et partagés entre le site (js/main.js),
// l'outil de génération ElevenLabs (tools/voix-lib.mjs) et les tests — la
// voix enregistrée ne doit jamais dire autre chose que ce que le site raconte.

// les émojis sont imprononçables
export const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu;

// Texte oral : émojis retirés, « 7 h 00 » → « 7 heures » et « 6 h 30 » →
// « 6 heures 30 » (l'heure écrite se lit mal par certaines voix), guillemets
// français retirés et tirets cadratins changés en virgules (la synthèse
// trébuche dessus), espaces recollés devant la ponctuation — un « . » isolé se
// fait lire « point » — et le point orphelin d'un émoji retiré après « ! »
// disparaît (« petit-déjeuner ! 🥐. » doit finir sur le « ! »).
export function texteOral(t) {
  return t.replace(EMOJI_RE, '')
    .replace(/[«»]/g, ' ')
    .replace(/\s+—\s+/g, ', ')
    .replace(/(\d+)\s*h\s*00\b/g, '$1 h')
    .replace(/(\d+)\s*h\s+(\d+)/g, '$1 heures $2')
    .replace(/(\d+)\s*h\b/g, '$1 heures')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,…])/g, '$1')
    .replace(/([!?…])\s*\./g, '$1')
    .trim();
}

// L'heure en mots pour l'oreille : « minuit » et « midi » plutôt que
// « 0 h 00 » et « 12 h 00 ». Avec approx (le scénario « le soleil se lève
// là-bas », dont les minutes dépendent de la longitude, continue), l'oral
// s'arrondit à la demi-heure SUPÉRIEURE et l'assume : « presque 7 h 30 » —
// jamais une heure déjà passée, jamais un mensonge. L'écran garde la minute.
export function heureOrale(hours, approx) {
  const c = formatHM(hours);
  let total = c.h * 60 + c.m;
  let presque = false;
  if (approx) {
    const up = Math.ceil(total / 30) * 30;
    presque = up !== total;
    total = up % (24 * 60);
  }
  const h = Math.floor(total / 60);
  const m = total % 60;
  const mot = (h === 0 && m === 0) ? 'minuit' : (h === 12 && m === 0) ? 'midi'
    : m === 0 ? h + ' h' : h + ' h ' + (m < 10 ? '0' + m : String(m));
  return { mot: mot, presque: presque };
}

// La phrase de lieu version conteur : mêmes morceaux que placePhrase (ciel,
// activité, report de jour), mais l'heure passe par heureOrale et l'émoji
// d'activité, imprononçable, n'y entre jamais.
export function placePhraseOrale(homeH, place, sameAsHome, approx) {
  const b = phraseBits(homeH, place);
  const t = heureOrale(b.clock.hours, approx);
  const est = (t.presque ? 'presque ' : '') + t.mot;
  if (sameAsHome) {
    return 'C’est la même heure que chez nous — il est aussi ' + est + ' : ' +
      b.skyTxt + ', ' + b.actTxt + '.';
  }
  let txt = 'Il est ' + est + ' : ' + b.skyTxt + ', ' + b.actTxt;
  if (b.clock.dayShift > 0) txt += ' — et c’est déjà demain !';
  else if (b.clock.dayShift < 0) txt += ' — et là-bas, on est encore hier !';
  else txt += '.';
  return txt;
}

// Les enchaînements du conteur. Pour un lieu des « idées de voyage » (puces),
// la transition le nomme ; pour les ~560 autres lieux du répertoire, le
// conteur dit « là-bas » — l'écran montre déjà le nom et le drapeau, et c'est
// ce qui permet à la voix enregistrée de couvrir TOUT le répertoire sans
// enregistrer 560 noms.
export const VOIX_CHEZ_NOUS = 'Chez nous…';
export const VOIX_AILLEURS = 'Et pendant ce temps, là-bas…';
export function voixTransition(place) {
  return 'Et pendant ce temps, ' + placeLocative(place) + '…';
}

// Identifiant de fichier en kebab-case pour un nom de lieu (« La Réunion » →
// la-reunion) — pour les transitions enregistrées des puces.
export function slugLieu(name) {
  return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Identifiant stable d'une phrase générée : préfixe lisible + empreinte
// courte du texte (djb2) — deux textes différents donnent deux blocs (donc
// deux fichiers) différents, et un texte inchangé garde son id.
export function idBloc(prefix, texte) {
  let h = 5381;
  for (let i = 0; i < texte.length; i++) {
    h = ((h * 33) ^ texte.charCodeAt(i)) >>> 0;
  }
  return prefix + '-' + h.toString(36);
}

// Les blocs parlés d'un scénario, dans l'ordre du récit — LA source commune
// du site, de l'outil de génération et des tests. `estPuce` : le lieu fait
// partie des idées de voyage (sa transition nommée est enregistrée). Les
// pauses courtes (120 ms) suivent les annonces : leurs mp3 finissent déjà
// sur la suspension du « … », la respiration pleine ferait un long blanc.
export function blocsScenario(scn, atH, place, estPuce) {
  const approx = !!scn.sunriseAt;
  const same = place.utcOffset === HOME.utcOffset;
  const blocs = [{ id: 'voix-chez-nous', texte: VOIX_CHEZ_NOUS, pause: 120 }];
  if (scn.france) {
    blocs.push({ id: 'scn-' + scn.id + '-france', texte: scn.france });
  } else {
    const t = placePhraseOrale(atH, HOME, false, approx);
    blocs.push({ id: idBloc('phrase', t), texte: t });
  }
  if (estPuce) {
    blocs.push({ id: 'trans-' + slugLieu(place.name), texte: voixTransition(place), pause: 120 });
  } else {
    blocs.push({ id: 'trans-ailleurs', texte: VOIX_AILLEURS, pause: 120 });
  }
  // le préfixe « phrase » ne porte ni le scénario ni le rôle (France ou
  // destination) : la même phrase, où qu'elle se dise, est le même bloc —
  // donc un seul fichier enregistré
  const d = placePhraseOrale(atH, place, same, approx);
  blocs.push({ id: idBloc('phrase', d), texte: d });
  return blocs;
}

// Les boutons-scénarios : la Terre tourne en douceur jusqu'au moment choisi,
// puis on raconte la France (texte fixe) et le lieu choisi (phrase générée).
// Le dernier scénario est dynamique : le lever du soleil chez l'invité.
export const SCENARIOS = [
  { id: 'reveil', emoji: '☀️', label: 'Quand je me réveille', sub: '7 h chez nous', homeH: 7,
    france: 'Debout ! Il est 7 h du matin, le soleil se lève.' },
  { id: 'midi', emoji: '🥖', label: 'Quand je déjeune', sub: 'midi chez nous', homeH: 12,
    france: 'Il est midi pile : à table ! Le soleil est tout en haut.' },
  { id: 'dodo', emoji: '🌙', label: 'Quand je vais au dodo', sub: '20 h chez nous', homeH: 20,
    france: 'Il est 8 h du soir : un bisou, et au dodo !' },
  { id: 'lever-la-bas', emoji: '🌅', label: 'Le soleil se lève là-bas', sub: 'chez l’invité',
    sunriseAt: true, france: null },
];
