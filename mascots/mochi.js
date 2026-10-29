// Mochi — "The Gentle Seraphim": tenang, polos, melayang. Semua 11 state, gaya sendiri.
import { E, A, line, limb, sparkle, drop, text, blushPair, TAU } from './core/draw_util.js';

const C = { white: '#FAF8F5', edge: '#E8E2D7', shade: '#ECE6DC', ink: '#1A1816', lime: '#A8E063', lime2: '#8FD358', stem: '#7BC47F', clover: '#34C759' };

export const mochi = {
  id: 'mochi',

  motion({ state, t, st }) {
    switch (state) {
      case 'gabut': {
        // Melayang anggun dalam kurva angka 8 halus
        return {
          x: Math.sin(t * 0.8) * 22,
          y: -22 + Math.sin(t * 1.6) * 12,
          roll: Math.cos(t * 0.8) * 0.12,
          sx: 1 + Math.sin(t * 1.6) * 0.02,
          sy: 1 - Math.sin(t * 1.6) * 0.02,
        };
      }
      case 'happy': {
        const j = Math.sin(t * 7.5);
        const inAir = j > 0.2;
        return {
          y: -Math.abs(j) * 22,
          roll: Math.sin(t * 5.5) * 0.08,
          sx: inAir ? 0.94 : 1.08,
          sy: inAir ? 1.06 : 0.92,
        };
      }
      case 'pet': {
        const purr = Math.sin(t * 3.5);
        return { y: purr * 2.5, roll: Math.sin(t * 2.5) * 0.03, sx: 1.08 + purr * 0.02, sy: 0.92 - purr * 0.02 };
      }
      case 'angry': return { x: Math.sin(t * 40) * 2.4, y: 1.5, sx: 1.06, sy: 0.98 };
      case 'sad': return { y: 9 + Math.sin(t * 1.4) * 2, sy: 0.96, roll: 0.02 };
      case 'surprised': return { y: -Math.abs(Math.sin(st * 7)) * 24 * Math.exp(-st * 1.4), sx: 0.92, sy: 1.1 };
      case 'listening': return { y: Math.sin(t * 2) * 3, roll: 0.07 };
      case 'thinking': return { y: Math.sin(t * 1.6) * 3.5, roll: Math.sin(t * 1.1) * 0.09 };
      case 'tap': return { y: -Math.abs(Math.sin(st * 10)) * 11 * Math.exp(-st * 3), sx: 1.08, sy: 0.92 };
      case 'greeting': return { y: -Math.abs(Math.sin(t * 6)) * 8, roll: Math.sin(t * 4) * 0.05 };
      case 'annoyed': return { x: Math.sin(t * 5) * 2.5, y: 3, roll: Math.sin(t * 5) * 0.03 };
      case 'celebrate': {
        const cj = Math.sin(t * 9);
        const isUp = cj > 0.2;
        return {
          y: -Math.abs(cj) * 22,
          roll: Math.sin(t * 7) * 0.1,
          sx: isUp ? 0.95 : 1.08,
          sy: isUp ? 1.06 : 0.92,
        };
      }
      case 'sleepy': {
        const sBreath = Math.sin(t * 1.1);
        return { y: 6 + sBreath * 2.5, sx: 1 + sBreath * 0.02, sy: 0.96 - sBreath * 0.02, roll: 0.06 };
      }
      default: { // idle
        const breath = Math.sin(t * 2.0);
        return {
          y: breath * 5,
          roll: Math.sin(t * 1.4) * 0.02,
          sx: 1 + breath * 0.015,
          sy: 1 - breath * 0.015,
        };
      }
    }
  },

  draw(ctx, p) {
    const { state: s, t, st } = p;
    const fx = p.yaw * 22, fy = p.pitch * 16;
    const blink = p.blink > 0 && !['pet', 'sad', 'gabut', 'happy', 'surprised'].includes(s);

    fxBack(ctx, s, t, st, fx, fy);

    // 1. jubah
    const dg = ctx.createLinearGradient(0, 20, 0, 105);
    dg.addColorStop(0, '#FFFFFF'); dg.addColorStop(0.7, C.white); dg.addColorStop(1, C.shade);
    ctx.fillStyle = dg;
    ctx.beginPath();
    ctx.moveTo(-42, 28);
    ctx.bezierCurveTo(-45, 55, -78, 85, -72, 105);
    ctx.bezierCurveTo(-35, 114, 35, 114, 72, 105);
    ctx.bezierCurveTo(78, 85, 45, 55, 42, 28);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#DFD7CA'; ctx.lineWidth = 2.5; ctx.stroke();

    // 2. lengan + semanggi
    const tipR = arms(ctx, s, t);
    clover(ctx, tipR[0] + 6, tipR[1] - 2, s === 'thinking' ? 0.8 : 1);

    // 3. kerah
    E(ctx, 0, 25, 46, 10, { f: '#F2EDE5', s: '#E3DDD3', lw: 2 });
    E(ctx, 0, 18, 40, 9, { f: '#F2EDE5', s: '#E3DDD3', lw: 2 });

    // 4. tudung + wajah
    const hg = ctx.createRadialGradient(fx - 15, -28 + fy, 15, 0, -18, 76);
    hg.addColorStop(0, '#FFFFFF'); hg.addColorStop(0.75, C.white); hg.addColorStop(1, '#E6E0D6');
    E(ctx, 0, -22, 68, 68, { f: hg });
    E(ctx, fx * 0.4, -22 + fy * 0.3, 55, 58, { s: C.edge, lw: 4 });
    const fg = ctx.createRadialGradient(fx, -20 + fy, 8, fx, -20 + fy, 52);
    fg.addColorStop(0, '#FFFFFF'); fg.addColorStop(0.85, '#FFFBF6'); fg.addColorStop(1, '#F4EDE2');
    E(ctx, fx * 0.6, -22 + fy * 0.5, 52, 53, { f: fg });

    // 5. pipi
    const bo = { pet: 0.95, sad: 0.25, gabut: 0.4, angry: 0.9 }[s] ?? 0.75;
    blushPair(ctx, fx, -14 + fy, 30, s === 'pet' ? 14 : 12, '255,170,166', bo);

    face(ctx, s, t, st, fx, fy, blink);

    // 6. tunas kembar
    sprout(ctx, s, t, fx);

    // sad: tudung turun menutupi separuh mata
    if (s === 'sad') {
      const g = ctx.createLinearGradient(0, -80, 0, -20);
      g.addColorStop(0, '#FFFFFF'); g.addColorStop(1, '#EDE7DC');
      E(ctx, fx * 0.5, -52 + fy * 0.4, 58, 29, { f: g, s: C.edge, lw: 3 });
    }

    fxFront(ctx, s, t, st, fx, fy);
  },
};

