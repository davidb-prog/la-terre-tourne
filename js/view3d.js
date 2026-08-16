// Globe 3D « maison » : projection orthographique en canvas 2D, comme la vue 3D
// de l'épisode 1 — aucune bibliothèque. Le Soleil est fixe dans l'espace ; la
// Terre tourne avec l'heure ; on glisse pour orbiter autour et aller voir la
// nuit. Les pays (js/geo.js, Natural Earth 110m) sont découpés à l'horizon de
// la sphère et recousus le long du limbe.

import { TAU, DEG, GREENWICH_LON, placeAngle } from './model.js';
import { COUNTRIES, LAKES, ICE_ISOS, FRANCE_ISO, ANTILLES, SPECKS } from './geo.js';
import { DECOR } from './places.js';
import { fitCanvas, drawStars, label } from './views.js';

const COL3D = {
  bg: '#070b17',
  land: '#4fc79f', landEdge: 'rgba(16, 60, 48, 0.35)',
  border: 'rgba(10, 40, 32, 0.55)',
  ice: '#cfdff0',
  lake: '#3c7fd0',
  night: '8, 17, 42',
};

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]];
const norm = (v) => {
  const n = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
};

export class Globe3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.yaw = -55 * DEG;  // caméra : l'Europe au centre au chargement (midi)
    this.pitch = 16 * DEG; // pôle Nord légèrement penché vers nous
    this.layout = null;
    this.pulse = null;     // { lonDeg, latDeg, k } — anneau après un vol
  }

  // (lon, lat) → vecteur unitaire dans le repère caméra.
  // x : droite de l'écran ; y : vers le fond ; z : vers le haut. Visible si y < 0.
  point(lonDeg, latDeg) {
    const lam = this._spin + lonDeg * DEG + this.yaw;
    const phi = latDeg * DEG;
    const cp = Math.cos(phi);
    const y0 = cp * Math.sin(lam), z0 = Math.sin(phi);
    return [cp * Math.cos(lam), y0 * this._ct - z0 * this._st, y0 * this._st + z0 * this._ct];
  }

  // places : liste de lieux à marquer ; highlightIso : pays à surligner (invité).
  draw(homeH, places, highlightIso, highlightColor) {
    const { ctx, w, h } = fitCanvas(this.canvas);
    ctx.fillStyle = COL3D.bg; ctx.fillRect(0, 0, w, h);
    drawStars(this, ctx, w, h, 150);

    const S = Math.min(w, h);
    const cx = 0.40 * w, cy = 0.5 * h, R = 0.34 * S;
    this.layout = { cx: cx, cy: cy, R: R };
    this._spin = placeAngle(homeH, GREENWICH_LON);
    this._ct = Math.cos(this.pitch); this._st = Math.sin(this.pitch);

    // le Soleil, fixe dans l'espace (azimut 0), vu dans le repère caméra
    const sl = this.yaw;
    const sun = [Math.cos(sl), Math.sin(sl) * this._ct, Math.sin(sl) * this._st];
    const sunScreen = norm([sun[0], -sun[2], 0]);

    // le Soleil est FIXE, posé à droite du globe (la caméra ne tourne plus
    // autour : c'est la Terre qu'on fait tourner, comme avec le curseur)
    const rS = 0.14 * R;
    const sunX = cx + R * 1.55, sunY = cy - R * 0.06;
    const g = ctx.createRadialGradient(sunX, sunY, 1, sunX, sunY, rS * 2.6);
    g.addColorStop(0, '#fff7d6'); g.addColorStop(0.3, '#ffcf5c');
    g.addColorStop(0.65, 'rgba(255, 159, 28, 0.25)'); g.addColorStop(1, 'rgba(255, 159, 28, 0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(sunX, sunY, rS * 2.6, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#ffcf5c'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8 + 0.39;
      ctx.beginPath();
      ctx.moveTo(sunX + rS * 1.25 * Math.cos(a), sunY + rS * 1.25 * Math.sin(a));
      ctx.lineTo(sunX + rS * 1.7 * Math.cos(a), sunY + rS * 1.7 * Math.sin(a));
      ctx.stroke();
    }
    ctx.fillStyle = '#ffcf5c';
    ctx.beginPath(); ctx.arc(sunX, sunY, rS, 0, TAU); ctx.fill();
    label(ctx, 'le Soleil', sunX, sunY + rS * 2.1 + 8,
      { align: 'center', size: 11, alpha: 0.85, color: '#ffcf5c', clampW: w, clampH: h });
    // rayons parallèles, flèches vers la Terre
    ctx.strokeStyle = 'rgba(255, 207, 92, 0.5)'; ctx.lineWidth = 2;
    for (const dy of [-0.5 * R, 0, 0.5 * R]) {
      const y = cy + dy, x1 = sunX - rS * 2.2, x2 = cx + Math.sqrt(Math.max(0.1, 1 - (dy / R) * (dy / R))) * R + 14;
      if (x1 > x2 + 12) {
        ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x2, y); ctx.lineTo(x2 + 7, y - 4);
        ctx.moveTo(x2, y); ctx.lineTo(x2 + 7, y + 4); ctx.stroke();
      }
    }

    // atmosphère : un fin halo bleuté autour du disque
    const atm = ctx.createRadialGradient(cx, cy, R * 0.94, cx, cy, R * 1.1);
    atm.addColorStop(0, 'rgba(90, 167, 255, 0)');
    atm.addColorStop(0.55, 'rgba(90, 167, 255, 0.22)');
    atm.addColorStop(1, 'rgba(90, 167, 255, 0)');
    ctx.fillStyle = atm;
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.1, 0, TAU); ctx.fill();

    // l'océan, éclairé du côté du Soleil
    const oc = ctx.createRadialGradient(
      cx + sunScreen[0] * R * 0.45, cy + sunScreen[1] * R * 0.45, R * 0.1, cx, cy, R * 1.02);
    oc.addColorStop(0, '#7db9f7'); oc.addColorStop(0.7, '#4a90e0'); oc.addColorStop(1, '#2f6cb8');
    ctx.fillStyle = oc;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();

    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();

    // pays (avec leurs frontières), glaces, lacs
    for (const country of COUNTRIES) {
      const fill = ICE_ISOS[country.iso] ? COL3D.ice : COL3D.land;
      for (const ring of country.rings) {
        this.shape(ctx, ring, cx, cy, R, fill, COL3D.border);
      }
    }
    for (const lake of LAKES) this.shape(ctx, lake, cx, cy, R, COL3D.lake);
    for (const [lon, lat] of ANTILLES) this.spot(ctx, lon, lat, 1.8, COL3D.land, cx, cy, R);
    for (const [lon, lat, r] of SPECKS) {
      this.spot(ctx, lon, lat, Math.max(1.4, r * DEG * R), COL3D.land, cx, cy, R);
    }

    // la France (chez nous) toujours en rose, le pays cherché dans sa couleur
    for (const country of COUNTRIES) {
      const hl = country.iso === FRANCE_ISO ? 'rgba(255, 107, 157, 0.45)'
        : (highlightIso && country.iso === highlightIso)
          ? 'rgba(255, 207, 92, 0.4)' : null;
      if (!hl) continue;
      const edge = country.iso === FRANCE_ISO ? 'rgba(255, 107, 157, 0.9)'
        : (highlightColor || 'rgba(255, 207, 92, 0.9)');
      for (const ring of country.rings) this.shape(ctx, ring, cx, cy, R, hl, edge);
    }

    // les 24 fuseaux : une bande sur deux teintée + méridiens bien visibles
    for (let bandM = -12; bandM < 12; bandM++) {
      if (((bandM % 2) + 2) % 2 !== 0) continue;
      this.shape(ctx, [[15 * bandM - 7.5, -88], [15 * bandM - 7.5, 88],
        [15 * bandM + 7.5, 88], [15 * bandM + 7.5, -88]], cx, cy, R,
        'rgba(255, 255, 255, 0.08)');
    }
    for (let k = 0; k < 24; k++) {
      const lon = -180 + 7.5 + k * 15;
      this.arc(ctx, (t) => [lon, t * 168 - 84], 'rgba(255, 255, 255, 0.26)', [], cx, cy, R);
    }
    this.arc(ctx, (t) => [t * 360 - 180, 0], 'rgba(255, 255, 255, 0.16)', [], cx, cy, R);
    this.arc(ctx, (t) => [GREENWICH_LON, t * 170 - 85], 'rgba(255, 255, 255, 0.5)', [5, 6], cx, cy, R);

    // la nuit : la moitié qui tourne le dos au Soleil, avec un crépuscule tout doux
    this.nightCap(ctx, sun, 0.07, 0.26, cx, cy, R);
    this.nightCap(ctx, sun, -0.07, 0.4, cx, cy, R);
    this.nightCap(ctx, sun, -0.2, 0.3, cx, cy, R);

    // lueurs chaudes là où le soleil se lève ou se couche en ce moment
    const a1 = Math.atan2(-sun[0], sun[2]);
    for (const a of [a1, a1 + Math.PI]) {
      const px = cx + R * Math.cos(a), py = cy - R * Math.sin(a);
      const wg = ctx.createRadialGradient(px, py, 1, px, py, 0.3 * R);
      wg.addColorStop(0, 'rgba(255, 145, 60, 0.34)'); wg.addColorStop(1, 'rgba(255, 145, 60, 0)');
      ctx.fillStyle = wg;
      ctx.beginPath(); ctx.arc(px, py, 0.3 * R, 0, TAU); ctx.fill();
    }

    // jour / nuit en toutes lettres, aux points face au Soleil et à l'opposé
    if (-sun[1] > 0.35) {
      label(ctx, 'jour', cx + R * 0.55 * sun[0], cy - R * 0.55 * sun[2],
        { align: 'center', size: Math.round(0.13 * R), color: 'rgba(255, 255, 255, 0.4)' });
    }
    if (sun[1] > 0.35) {
      label(ctx, 'nuit', cx - R * 0.55 * sun[0], cy + R * 0.55 * sun[2],
        { align: 'center', size: Math.round(0.13 * R), color: 'rgba(157, 185, 255, 0.5)' });
    }

    ctx.restore();

    // contour du disque
    ctx.strokeStyle = 'rgba(150, 180, 240, 0.45)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();

    // villes-décor : de petits points nommés pour que le globe ne soit jamais vide
    for (const d of DECOR) {
      let near = false;
      for (const p of places) {
        if (Math.abs(p.lonDeg - d.lon) < 4 && Math.abs(p.latDeg - d.lat) < 4) near = true;
      }
      if (near) continue;
      const v = this.point(d.lon, d.lat);
      if (-v[1] < 0.1) continue;
      const x = cx + R * v[0], y = cy - R * v[2];
      ctx.beginPath(); ctx.arc(x, y, 2.6, 0, TAU);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'; ctx.fill();
      label(ctx, d.n, x, y - 8,
        { align: 'center', size: 9, alpha: 0.6, weight: 400, clampW: w, clampH: h });
    }

    // les maisons — seulement du côté qu'on regarde
    for (const p of places) {
      const v = this.point(p.lonDeg, p.latDeg);
      if (-v[1] < 0.06) continue;
      const x = cx + R * v[0], y = cy - R * v[2];
      const s = 5 + 2.5 * -v[1];
      ctx.save();
      ctx.shadowColor = p.color; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fillStyle = p.color; ctx.fill();
      ctx.restore();
      ctx.beginPath(); ctx.arc(x, y, s, 0, TAU);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)'; ctx.lineWidth = 2; ctx.stroke();
      label(ctx, p.name, x, y - s - 9,
        { align: 'center', size: 12.5, color: p.color, clampW: w, clampH: h });
    }

    // petit anneau qui pulse à l'arrivée d'un vol
    if (this.pulse && this.pulse.k > 0) {
      const v = this.point(this.pulse.lonDeg, this.pulse.latDeg);
      if (-v[1] > 0) {
        const x = cx + R * v[0], y = cy - R * v[2];
        ctx.strokeStyle = 'rgba(255, 207, 92, ' + (0.9 * this.pulse.k) + ')';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, 8 + (1 - this.pulse.k) * 30, 0, TAU); ctx.stroke();
      }
      this.pulse.k -= 0.02;
    }
  }

  // Convertit un clic (coordonnées canvas CSS) en longitude/latitude sur la
  // face visible de la sphère, ou null hors du disque.
  hitTest(x, y) {
    if (!this.layout) return null;
    const px = (x - this.layout.cx) / this.layout.R;
    const pz = -(y - this.layout.cy) / this.layout.R;
    const rr = px * px + pz * pz;
    if (rr > 1) return null;
    const py = -Math.sqrt(1 - rr);
    // rotation inverse du tangage, puis retrait de la rotation de la Terre
    const y0 = py * this._ct + pz * this._st;
    const z0 = -py * this._st + pz * this._ct;
    const lam = Math.atan2(y0, px) - this._spin - this.yaw;
    const phi = Math.asin(Math.max(-1, Math.min(1, z0)));
    return { lonDeg: ((lam / DEG + 180) % 360 + 360) % 360 - 180, latDeg: phi / DEG };
  }

  // Petit disque (îlot) si le point regarde vers nous.
  spot(ctx, lon, lat, r, fill, cx, cy, R) {
    const v = this.point(lon, lat);
    if (-v[1] < 0.03) return;
    ctx.beginPath();
    ctx.arc(cx + R * v[0], cy - R * v[2], Math.max(1.2, r * -v[1]), 0, TAU);
    ctx.fillStyle = fill; ctx.fill();
  }

  // Ligne (équateur, méridien) : trace les tronçons visibles.
  arc(ctx, at, style, dash, cx, cy, R) {
    ctx.strokeStyle = style; ctx.lineWidth = 1.2; ctx.setLineDash(dash);
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i <= 72; i++) {
      const ll = at(i / 72);
      const v = this.point(ll[0], ll[1]);
      if (-v[1] > 0) {
        const x = cx + R * v[0], y = cy - R * v[2];
        if (pen) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        pen = true;
      } else pen = false;
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Remplit la calotte { p · sun ≤ c } visible : bord de calotte + arcs de limbe.
  nightCap(ctx, sun, c, alpha, cx, cy, R) {
    const fill = 'rgba(' + COL3D.night + ', ' + alpha + ')';
    const u = norm(cross(sun, [0, 0, 1]));
    const v = cross(sun, u);
    const r = Math.sqrt(1 - c * c);
    const ring = [];
    for (let i = 0; i < 90; i++) {
      const t = i / 90 * TAU;
      ring.push([c * sun[0] + r * (Math.cos(t) * u[0] + Math.sin(t) * v[0]),
        c * sun[1] + r * (Math.cos(t) * u[1] + Math.sin(t) * v[1]),
        c * sun[2] + r * (Math.cos(t) * u[2] + Math.sin(t) * v[2])]);
    }
    const front = ring.map((p) => -p[1] > 0);
    const count = front.filter(Boolean).length;
    if (count === 0) {
      // bord invisible : soit toute la face visible est dans la nuit, soit rien
      if (-sun[1] < c) { ctx.fillStyle = fill; ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R); }
      return;
    }
    ctx.beginPath();
    if (count === ring.length) {
      // tout le bord est visible : selon le côté du Soleil, la nuit est
      // l'intérieur de la boucle… ou tout le disque sauf la boucle
      for (let i = 0; i < ring.length; i++) {
        const x = cx + R * ring[i][0], y = cy - R * ring[i][2];
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.closePath();
      if (-sun[1] > c) ctx.rect(cx - R, cy - R, 2 * R, 2 * R);
      ctx.fillStyle = fill; ctx.fill('evenodd');
      return;
    } else {
      // un seul arc visible : on le parcourt puis on referme le long du limbe
      let start = 0;
      while (!(front[start] && !front[(start + ring.length - 1) % ring.length])) start++;
      const pts = [];
      for (let k = 0; k < ring.length; k++) {
        const p = ring[(start + k) % ring.length];
        if (-p[1] > 0) pts.push(p); else break;
      }
      for (let i = 0; i < pts.length; i++) {
        const x = cx + R * pts[i][0], y = cy - R * pts[i][2];
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      const last = pts[pts.length - 1], first = pts[0];
      const aEnd = Math.atan2(last[2], last[0]);
      const aStart = Math.atan2(first[2], first[0]);
      // referme par le côté du limbe qui est dans la nuit
      const mid = (dir) => {
        const m = aEnd + dir * (((aStart - aEnd) * dir % TAU + TAU) % TAU) / 2;
        return [Math.cos(m), 0, Math.sin(m)];
      };
      const dot = (p) => p[0] * sun[0] + p[2] * sun[2];
      const dir = dot(mid(1)) <= c + 0.02 ? 1 : -1;
      const span = ((aStart - aEnd) * dir % TAU + TAU) % TAU;
      const steps = Math.max(2, Math.ceil(span / (6 * DEG)));
      for (let i = 1; i <= steps; i++) {
        const a = aEnd + dir * span * i / steps;
        ctx.lineTo(cx + R * Math.cos(a), cy - R * Math.sin(a));
      }
    }
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
  }

  // Polygone (lon, lat) découpé à l'horizon de la sphère et recousu au limbe.
  shape(ctx, pts, cx, cy, R, fill, stroke) {
    // densifie les bords (5° max) pour suivre la courbure
    const dense = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const gap = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
      const n = gap > 5 ? Math.ceil(gap / 5) : 1;
      for (let k = 0; k < n; k++) {
        dense.push(this.point(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n));
      }
    }
    const N = dense.length;
    let firstBack = -1;
    for (let i = 0; i < N; i++) if (!(-dense[i][1] > 0)) { firstBack = i; break; }
    ctx.beginPath();
    if (firstBack === -1) {
      // tout devant : chemin simple
      for (let i = 0; i < N; i++) {
        const x = cx + R * dense[i][0], y = cy - R * dense[i][2];
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
    } else {
      // découpe en tronçons visibles, reliés par le limbe (au plus court)
      const runs = [];
      let cur = null;
      const horizon = (a, b) => {
        const da = -a[1], db = -b[1];
        const t = da / (da - db);
        return norm([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
      };
      for (let k = 0; k < N; k++) {
        const a = dense[(firstBack + k) % N], b = dense[(firstBack + k + 1) % N];
        const fa = -a[1] > 0, fb = -b[1] > 0;
        if (fa && fb) cur.push(b);
        else if (fa && !fb) { cur.push(horizon(a, b)); runs.push(cur); cur = null; }
        else if (!fa && fb) { cur = [horizon(a, b), b]; }
      }
      if (cur) runs.push(cur);
      if (!runs.length) return;
      for (let ri = 0; ri < runs.length; ri++) {
        const run = runs[ri];
        for (let i = 0; i < run.length; i++) {
          const x = cx + R * run[i][0], y = cy - R * run[i][2];
          if (ri === 0 && i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        // pont le long du limbe vers le tronçon suivant
        const next = runs[(ri + 1) % runs.length];
        const e = run[run.length - 1], s = next[0];
        const aEnd = Math.atan2(e[2], e[0]), aStart = Math.atan2(s[2], s[0]);
        let d = (aStart - aEnd) % TAU;
        if (d > Math.PI) d -= TAU;
        if (d < -Math.PI) d += TAU;
        const steps = Math.max(1, Math.ceil(Math.abs(d) / (8 * DEG)));
        for (let i = 1; i <= steps; i++) {
          const a = aEnd + d * i / steps;
          ctx.lineTo(cx + R * Math.cos(a), cy - R * Math.sin(a));
        }
      }
    }
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.1; ctx.stroke(); }
  }
}
