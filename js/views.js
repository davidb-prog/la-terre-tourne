// Rendus canvas et SVG : globe vu du pôle Nord, carte du monde stylisée,
// ciels des vignettes, horloges analogiques. Tout est dessiné à la main —
// aucune tuile externe, aucune bibliothèque.

import { TAU, DEG, PLACES, GREENWICH_LON, placeAngle, subsolarLon, solarHours,
         sunAltitude, wrapLon, wrap24, utcHours } from './model.js';
import { COUNTRIES, LAKES, ICE_ISOS, FRANCE_ISO, ANTILLES, SPECKS } from './geo.js';
import { DECOR } from './places.js';

const COL = {
  bg: '#070b17',
  sunCore: '#fff7d6', sun: '#ffcf5c', sunDeep: '#ff9f1c',
  oceanHi: '#7db9f7', ocean: '#4a90e0', oceanLo: '#2f6cb8',
  night: 'rgba(8, 17, 42, 0.82)',
  land: '#4fc79f', landEdge: 'rgba(16, 60, 48, 0.4)',
  ice: '#cfdff0',
  silhouette: '#0a0f22',
};

export function fitCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const bw = Math.max(1, Math.round(w * dpr)), bh = Math.max(1, Math.round(h * dpr));
  if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx: ctx, w: w, h: h };
}

// Convention mathématique : angles trigonométriques (sens inverse des aiguilles
// d'une montre, comme la Terre vue du pôle Nord), y d'écran inversé.
const pt = (cx, cy, r, a) => [cx + r * Math.cos(a), cy - r * Math.sin(a)];