// ---------- lengan ----------
// a = seberapa jauh lengan terangkat keluar (0 = turun, 1.57 = datar, >1.57 = naik)
function arm(ctx, side, a, len = 26, w = 20) {
  return limb(ctx, side * 44, 40, -side * a, len, w, C.white, '#E2DBD0');
}
function arms(ctx, s, t) {
  let l = 0.45, r = 0.45, tipR;
  if (s === 'gabut') { l = 0.95 + Math.sin(t * 1.7) * 0.25; r = 0.95 + Math.sin(t * 1.7 + 1) * 0.25; }
  else if (s === 'tap') { l = r = 0.9; }
  else if (s === 'pet') { l = r = 0.3; }
  else if (s === 'happy') { l = 2.5 + Math.sin(t * 12) * 0.15; r = 2.5 - Math.sin(t * 12) * 0.15; }
  else if (s === 'sad') { l = r = 0.1; }
  else if (s === 'surprised') { l = r = 2.2; }
  else if (s === 'listening') { l = 0.4; r = 1.0; }
  else if (s === 'greeting') { r = 2.4 + Math.sin(t * 9) * 0.35; }

  arm(ctx, -1, l);
  if (s === 'angry') {
    // tolak pinggang: lengan atas keluar, lengan bawah kembali ke pinggang
    arm(ctx, -1, 1.3, 14, 18); limb(ctx, -44 - 14 * Math.sin(1.3) * 1, 40 + 14 * Math.cos(1.3), 0.35, 14, 17, C.white, '#E2DBD0');
    const tip = arm(ctx, 1, 1.3, 14, 18); limb(ctx, tip[0], tip[1], -0.35, 14, 17, C.white, '#E2DBD0');
    tipR = [tip[0] - 4, tip[1] + 12];
  } else if (s === 'thinking') {
    const u = arm(ctx, 1, 0.9, 18, 18);
    tipR = limb(ctx, u[0], u[1], 2.5, 22, 17, C.white, '#E2DBD0'); // tangan ke dagu
  } else {
    tipR = arm(ctx, 1, r);
  }
  return tipR;
}

