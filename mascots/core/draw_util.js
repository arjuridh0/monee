// Helper gambar bersama untuk semua maskot (tanpa dependensi).
const TAU = Math.PI * 2;

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, k) => a + (b - a) * k;

/** Elips terisi/garis. o: {f: fill, s: stroke, lw, rot} */
export function E(ctx, x, y, rx, ry, o = {}) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), o.rot || 0, 0, TAU);
  if (o.f) { ctx.fillStyle = o.f; ctx.fill(); }
  if (o.s) { ctx.strokeStyle = o.s; ctx.lineWidth = o.lw || 2; ctx.stroke(); }
}

/** Garis melengkung (busur). */
export function A(ctx, x, y, r, a0, a1, color, lw = 3) {
  ctx.beginPath();
  ctx.arc(x, y, r, a0, a1);
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.stroke();
}

export function line(ctx, pts, color, lw = 3) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
}

/** Lengan/kaki kapsul dari (x,y) ke arah angle (rad, 0 = ke bawah). */
export function limb(ctx, x, y, angle, len, w, fill, stroke) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(angle);
  ctx.beginPath();
  ctx.roundRect(-w / 2, -w / 2, w, len + w, w / 2);
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
  ctx.restore();
  return [x - Math.sin(angle) * len, y + Math.cos(angle) * len]; // ujung lengan
}

/** Simbol urat marah (empat busur membentuk tanda #). */
export function vein(ctx, x, y, s, color = '#E5484D') {
  ctx.strokeStyle = color; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    ctx.beginPath();
    ctx.arc(x + sx * s * 0.55, y + sy * s * 0.55, s * 0.5, sx > 0 ? (sy > 0 ? Math.PI : Math.PI * 1.5) : (sy > 0 ? Math.PI * 0.5 : 0), sx > 0 ? (sy > 0 ? Math.PI * 1.5 : Math.PI * 2) : (sy > 0 ? Math.PI : Math.PI * 0.5));
    ctx.stroke();
  }
}

/** Uap/asap mengepul. */
export function steam(ctx, x, y, t, color = 'rgba(255,255,255,0.85)') {
  for (let i = 0; i < 3; i++) {
    const k = (t * 1.4 + i / 3) % 1;
    E(ctx, x + (i - 1) * 9 + Math.sin(k * 6 + i) * 3, y - k * 26, 4 + k * 5, 4 + k * 5, { f: color.replace('0.85', String(0.85 * (1 - k))) });
  }
}

export function sparkle(ctx, x, y, s, color = 'rgba(255,215,0,0.85)') {
  ctx.save(); ctx.translate(x, y); ctx.fillStyle = color; ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s);
    ctx.lineTo(Math.cos(a + Math.PI / 4) * s * 0.35, Math.sin(a + Math.PI / 4) * s * 0.35);
  }
  ctx.closePath(); ctx.fill(); ctx.restore();
}

export function drop(ctx, x, y, s, color = 'rgba(120,190,255,0.9)') {
  ctx.fillStyle = color; ctx.beginPath();
  ctx.moveTo(x, y - s * 1.5);
  ctx.quadraticCurveTo(x + s, y + s * 0.3, x, y + s);
  ctx.quadraticCurveTo(x - s, y + s * 0.3, x, y - s * 1.5);
  ctx.fill();
}

export function text(ctx, str, x, y, size, color = '#1A1816', align = 'center') {
  ctx.font = `800 ${size}px system-ui, sans-serif`;
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
}

export function note(ctx, x, y, s, color) {
  ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(x, y, s * 0.55, s * 0.4, -0.4, 0, TAU); ctx.fill();
  line(ctx, [[x + s * 0.45, y - 1], [x + s * 0.45, y - s * 1.6], [x + s * 1.1, y - s * 1.2]], color, 2);
}

export function heart(ctx, x, y, s, color) {
  ctx.fillStyle = color; ctx.beginPath();
  ctx.moveTo(x, y + s * 0.8);
  ctx.bezierCurveTo(x - s * 1.4, y - s * 0.2, x - s * 0.6, y - s * 1.1, x, y - s * 0.35);
  ctx.bezierCurveTo(x + s * 0.6, y - s * 1.1, x + s * 1.4, y - s * 0.2, x, y + s * 0.8);
  ctx.fill();
}

/** Gelembung pikiran sederhana. */
export function bubble(ctx, x, y, w, h, color = 'rgba(255,255,255,0.95)') {
  E(ctx, x, y, w, h, { f: color, s: 'rgba(0,0,0,0.12)', lw: 1.5 });
  E(ctx, x - w * 0.55, y + h + 6, 4, 4, { f: color, s: 'rgba(0,0,0,0.12)', lw: 1 });
  E(ctx, x - w * 0.75, y + h + 14, 2.5, 2.5, { f: color, s: 'rgba(0,0,0,0.12)', lw: 1 });
}

export function blushPair(ctx, x, y, gap, r, rgb, a) {
  for (const sx of [-1, 1]) {
    const g = ctx.createRadialGradient(x + sx * gap, y, 1, x + sx * gap, y, r);
    g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x + sx * gap, y, r, 0, TAU); ctx.fill();
  }
}

export { TAU };
