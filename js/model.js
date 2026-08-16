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

// Une phrase courte sur un lieu à cet instant, à lire à voix haute : l'heure,
// l'état du ciel, l'activité — et le report de jour s'il y en a un.
export function placePhrase(homeH, place) {
  const c = localClock(homeH, place);
  const hm = formatHM(c.hours);
  const s = skyState(solarHours(homeH, place.lonDeg));
  const skyTxt = s === 'dawn' ? 'le soleil se lève' : s === 'day' ? 'le soleil brille'
    : s === 'dusk' ? 'le soleil se couche' : 'il fait nuit';
  const act = activityFor(c.hours);
  const actTxt = act.text.charAt(0).toLowerCase() + act.text.slice(1);
  let txt = 'Il est ' + hm.text + ' : ' + skyTxt + ', ' + actTxt + ' ' + act.emoji;
  if (c.dayShift > 0) txt += ' — et c’est déjà demain !';
  else if (c.dayShift < 0) txt += ' — et là-bas, on est encore hier !';
  else txt += '.';
  return txt;
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