function clover(ctx, x, y, k = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  ctx.fillStyle = C.clover;
  for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); E(ctx, 0, -6, 5, 7, { f: C.clover }); }
  ctx.restore();
}

// ---------- wajah ----------
function pill(ctx, x, y, rx = 4.5, ry = 8.5, hl = true) {
  E(ctx, x, y, rx, ry, { f: C.ink });
  if (hl) E(ctx, x + 1.2, y - ry * 0.3, 1.8, 1.8, { f: '#FFF' });
}
function crescent(ctx, x, y) { A(ctx, x, y + 3, 6, Math.PI * 1.15, Math.PI * 1.85, C.ink, 3.5); }

function face(ctx, s, t, st, fx, fy, blink) {
  const ex = 20, ey = -24 + fy, L = -ex + fx, R = ex + fx, mx = fx, my = -12 + fy;
  ctx.lineCap = 'round';
  ctx.strokeStyle = C.ink; ctx.fillStyle = C.ink;

  // mata
  if (s === 'pet' || (s === 'happy' && Math.sin(t * 8) > 0)) { crescent(ctx, L, ey); crescent(ctx, R, ey); }
  else if (s === 'angry') {
    pill(ctx, L, ey + 2, 3.8, 6, false); pill(ctx, R, ey + 2, 3.8, 6, false);
    line(ctx, [[L - 9, ey - 10], [L + 6, ey - 3]], C.ink, 3); line(ctx, [[R + 9, ey - 10], [R - 6, ey - 3]], C.ink, 3);
  } else if (s === 'sad') {
    pill(ctx, L, ey + 2, 5, 8); pill(ctx, R, ey + 2, 5, 8);
    line(ctx, [[L - 7, ey - 4], [L + 5, ey - 11]], C.ink, 2.5); line(ctx, [[R + 7, ey - 4], [R - 5, ey - 11]], C.ink, 2.5);
  } else if (s === 'surprised') {
    for (const x of [L, R]) { E(ctx, x, ey, 10, 10, { f: '#FFF', s: C.ink, lw: 2 }); E(ctx, x, ey, 3.2, 3.2, { f: C.ink }); }
  } else if (s === 'gabut') {
    for (const x of [L, R]) { E(ctx, x, ey - 2, 4.5, 7.5, { f: C.ink }); sparkle(ctx, x + 1.5, ey - 4, 3, '#FFF'); }
  } else if (s === 'listening') {
    pill(ctx, L, ey, 5.5, 10); pill(ctx, R, ey, 5.5, 10);
  } else if (s === 'thinking') {
    pill(ctx, L - 3, ey - 3, 4.5, 8); pill(ctx, R - 3, ey - 3, 4.5, 8);
    line(ctx, [[R - 10, ey - 15], [R + 4, ey - 18]], C.ink, 2.5); // satu alis terangkat
  } else if (s === 'annoyed') {
    pill(ctx, L, ey + 1, 4.5, 8); pill(ctx, R, ey + 1, 4.5, 8);
    line(ctx, [[L - 8, ey - 8], [L + 6, ey - 3]], C.ink, 2.5); // alis kiri turun
    line(ctx, [[R + 8, ey - 8], [R - 6, ey - 3]], C.ink, 2.5); // alis kanan turun (V shape)
  } else if (s === 'celebrate') {
    crescent(ctx, L, ey); crescent(ctx, R, ey); // mata bulan sama seperti happy
  } else if (s === 'sleepy') {
    // mata setengah tutup — elips kecil
    E(ctx, L, ey + 3, 4.5, 4, { f: C.ink });
    E(ctx, R, ey + 3, 4.5, 4, { f: C.ink });
    // kelopak atas (garis tutup setengah)
    ctx.beginPath(); ctx.moveTo(L - 6, ey + 1); ctx.lineTo(L + 6, ey + 1); ctx.strokeStyle = C.ink; ctx.lineWidth = 3.5; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(R - 6, ey + 1); ctx.lineTo(R + 6, ey + 1); ctx.stroke();
  } else if (blink) {
    line(ctx, [[L - 5, ey], [L + 5, ey]], C.ink, 3); line(ctx, [[R - 5, ey], [R + 5, ey]], C.ink, 3);
  } else { pill(ctx, L, ey); pill(ctx, R, ey); }

  // mulut
  if (s === 'sad') A(ctx, mx, my + 5, 5, Math.PI * 1.2, Math.PI * 1.8, C.ink, 2.5);
  else if (s === 'angry') {
    A(ctx, mx, my + 4, 4.5, Math.PI * 1.15, Math.PI * 1.85, C.ink, 2.5);
    E(ctx, fx - 33, my - 2, 11, 11, { f: 'rgba(255,170,166,0.9)', s: '#F5A19C', lw: 1.5 }); // pipi menggembung
    E(ctx, fx + 33, my - 2, 11, 11, { f: 'rgba(255,170,166,0.9)', s: '#F5A19C', lw: 1.5 });
  }
  else if (s === 'surprised') E(ctx, mx, my + 1, 4.5, 6.5, { f: C.ink });
  else if (s === 'gabut') E(ctx, mx, my + 1, 3, 4.5, { f: C.ink });
  else if (s === 'tap') E(ctx, mx, my, 3, 3.5, { f: C.ink });
  else if (s === 'listening') E(ctx, mx, my + 1, 2.5, 3, { f: C.ink });
  else if (s === 'thinking') line(ctx, [[mx - 5, my + 1], [mx - 1, my - 1], [mx + 3, my + 2], [mx + 6, my]], C.ink, 2.5);
  else if (s === 'annoyed') line(ctx, [[mx - 6, my], [mx + 6, my]], C.ink, 2.5); // datar kesel
  else if (s === 'celebrate') { ctx.beginPath(); ctx.arc(mx, my - 2, 8, 0.1, Math.PI - 0.1); ctx.fill(); } // super lebar
  else if (s === 'sleepy') A(ctx, mx, my, 4, 0.3, Math.PI - 0.3, C.ink, 2); // senyum kecil ngantuk
  else if (s === 'happy' || s === 'greeting' || s === 'pet') {
    ctx.beginPath(); ctx.arc(mx, my - 2, s === 'happy' ? 7 : 6, 0.1, Math.PI - 0.1); ctx.fill();
  } else A(ctx, mx, my - 3, 5.5, 0.25, Math.PI - 0.25, C.ink, 2.5);
}