export function drawStars(view, ctx, w, h, count) {
  const key = w + 'x' + h;
  if (view._starKey !== key) {
    view._starKey = key;
    view._stars = Array.from({ length: count }, () =>
      [Math.random() * w, Math.random() * h, Math.random() * 1.1 + 0.3, Math.random() * 0.5 + 0.15]);
  }
  ctx.fillStyle = '#fff';
  for (const [x, y, r, a] of view._stars) {
    ctx.globalAlpha = a;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Texte avec halo sombre : lisible sur le jour comme sur la nuit.
// `clampW`/`clampH` : garde le texte à l'intérieur du canvas (mesure réelle).
export function label(ctx, text, x, y, opts) {
  const o = opts || {};
  const size = o.size || 11;
  const weight = o.weight || 700;
  const align = o.align || 'left';
  ctx.font = weight + ' ' + size + 'px system-ui, sans-serif';
  if (o.clampW) {
    const tw = ctx.measureText(text).width;
    if (align === 'left') x = Math.min(x, o.clampW - tw - 5);
    else if (align === 'right') x = Math.max(x, tw + 5);
    else x = Math.max(tw / 2 + 5, Math.min(x, o.clampW - tw / 2 - 5));
  }
  if (o.clampH) y = Math.max(size * 0.7 + 3, Math.min(y, o.clampH - size * 0.7 - 3));
  ctx.textAlign = align;
  ctx.textBaseline = o.baseline || 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(7, 11, 23, 0.85)';
  ctx.lineWidth = Math.max(3, size * 0.3);
  ctx.globalAlpha = o.alpha === undefined ? 1 : o.alpha;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = o.color || 'rgba(205, 215, 240, 0.9)';
  ctx.fillText(text, x, y);
  ctx.globalAlpha = 1;
}

function mixHex(h1, h2, t) {
  const p = (h, i) => parseInt(h.substr(i, 2), 16);
  const r = Math.round(p(h1, 1) + (p(h2, 1) - p(h1, 1)) * t);
  const g = Math.round(p(h1, 3) + (p(h2, 3) - p(h1, 3)) * t);
  const b = Math.round(p(h1, 5) + (p(h2, 5) - p(h1, 5)) * t);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (t) => { const u = clamp01(t); return u * u * (3 - 2 * u); };

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Chemin fermé « tout en rondeurs » : courbes quadratiques par les milieux.
function smoothPath(ctx, pts) {
  const n = pts.length;
  const mx = (a, b) => (a[0] + b[0]) / 2, my = (a, b) => (a[1] + b[1]) / 2;
  ctx.beginPath();
  ctx.moveTo(mx(pts[n - 1], pts[0]), my(pts[n - 1], pts[0]));
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    ctx.quadraticCurveTo(p[0], p[1], mx(p, q), my(p, q));
  }
  ctx.closePath();
}

// ------------------------------------------------------------------ Vue polaire
// La Terre vue du pôle Nord. Le Soleil est fixe à droite ; la moitié éclairée ne
// bouge pas, ce sont les lieux qui défilent dedans en tournant vers l'est (sens
// trigonométrique). Crépuscule en haut, aube en bas.
export class PolarView {
  constructor(canvas) { this.canvas = canvas; this.layout = null; }

  draw(homeH) {
    const { ctx, w, h } = fitCanvas(this.canvas);
    ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, w, h);
    drawStars(this, ctx, w, h, 130);

    const S = Math.min(w, h);
    const cx = 0.37 * w, cy = 0.5 * h, R = 0.315 * S;
    this.layout = { cx: cx, cy: cy, R: R };
    const thetaG = placeAngle(homeH, GREENWICH_LON); // azimut du méridien de Greenwich

    // le Soleil, à moitié hors du cadre : il est loin, à droite
    const sunX = w + 0.02 * S, sunR = 0.11 * S;
    const glow = ctx.createRadialGradient(sunX, cy, 2, sunX, cy, sunR * 2.6);
    glow.addColorStop(0, COL.sunCore); glow.addColorStop(0.32, COL.sun);
    glow.addColorStop(0.62, 'rgba(255, 159, 28, 0.25)'); glow.addColorStop(1, 'rgba(255, 159, 28, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(sunX, cy, sunR * 2.6, 0, TAU); ctx.fill();
    label(ctx, 'le Soleil', w - 10, cy - sunR * 2.1, { align: 'right', alpha: 0.8, size: 12, color: COL.sun });

    // rayons parallèles, flèches vers la Terre
    ctx.strokeStyle = 'rgba(255, 207, 92, 0.5)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    const xs = sunX - sunR * 2.15, xe = cx + R + 16;
    for (const dy of [-0.55 * R, 0, 0.55 * R]) {
      const y = cy + dy;
      if (xs > xe + 14) {
        ctx.beginPath(); ctx.moveTo(xs, y); ctx.lineTo(xe, y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(xe, y); ctx.lineTo(xe + 7, y - 4);
        ctx.moveTo(xe, y); ctx.lineTo(xe + 7, y + 4); ctx.stroke();
      }
    }

    // l'océan (côté jour), puis tout ce qui tourne avec la Terre
    const oc = ctx.createRadialGradient(cx - 0.35 * R, cy - 0.35 * R, 0.15 * R, cx, cy, R);
    oc.addColorStop(0, COL.oceanHi); oc.addColorStop(1, COL.ocean);
    ctx.fillStyle = oc;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();

    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();

    // 24 quartiers discrets : un par fuseau, ils tournent avec la Terre
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)'; ctx.lineWidth = 1;
    for (let k = 0; k < 24; k++) {
      const a = thetaG + k * 15 * DEG;
      const [x1, y1] = pt(cx, cy, 0.22 * R, a);
      const [x2, y2] = pt(cx, cy, R, a);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }

    // quelques nuages accrochés à la Terre : on la voit tourner
    const CLOUDS = [[0.45, 0.52, 0.16], [1.35, 0.74, 0.11], [2.3, 0.38, 0.13],
      [3.1, 0.62, 0.1], [3.95, 0.82, 0.12], [4.9, 0.5, 0.14], [5.7, 0.68, 0.09]];
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    for (const [phi, rr, s] of CLOUDS) {
      const [bx, by] = pt(cx, cy, rr * R, thetaG + phi);
      ctx.beginPath(); ctx.arc(bx, by, s * R, 0, TAU);
      ctx.arc(bx + s * R * 0.8, by + s * R * 0.25, s * R * 0.7, 0, TAU);
      ctx.fill();
    }

    // la nuit : moitié opposée au Soleil, avec un bord tout doux (le crépuscule)
    const ng = ctx.createLinearGradient(cx - R, 0, cx + R, 0);
    ng.addColorStop(0, COL.night); ng.addColorStop(0.42, COL.night);
    ng.addColorStop(0.58, 'rgba(8, 17, 42, 0)'); ng.addColorStop(1, 'rgba(8, 17, 42, 0)');
    ctx.fillStyle = ng;
    ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);

    // lueurs chaudes là où le soleil se couche (en haut) et se lève (en bas)
    for (const sy of [cy - R, cy + R]) {
      const wg = ctx.createRadialGradient(cx, sy, 1, cx, sy, 0.36 * R);
      wg.addColorStop(0, 'rgba(255, 145, 60, 0.38)'); wg.addColorStop(1, 'rgba(255, 145, 60, 0)');
      ctx.fillStyle = wg;
      ctx.beginPath(); ctx.arc(cx, sy, 0.36 * R, 0, TAU); ctx.fill();
    }

    // jour / nuit en toutes lettres
    label(ctx, 'jour', cx + 0.5 * R, cy - 0.12 * R,
      { align: 'center', size: Math.round(0.11 * R), color: 'rgba(255, 255, 255, 0.5)' });
    label(ctx, 'nuit', cx - 0.5 * R, cy - 0.12 * R,
      { align: 'center', size: Math.round(0.11 * R), color: 'rgba(157, 185, 255, 0.55)' });

    // flèche du sens de rotation, à l'intérieur du disque
    const arcR = 0.66 * R, a0 = -62 * DEG, a1 = -24 * DEG;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(cx, cy, arcR, -a0, -a1, true); ctx.stroke();
    const [hx, hy] = pt(cx, cy, arcR, a1);
    const tx = -Math.sin(a1), ty = -Math.cos(a1); // tangente (sens trigonométrique, y écran)
    ctx.beginPath();
    ctx.moveTo(hx, hy); ctx.lineTo(hx - 9 * tx + 4.5 * ty, hy - 9 * ty - 4.5 * tx);
    ctx.moveTo(hx, hy); ctx.lineTo(hx - 9 * tx - 4.5 * ty, hy - 9 * ty + 4.5 * tx);
    ctx.stroke();

    ctx.restore();

    // l'étiquette de la flèche, hors du clip : sur petit écran elle déborde
    // légèrement du disque au lieu d'être coupée
    label(ctx, 'elle tourne dans ce sens', cx + 0.26 * R, cy + 0.74 * R,
      { align: 'center', size: 10.5, alpha: 0.75, clampW: w, clampH: h });

    // méridien de Greenwich (pointillé) — la France est juste à côté, alors
    // l'étiquette se pose au milieu de la ligne pour ne pas la gêner
    ctx.setLineDash([5, 6]); ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)'; ctx.lineWidth = 1.5;
    const [gx, gy] = pt(cx, cy, R, thetaG);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(gx, gy); ctx.stroke();
    ctx.setLineDash([]);
    const [glx, gly] = pt(cx, cy, 0.52 * R, thetaG);
    label(ctx, 'Greenwich', glx, gly - 9,
      { align: 'center', alpha: 0.55, size: 9.5, weight: 400, clampW: w, clampH: h });

    // pôle Nord au centre
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, TAU); ctx.fill();
    label(ctx, 'pôle Nord', cx, cy + 13, { align: 'center', alpha: 0.5, size: 9.5, weight: 400 });

    // contour de la Terre
    ctx.strokeStyle = 'rgba(150, 180, 240, 0.4)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();

    // les trois maisons
    for (const p of PLACES) {
      const th = placeAngle(homeH, p.lonDeg);
      const [dx, dy] = pt(cx, cy, 0.93 * R, th);
      const day = Math.cos(th) > 0;
      ctx.save();
      if (day) { ctx.shadowColor = p.color; ctx.shadowBlur = 10; }
      ctx.beginPath(); ctx.arc(dx, dy, 7, 0, TAU);
      ctx.fillStyle = p.color; ctx.fill();
      ctx.restore();
      ctx.beginPath(); ctx.arc(dx, dy, 7, 0, TAU);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)'; ctx.lineWidth = 2; ctx.stroke();
      const [lx, ly] = pt(cx, cy, R + 16, th);
      const c = Math.cos(th);
      label(ctx, p.name, lx, ly,
        { align: c > 0.35 ? 'left' : c < -0.35 ? 'right' : 'center', size: 12.5, color: p.color,
          clampW: w, clampH: h });
    }
  }
}