// ---------- tunas ----------
function sprout(ctx, s, t, fx) {
  let rot, spread = 0.5;
  if (s === 'sad') { rot = Math.sin(t * 1.2) * 0.03 + 0.22; spread = 0.15; }
  else if (s === 'gabut') { rot = Math.sin(t * 1.0) * 0.06 + 0.1; spread = 0.4; }
  else if (s === 'listening') { rot = Math.sin(t * 40) * 0.05; spread = 0.25; } // tegak bergetar seperti antena
  else if (s === 'surprised') { rot = 0; spread = 0.9; }
  else if (s === 'happy') rot = Math.sin(t * 3) * 0.12 + Math.sin(t * 24) * 0.18;
  else if (s === 'thinking') { rot = Math.sin(t * 2) * 0.25; spread = 0.7; }
  else rot = Math.sin(t * 3) * 0.12;
  ctx.save();
  ctx.translate(fx * 0.2, -90 + (s === 'sad' ? 8 : 0)); ctx.rotate(rot);
  ctx.fillStyle = C.stem; ctx.fillRect(-2.5, 0, 5, 14);
  for (const side of [-1, 1]) {
    ctx.save(); ctx.translate(side * 2, 2); ctx.rotate(side * spread);
    E(ctx, side * 11, 0, 15, 7.5, { f: side < 0 ? C.lime : C.lime2 });
    E(ctx, side * 13, -2, 6, 2.5, { f: 'rgba(255,255,255,0.35)', rot: side * 0.3 });
    ctx.restore();
  }
  ctx.restore();
}

// ---------- efek ----------
function fxBack(ctx, s, t, st, fx, fy) {
  if (s === 'listening') {
    for (let i = 0; i < 3; i++) {
      const k = (t * 1.3 + i / 3) % 1;
      A(ctx, 0, -98, 14 + k * 30, Math.PI * 1.15, Math.PI * 1.85, `rgba(0,122,255,${0.7 * (1 - k)})`, 3);
    }
  }
  if (s === 'thinking') {
    for (let i = 0; i < 3; i++) {
      const a = t * 1.4 + i * TAU / 3;
      sparkle(ctx, Math.cos(a) * 82, -30 + Math.sin(a) * 28, 6 + Math.sin(t * 4 + i) * 2, 'rgba(175,82,222,0.85)');
    }
  }
  if (s === 'happy') {
    for (let i = 0; i < 4; i++) {
      const a = t * 2 + i * Math.PI / 2;
      sparkle(ctx, Math.cos(a) * 72 + fx * 0.4, Math.sin(a) * 25 - 35 + Math.sin(t * 3 + i) * 5, 6 + Math.sin(t * 5) * 3);
    }
  }
}

function fxFront(ctx, s, t, st, fx, fy) {
  if (s === 'sad') {
    const o = (Math.sin(t * 4) + 1) * 3;
    drop(ctx, -22 + fx, -4 + fy + o, 3);
    drop(ctx, 22 + fx, -4 + fy + o * 0.6, 2.5);
  }
  if (s === 'surprised') {
    drop(ctx, 50, -52 + Math.sin(t * 5) * 4, 4, 'rgba(120,190,255,0.85)');
    text(ctx, '!', -58, -78, 26, '#FF9500');
  }
  if (s === 'gabut') {
    text(ctx, '…', 56 + fx * 0.5, -84 + Math.sin(t * 3) * 3, 22, 'rgba(80,70,60,0.5)');
    sparkle(ctx, -70 + Math.sin(t) * 6, -20 + Math.cos(t * 1.3) * 10, 4, 'rgba(168,224,99,0.9)');
    sparkle(ctx, 74 + Math.cos(t) * 6, 20 + Math.sin(t * 1.1) * 10, 3.5, 'rgba(168,224,99,0.9)');
  }
  if (s === 'angry') {
    ctx.save(); ctx.translate(48, -66);
    ctx.strokeStyle = '#FF9500'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (const r of [-1, 1]) { line(ctx, [[r * 4, -10], [r * 4, 10]], '#FF9500', 3); line(ctx, [[-10, r * 4], [10, r * 4]], '#FF9500', 3); }
    ctx.restore();
  }
  if (s === 'celebrate') {
    const cols = ['#FF3B30', '#FF9500', '#34C759', '#007AFF', '#AF52DE'];
    for (let i = 0; i < 6; i++) {
      const a = t * 2.5 + i * Math.PI / 3;
      sparkle(ctx, Math.cos(a) * 80, -40 + Math.sin(a) * 32, 7 + Math.sin(t * 5 + i) * 3, cols[i % cols.length]);
    }
    text(ctx, '🎉', 0, -100, 28);
  }
  if (s === 'annoyed') {
    // tanda seru kecil di atas kepala
    text(ctx, '!', 58, -88, 20, 'rgba(255,59,48,0.85)');
  }
  if (s === 'sleepy') {
    // zZz melayang ke kanan atas
    const zx = 62 + Math.sin(t * 0.8) * 4, zy = -80 - t % 3 * 8;
    text(ctx, 'z', zx, zy, 14, 'rgba(80,80,120,0.6)');
    text(ctx, 'Z', zx + 10, zy - 14, 18, 'rgba(80,80,120,0.45)');
    text(ctx, 'Z', zx + 22, zy - 30, 22, 'rgba(80,80,120,0.3)');
  }
}