// ------------------------------------------------------------- Carte du monde
// Planisphère avec les vraies côtes (js/geo.js — Natural Earth 110m). La nuit
// est une bande verticale (équinoxe) qui balaie la carte d'est en ouest ; les
// 24 fuseaux sont dessinés en bandes, chacune avec son heure en haut. La
// France est surlignée en rose, le pays cherché dans sa couleur.

function ringPath(ctx, ring, X, Y) {
  ctx.beginPath();
  for (let i = 0; i < ring.length; i++) {
    const x = X(ring[i][0]), y = Y(ring[i][1]);
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

export class MapView {
  constructor(canvas) { this.canvas = canvas; this.layout = null; }

  draw(homeH, places, highlightIso, highlightColor) {
    const { ctx, w, h } = fitCanvas(this.canvas);
    ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, w, h);
    drawStars(this, ctx, w, h, 90);

    // le monde en 2:1, centré (letterbox si le canvas est plus haut)
    let W = w - 8, H = W / 2;
    if (H > h - 8) { H = h - 8; W = H * 2; }
    const ox = (w - W) / 2, oy = (h - H) / 2;
    this.layout = { ox: ox, oy: oy, W: W, H: H };
    const X = (lon) => ox + (lon + 180) / 360 * W;
    const Y = (lat) => oy + (90 - lat) / 180 * H;
    const sub = subsolarLon(homeH);
    const utc = utcHours(homeH);

    ctx.save();
    roundRectPath(ctx, ox, oy, W, H, 12);
    ctx.clip();

    // océan
    const og = ctx.createLinearGradient(0, oy, 0, oy + H);
    og.addColorStop(0, '#4b93e0'); og.addColorStop(0.5, '#3c7fd0'); og.addColorStop(1, '#2f6cb8');
    ctx.fillStyle = og; ctx.fillRect(ox, oy, W, H);

    // les 24 fuseaux : bandes alternées + limites discrètes
    for (let m = -12; m <= 12; m++) {
      const x0 = Math.max(ox, X(15 * m - 7.5)), x1 = Math.min(ox + W, X(15 * m + 7.5));
      if (x1 <= x0) continue;
      if (((m % 2) + 2) % 2 === 0) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.fillRect(x0, oy, x1 - x0, H);
      }
    }
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.09)'; ctx.lineWidth = 1;
    for (let k = 0; k < 24; k++) {
      const x = X(-180 + 7.5 + k * 15);
      ctx.beginPath(); ctx.moveTo(x, oy); ctx.lineTo(x, oy + H); ctx.stroke();
    }

    // pays (avec leurs frontières), lacs, Antilles
    for (const country of COUNTRIES) {
      ctx.fillStyle = ICE_ISOS[country.iso] ? COL.ice : COL.land;
      for (const ring of country.rings) {
        ringPath(ctx, ring, X, Y);
        ctx.fill();
        ctx.strokeStyle = 'rgba(10, 40, 32, 0.5)'; ctx.lineWidth = 0.8; ctx.stroke();
      }
    }
    ctx.fillStyle = '#3c7fd0';
    for (const lake of LAKES) { ringPath(ctx, lake, X, Y); ctx.fill(); }
    ctx.fillStyle = COL.land;
    for (const [lon, lat] of ANTILLES) {
      ctx.beginPath(); ctx.ellipse(X(lon), Y(lat), 2, 2.6, 0.2, 0, TAU); ctx.fill();
    }
    for (const [lon, lat, r] of SPECKS) {
      ctx.beginPath();
      ctx.arc(X(lon), Y(lat), Math.max(1.4, r * W / 360), 0, TAU); ctx.fill();
    }

    // la France toujours en rose, le pays cherché dans sa couleur
    for (const country of COUNTRIES) {
      const isFr = country.iso === FRANCE_ISO;
      const isHl = highlightIso && country.iso === highlightIso;
      if (!isFr && !isHl) continue;
      ctx.fillStyle = isFr ? 'rgba(255, 107, 157, 0.35)' : 'rgba(255, 207, 92, 0.35)';
      ctx.strokeStyle = isFr ? 'rgba(255, 107, 157, 0.9)' : (highlightColor || 'rgba(255, 207, 92, 0.9)');
      ctx.lineWidth = 1.2;
      for (const ring of country.rings) { ringPath(ctx, ring, X, Y); ctx.fill(); ctx.stroke(); }
    }

    // méridien de Greenwich
    ctx.setLineDash([4, 6]); ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(X(0), oy); ctx.lineTo(X(0), oy + H); ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, 'Greenwich', X(0) + 5, oy + H - 10, { size: 9.5, alpha: 0.75, weight: 400 });

    // la nuit : 180° de large, du coucher (à l'ouest) au lever (à l'est),
    // avec 18° de crépuscule tout doux de chaque côté
    const uSet = X(wrapLon(sub + 90));
    const F = W * 18 / 360, NIGHT_W = W / 2;
    const span = (u0, width, fillFor) => {
      for (const shift of [0, -W, W]) {
        const a = u0 + shift, b = a + width;
        if (b <= ox || a >= ox + W) continue;
        ctx.fillStyle = fillFor(a);
        ctx.fillRect(Math.max(a, ox), oy, Math.min(b, ox + W) - Math.max(a, ox), H);
      }
    };
    const NCOL = '8, 17, 42';
    span(uSet, F, (a) => {
      const g = ctx.createLinearGradient(a, 0, a + F, 0);
      g.addColorStop(0, 'rgba(' + NCOL + ', 0)'); g.addColorStop(1, 'rgba(' + NCOL + ', 0.8)');
      return g;
    });
    span(uSet + F, NIGHT_W - 2 * F, () => 'rgba(' + NCOL + ', 0.8)');
    span(uSet + NIGHT_W - F, F, (a) => {
      const g = ctx.createLinearGradient(a, 0, a + F, 0);
      g.addColorStop(0, 'rgba(' + NCOL + ', 0.8)'); g.addColorStop(1, 'rgba(' + NCOL + ', 0)');
      return g;
    });

    // étoiles au cœur de la nuit
    if (this._mapStarKey !== W + 'x' + H) {
      this._mapStarKey = W + 'x' + H;
      this._mapStars = Array.from({ length: 70 }, () =>
        [Math.random() * 360 - 180, Math.random() * 170 - 85, Math.random() * 1 + 0.4, Math.random() * 0.5 + 0.2]);
    }
    ctx.fillStyle = '#fff';
    for (const [slon, slat, sr, sa] of this._mapStars) {
      const d = Math.abs(wrapLon(slon - sub));
      if (d < 102) continue;
      ctx.globalAlpha = sa * clamp01((d - 102) / 12);
      ctx.beginPath(); ctx.arc(X(slon), Y(slat), sr, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // l'heure de chaque bande, en haut de la carte (par-dessus la nuit)
    const step = W >= 640 ? 1 : 2;
    for (let m = -11; m <= 12; m += step) {
      const x = Math.max(ox + 14, Math.min(ox + W - 14, X(15 * m)));
      const bh = Math.floor(wrap24(utc + m));
      label(ctx, bh + ' h', x, oy + 10,
        { align: 'center', size: 9.5, alpha: 0.85, weight: 400, color: 'rgba(225, 234, 252, 0.95)' });
    }

    // petit soleil « il est midi ici » et petite lune « il est minuit ici »
    const both = (lon, fn) => {
      const x = X(wrapLon(lon));
      fn(x);
      if (x < ox + 70) fn(x + W);
      if (x > ox + W - 70) fn(x - W);
    };
    both(sub, (x) => {
      const y = Y(12);
      const g = ctx.createRadialGradient(x, y, 1, x, y, 30);
      g.addColorStop(0, 'rgba(255, 207, 92, 0.55)'); g.addColorStop(1, 'rgba(255, 207, 92, 0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 30, 0, TAU); ctx.fill();
      ctx.strokeStyle = COL.sun; ctx.lineWidth = 2; ctx.lineCap = 'round';
      for (let i = 0; i < 8; i++) {
        const a = i * TAU / 8 + 0.4;
        ctx.beginPath();
        ctx.moveTo(x + 13 * Math.cos(a), y + 13 * Math.sin(a));
        ctx.lineTo(x + 18 * Math.cos(a), y + 18 * Math.sin(a));
        ctx.stroke();
      }
      ctx.fillStyle = COL.sun;
      ctx.beginPath(); ctx.arc(x, y, 9.5, 0, TAU); ctx.fill();
      if (W >= 520) {
        label(ctx, 'il est midi ici', x, y + 30, { align: 'center', size: 10, alpha: 0.9, color: COL.sun });
      }
    });
    both(sub + 180, (x) => {
      const y = Y(12);
      ctx.save();
      ctx.shadowColor = 'rgba(233, 237, 248, 0.8)'; ctx.shadowBlur = 12;
      ctx.fillStyle = '#e6ecfa';
      ctx.beginPath(); ctx.arc(x, y, 8.5, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#bcc8e2';
      ctx.beginPath(); ctx.arc(x - 2.5, y - 2, 2, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 2.5, y + 1.5, 1.4, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(x - 0.5, y + 3.5, 1.1, 0, TAU); ctx.fill();
      if (W >= 520) {
        label(ctx, 'il est minuit ici', x, y + 27, { align: 'center', size: 10, alpha: 0.85, color: '#c9d5f2' });
      }
    });

    // villes-décor : de petits points nommés pour que la carte ne soit jamais vide
    for (const d of DECOR) {
      let near = false;
      for (const p of places) {
        if (Math.abs(p.lonDeg - d.lon) < 5 && Math.abs(p.latDeg - d.lat) < 5) near = true;
      }
      if (near) continue;
      const x = X(d.lon), y = Y(d.lat);
      ctx.beginPath(); ctx.arc(x, y, 2.4, 0, TAU);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'; ctx.fill();
      label(ctx, d.n, x, y - 7,
        { align: 'center', size: 8.5, alpha: 0.6, weight: 400, clampW: w, clampH: h });
    }

    // les maisons
    for (const p of places) {
      const x = X(p.lonDeg), y = Y(p.latDeg);
      ctx.save();
      ctx.shadowColor = p.color; ctx.shadowBlur = 9;
      ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU); ctx.fillStyle = p.color; ctx.fill();
      ctx.restore();
      ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)'; ctx.lineWidth = 2; ctx.stroke();
      const above = p.id === 'france';
      label(ctx, p.name, x, above ? y - 14 : y + 15,
        { align: 'center', size: 11.5, color: p.color, clampW: w, clampH: h });
    }

    ctx.restore();

    // cadre du monde
    roundRectPath(ctx, ox, oy, W, H, 12);
    ctx.strokeStyle = 'rgba(150, 180, 240, 0.3)'; ctx.lineWidth = 1.5; ctx.stroke();
  }
}

// ------------------------------------------------------------ Ciels des vignettes
// Le ciel local, interpolé en continu : nuit étoilée → aube rose → grand jour →
// coucher orangé. Silhouettes différentes selon le lieu (plage, ville, temple).
const SKY_NIGHT = ['#070d20', '#0d183a', '#16335e'];
const SKY_TWILIGHT = ['#1a2150', '#8f4677', '#ff9f4c'];
const SKY_DAY = ['#2f74c9', '#5fa5e8', '#a8d7ff'];

function skyStops(alt) {
  const mix3 = (A, B, t) => [mixHex(A[0], B[0], t), mixHex(A[1], B[1], t), mixHex(A[2], B[2], t)];
  if (alt <= -0.32) return SKY_NIGHT;
  if (alt < 0.03) return mix3(SKY_NIGHT, SKY_TWILIGHT, smooth((alt + 0.32) / 0.35));
  if (alt < 0.45) return mix3(SKY_TWILIGHT, SKY_DAY, smooth((alt - 0.03) / 0.42));
  return SKY_DAY;
}

export class SkyView {
  constructor(canvas, place) { this.canvas = canvas; this.place = place; }

  draw(homeH) {
    const { ctx, w, h } = fitCanvas(this.canvas);
    const solar = solarHours(homeH, this.place.lonDeg);
    const alt = sunAltitude(solar);
    const horizon = h - 22;

    // ciel
    const stops = skyStops(alt);
    const g = ctx.createLinearGradient(0, 0, 0, horizon);
    g.addColorStop(0, stops[0]); g.addColorStop(0.55, stops[1]); g.addColorStop(1, stops[2]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

    // étoiles quand le soleil est bien couché
    const starA = clamp01((-alt - 0.06) * 4);
    if (starA > 0) {
      drawStarsFaded(this, ctx, w, horizon, 40, starA);
    }

    // soleil : il traverse le ciel de gauche (matin) à droite (soir)
    if (alt > -0.14) {
      const sx = 20 + clamp01((solar - 6) / 12) * (w - 40);
      const sy = horizon - alt * (horizon - 18);
      const warm = clamp01(1 - alt * 1.5);
      const core = mixHex('#ffcf5c', '#ff8a3c', warm * 0.8);
      const sg = ctx.createRadialGradient(sx, sy, 1, sx, sy, 26);
      sg.addColorStop(0, core); sg.addColorStop(0.45, 'rgba(255, 175, 70, 0.5)');
      sg.addColorStop(1, 'rgba(255, 159, 28, 0)');
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, 26, 0, TAU); ctx.fill();
      ctx.fillStyle = core;
      ctx.beginPath(); ctx.arc(sx, sy, 9, 0, TAU); ctx.fill();
    }

    // lune (opposée au soleil), quand il fait nuit
    const malt = -alt;
    if (malt > 0.05) {
      const msolar = solar >= 12 ? solar - 12 : solar + 12;
      const mx = 20 + clamp01((msolar - 6) / 12) * (w - 40);
      const my = horizon - malt * (horizon - 18);
      ctx.globalAlpha = clamp01((malt - 0.05) * 3);
      ctx.save();
      ctx.shadowColor = 'rgba(233, 237, 248, 0.7)'; ctx.shadowBlur = 10;
      ctx.fillStyle = '#e6ecfa'; ctx.beginPath(); ctx.arc(mx, my, 7.5, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#bcc8e2';
      ctx.beginPath(); ctx.arc(mx - 2.2, my - 1.8, 1.8, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(mx + 2.2, my + 1.4, 1.2, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // nuages en plein jour
    const cloudA = clamp01(alt * 2 - 0.15) * 0.85;
    if (cloudA > 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, ' + cloudA + ')';
      const drift = (solar * 6) % (w + 80) - 40;
      cloud(ctx, drift, 20, 1);
      cloud(ctx, wrapX(drift + w * 0.55, w), 34, 0.75);
    }

    // le sol et les silhouettes du lieu
    ctx.fillStyle = COL.silhouette;
    ctx.fillRect(0, horizon, w, h - horizon);
    this.scenery(ctx, w, h, horizon, alt);
  }

  scenery(ctx, w, h, horizon, alt) {
    const night = alt < -0.02; // fenêtres allumées dès que le soleil est couché
    const scene = this.place.scene ||
      (Math.abs(this.place.latDeg || 0) <= 23.5 ? 'plage' : 'campagne');
    if (scene === 'plage') {
      // la mer à droite, deux palmiers, la petite maison
      ctx.fillStyle = '#1c4a86';
      ctx.beginPath();
      ctx.moveTo(w * 0.56, horizon);
      for (let x = w * 0.56; x <= w + 12; x += 12) {
        ctx.quadraticCurveTo(x + 3, horizon - 3.5, x + 6, horizon);
      }
      ctx.lineTo(w, h); ctx.lineTo(w * 0.56, h); ctx.closePath(); ctx.fill();
      house(ctx, w * 0.14, horizon, night);
      palm(ctx, w * 0.44, horizon, 30, -1);
      palm(ctx, w * 0.78, horizon, 24, 1);
    } else if (scene === 'ville') {
      // chez nous : la maison, un sapin, et la tour Eiffel au loin
      house(ctx, w * 0.16, horizon, night);
      fir(ctx, w * 0.48, horizon, 26);
      eiffel(ctx, w * 0.74, horizon, Math.min(58, horizon - 12), night);
    } else if (scene === 'temple') {
      // Bali : la maison, un palmier et le temple aux toits empilés
      house(ctx, w * 0.12, horizon, night);
      palm(ctx, w * 0.46, horizon, 26, 1);
      temple(ctx, w * 0.72, horizon, night);
    } else {
      // ailleurs : une maison et des arbres
      house(ctx, w * 0.18, horizon, night);
      fir(ctx, w * 0.55, horizon, 24);
      fir(ctx, w * 0.78, horizon, 30);
    }
  }
}

function wrapX(x, w) { return ((x + 40) % (w + 80)) - 40; }

function drawStarsFaded(view, ctx, w, h, count, alpha) {
  const key = 'sky' + w + 'x' + h;
  if (view._starKey !== key) {
    view._starKey = key;
    view._stars = Array.from({ length: count }, () =>
      [Math.random() * w, Math.random() * h * 0.9, Math.random() * 1.1 + 0.3, Math.random() * 0.5 + 0.2]);
  }
  ctx.fillStyle = '#fff';
  for (const [x, y, r, a] of view._stars) {
    ctx.globalAlpha = a * alpha;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function cloud(ctx, x, y, s) {
  ctx.beginPath();
  ctx.arc(x, y, 9 * s, 0, TAU);
  ctx.arc(x + 10 * s, y - 4 * s, 7 * s, 0, TAU);
  ctx.arc(x + 20 * s, y, 8 * s, 0, TAU);
  ctx.fill();
}

// petite maison : silhouette + fenêtre qui s'allume la nuit
function house(ctx, x, horizon, lit) {
  const bw = 40, bh = 26, y = horizon - bh;
  ctx.fillStyle = COL.silhouette;
  ctx.fillRect(x, y, bw, bh + 2);
  ctx.beginPath();
  ctx.moveTo(x - 6, y); ctx.lineTo(x + bw / 2, y - 16); ctx.lineTo(x + bw + 6, y);
  ctx.closePath(); ctx.fill();
  ctx.fillRect(x + bw - 12, y - 24, 6, 12); // cheminée
  // porte
  ctx.fillStyle = '#141d3a';
  ctx.fillRect(x + 6, y + bh - 13, 9, 13);
  // fenêtre
  if (lit) { ctx.save(); ctx.shadowColor = '#ffcf5c'; ctx.shadowBlur = 12; }
  ctx.fillStyle = lit ? '#ffcf5c' : '#182448';
  ctx.fillRect(x + 22, y + 8, 11, 10);
  if (lit) { ctx.restore(); }
  ctx.strokeStyle = COL.silhouette; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x + 27.5, y + 8); ctx.lineTo(x + 27.5, y + 18);
  ctx.moveTo(x + 22, y + 13); ctx.lineTo(x + 33, y + 13);
  ctx.stroke();
}

function palm(ctx, x, horizon, size, lean) {
  ctx.strokeStyle = COL.silhouette; ctx.fillStyle = COL.silhouette;
  ctx.lineWidth = 4; ctx.lineCap = 'round';
  const topX = x + lean * size * 0.28, topY = horizon - size;
  ctx.beginPath();
  ctx.moveTo(x, horizon);
  ctx.quadraticCurveTo(x + lean * size * 0.05, horizon - size * 0.6, topX, topY);
  ctx.stroke();
  ctx.lineWidth = 3;
  for (const a of [-2.6, -2.0, -1.2, -0.5, 0.2]) {
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.quadraticCurveTo(topX + Math.cos(a) * size * 0.5, topY + Math.sin(a) * size * 0.32 - 4,
      topX + Math.cos(a) * size * 0.72, topY + Math.sin(a) * size * 0.5 + 3);
    ctx.stroke();
  }
}

function fir(ctx, x, horizon, size) {
  ctx.fillStyle = COL.silhouette;
  for (let i = 0; i < 3; i++) {
    const y = horizon - i * size * 0.28, s = size * (1 - i * 0.22);
    ctx.beginPath();
    ctx.moveTo(x - s * 0.42, y); ctx.lineTo(x, y - s * 0.55); ctx.lineTo(x + s * 0.42, y);
    ctx.closePath(); ctx.fill();
  }
  ctx.fillRect(x - 2.5, horizon - 5, 5, 5);
}

// la tour Eiffel en six coups de crayon
function eiffel(ctx, x, horizon, hgt, lit) {
  ctx.strokeStyle = COL.silhouette; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
  const top = horizon - hgt;
  ctx.beginPath();
  ctx.moveTo(x - hgt * 0.34, horizon);
  ctx.quadraticCurveTo(x - hgt * 0.10, horizon - hgt * 0.52, x, top);
  ctx.quadraticCurveTo(x + hgt * 0.10, horizon - hgt * 0.52, x + hgt * 0.34, horizon);
  ctx.stroke();
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x - hgt * 0.21, horizon - hgt * 0.30); ctx.lineTo(x + hgt * 0.21, horizon - hgt * 0.30);
  ctx.moveTo(x - hgt * 0.115, horizon - hgt * 0.55); ctx.lineTo(x + hgt * 0.115, horizon - hgt * 0.55);
  ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top - 6); ctx.stroke();
  if (lit) { // la tour scintille la nuit
    ctx.fillStyle = '#ffcf5c';
    ctx.beginPath(); ctx.arc(x, top - 6, 1.8, 0, TAU); ctx.fill();
  }
}

// temple balinais : les toits empilés (meru)
function temple(ctx, x, horizon, lit) {
  ctx.fillStyle = COL.silhouette;
  const tiers = [[34, 9], [26, 8], [18, 7]];
  let y = horizon;
  ctx.fillRect(x - 14, y - 6, 28, 6);
  y -= 6;
  for (const [tw, th] of tiers) {
    ctx.beginPath();
    ctx.moveTo(x - tw / 2, y); ctx.lineTo(x - tw / 2 + 4, y - th);
    ctx.lineTo(x + tw / 2 - 4, y - th); ctx.lineTo(x + tw / 2, y);
    ctx.closePath(); ctx.fill();
    y -= th + 2;
  }
  ctx.fillRect(x - 1.5, y - 6, 3, 8);
  if (lit) {
    ctx.save(); ctx.shadowColor = '#ffcf5c'; ctx.shadowBlur = 9;
    ctx.fillStyle = '#ffcf5c';
    ctx.fillRect(x - 3, horizon - 5, 6, 4); // une petite lampe à l'entrée
    ctx.restore();
  }
}

// -------------------------------------------------------- Horloges analogiques
const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(name, attrs) {
  const el = document.createElementNS(SVG_NS, name);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

// Construit une horloge SVG dans `slot` et renvoie { set(h, m) }.
export function buildClock(slot) {
  const svg = svgEl('svg', { viewBox: '0 0 100 100', 'class': 'clock', 'aria-hidden': 'true' });
  svg.appendChild(svgEl('circle', { cx: 50, cy: 50, r: 46, 'class': 'clock-face' }));
  for (let i = 0; i < 12; i++) {
    const a = i * TAU / 12;
    const big = i % 3 === 0;
    const r1 = big ? 38.5 : 40.5, r2 = 43.5;
    svg.appendChild(svgEl('line', {
      x1: 50 + r1 * Math.sin(a), y1: 50 - r1 * Math.cos(a),
      x2: 50 + r2 * Math.sin(a), y2: 50 - r2 * Math.cos(a),
      'class': 'clock-tick', 'stroke-width': big ? 3 : 1.6,
    }));
  }
  for (const [num, a] of [['12', 0], ['3', TAU / 4], ['6', TAU / 2], ['9', 3 * TAU / 4]]) {
    svg.appendChild(svgEl('text', {
      x: 50 + 30 * Math.sin(a), y: 50 - 30 * Math.cos(a) + 4,
      'text-anchor': 'middle', 'class': 'clock-num',
    })).textContent = num;
  }
  const hourHand = svgEl('line', { x1: 50, y1: 50, x2: 50, y2: 28, 'class': 'hand hand-hour' });
  const minHand = svgEl('line', { x1: 50, y1: 50, x2: 50, y2: 17, 'class': 'hand hand-min' });
  svg.appendChild(hourHand);
  svg.appendChild(minHand);
  svg.appendChild(svgEl('circle', { cx: 50, cy: 50, r: 4, 'class': 'clock-center' }));
  slot.appendChild(svg);
  let last = '';
  return {
    set: function (h, m) {
      const key = h + ':' + m;
      if (key === last) return;
      last = key;
      hourHand.setAttribute('transform', 'rotate(' + ((h % 12) * 30 + m * 0.5) + ' 50 50)');
      minHand.setAttribute('transform', 'rotate(' + (m * 6) + ' 50 50)');
    },
  };
}
