// Bumi — "The Cheerful Yobao" / "The Warm Sunflower"
// Animasi organik dengan pernapasan kenyal (gelatinous bounce),
// dinamika hembusan angin kincir, daun bergoyang halus, dan ekspresi hangat.

const TAU = Math.PI * 2;

export const bumi = {
  id: 'bumi',

  motion({ state: s, t, st }) {
    switch (s) {
      case 'gabut': {
        // Duduk santai, sedikit miring mengamati putaran kincir
        const blow = Math.sin(t * 2.4);
        return {
          y: Math.sin(t * 1.8) * 3,
          roll: 0.04 + Math.sin(t * 1.8) * 0.02,
          sx: 1 + blow * 0.02,
          sy: 1 - blow * 0.02,
        };
      }
      case 'happy': {
        const jPhase = Math.sin(t * 7.5);
        const inAir = jPhase > 0.2;
        return {
          y: -Math.abs(jPhase) * 20,
          roll: Math.sin(t * 5) * 0.07,
          sx: inAir ? 0.94 : 1.09,
          sy: inAir ? 1.07 : 0.91,
        };
      }
      case 'pet': {
        const squish = Math.sin(t * 3.5) * 0.02;
        return {
          y: Math.sin(t * 3.5) * 2,
          sx: 1.09 + squish,
          sy: 0.91 - squish,
          roll: Math.sin(t * 2.5) * 0.02,
        };
      }
      case 'angry': {
        const quiver = Math.sin(t * 38) * 2.6;
        return { x: quiver, y: 1, sx: 1.09, sy: 0.98 };
      }
      case 'sad': {
        return { y: 9 + Math.sin(t * 1.4) * 2, sy: 0.96, roll: 0.02 };
      }
      case 'surprised': {
        return { y: -Math.abs(Math.sin(st * 7)) * 22 * Math.exp(-st * 1.4), sx: 0.92, sy: 1.1 };
      }
      case 'listening': {
        return { y: Math.sin(t * 2) * 3, roll: 0.07 };
      }
      case 'thinking': {
        return { y: Math.sin(t * 1.6) * 3.5, roll: Math.sin(t * 1.1) * 0.09 };
      }
      case 'tap': {
        return { y: -Math.abs(Math.sin(st * 10)) * 12 * Math.exp(-st * 3), sx: 1.09, sy: 0.91 };
      }
      case 'greeting': {
        return { y: -Math.abs(Math.sin(t * 6)) * 9, roll: Math.sin(t * 4) * 0.05 };
      }
      case 'annoyed': {
        return { x: Math.sin(t * 5) * 2.5, y: 3, roll: Math.sin(t * 5) * 0.03 };
      }
      case 'celebrate': {
        const cJump = Math.sin(t * 8.5);
        const isUp = cJump > 0.2;
        return {
          y: -Math.abs(cJump) * 22,
          roll: Math.sin(t * 6.5) * 0.1,
          sx: isUp ? 0.95 : 1.08,
          sy: isUp ? 1.06 : 0.92,
        };
      }
      case 'sleepy': {
        const sBreath = Math.sin(t * 1.1);
        return {
          y: 7 + sBreath * 2.5,
          sx: 1 + sBreath * 0.02,
          sy: 0.96 - sBreath * 0.02,
          roll: 0.07,
        };
      }
      default: { // idle
        const breath = Math.sin(t * 2.0);
        return {
          y: breath * 4.5,
          roll: Math.sin(t * 1.4) * 0.02,
          sx: 1 + breath * 0.015,
          sy: 1 - breath * 0.015,
        };
      }
    }
  },

  draw(ctx, p) {
    const { state: s, t, st } = p;
    const fx = p.yaw * 20;
    const fy = p.pitch * 14;
    const blink = p.blink > 0 && !['pet', 'sad', 'happy', 'surprised', 'celebrate'].includes(s);

    // ===== 1. EFEK BELAKANG =====
    drawBackFx(ctx, s, t, fx);

    // ===== 2. KAKI (FEET) =====
    drawFeet(ctx);

    // ===== 3. TUBUH PIR MONTOK (CHUBBY PEAR BODY) =====
    drawBody(ctx, fx, fy);

    // ===== 4. TOPI KELOPAK BUNGA (FLOWER PETAL HAT) =====
    drawPetalHat(ctx, fx, fy);

    // ===== 5. TANGKAI HIJAU & DAUN BERGOYANG HALUS =====
    drawHatStemAndLeaf(ctx, t, fx, fy);

    // ===== 6. PIPI MERONA (ROSY CHEEKS) =====
    drawCheeks(ctx, s, fx, fy);

    // ===== 7. MATA BULAT BERKILAU =====
    drawEyes(ctx, s, t, st, fx, fy, blink);

    // ===== 8. MULUT CERIA / EKSPRESI =====
    drawMouth(ctx, s, fx, fy);

    // ===== 9. TANGAN / LENGAN =====
    drawArms(ctx, s, t, fx, fy);

    // ===== 10. GABUT: KINCIR ANGIN (PINWHEEL) DINAMIKA ANGIN =====
    if (s === 'gabut') {
      drawPinwheel(ctx, t, fx, fy);
    }

    // ===== 11. EFEK DEPAN =====
    drawFrontFx(ctx, s, t, fx, fy);
  }
};

// --- FEET ---
function drawFeet(ctx) {
  ctx.save();
  ctx.fillStyle = '#E59500';
  ctx.beginPath();
  ctx.ellipse(-26, 68, 14, 10, 0, 0, TAU);
  ctx.ellipse(26, 68, 14, 10, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// --- BODY ---
function drawBody(ctx, fx, fy) {
  ctx.save();
  const bodyGrad = ctx.createRadialGradient(fx - 15, -10 + fy, 15, 0, 0, 78);
  bodyGrad.addColorStop(0, '#FFE875');
  bodyGrad.addColorStop(0.7, '#FFD23F');
  bodyGrad.addColorStop(1, '#E5A510');
  ctx.fillStyle = bodyGrad;

  // Bentuk pir montok khas Yobao
  ctx.beginPath();
  ctx.moveTo(-45, 10);
  ctx.bezierCurveTo(-55, 35, -60, 60, -40, 70);
  ctx.bezierCurveTo(-20, 75, 20, 75, 40, 70);
  ctx.bezierCurveTo(60, 60, 55, 35, 45, 10);
  ctx.bezierCurveTo(35, -30, -35, -30, -45, 10);
  ctx.closePath();
  ctx.fill();

  // Highlight perut lembut
  ctx.fillStyle = 'rgba(255, 250, 220, 0.45)';
  ctx.beginPath();
  ctx.ellipse(fx * 0.2, 42 + fy * 0.2, 28, 22, 0, 0, TAU);
  ctx.fill();

  ctx.restore();
}

// --- FLOWER PETAL HAT ---
function drawPetalHat(ctx, fx, fy) {
  ctx.save();
  const hatGrad = ctx.createRadialGradient(fx * 0.3, -40 + fy * 0.3, 10, 0, -45, 92);
  hatGrad.addColorStop(0, '#FFE366');
  hatGrad.addColorStop(0.7, '#FFB703');
  hatGrad.addColorStop(1, '#D97706');
  ctx.fillStyle = hatGrad;
  ctx.strokeStyle = '#D97706';
  ctx.lineWidth = 2.5;

  ctx.beginPath();
  ctx.moveTo(-75 + fx * 0.2, -8 + fy * 0.2);
  ctx.quadraticCurveTo(-85, -46, -45, -60);
  ctx.quadraticCurveTo(-15, -74, 0, -62);
  ctx.quadraticCurveTo(15, -74, 45, -60);
  ctx.quadraticCurveTo(85, -46, 75 + fx * 0.2, -8 + fy * 0.2);
  ctx.quadraticCurveTo(40, -22, 0, -20);
  ctx.quadraticCurveTo(-40, -22, -75 + fx * 0.2, -8 + fy * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Lipatan kelopak
  ctx.beginPath();
  ctx.moveTo(-40, -58); ctx.quadraticCurveTo(-45, -38, -40, -18);
  ctx.moveTo(40, -58); ctx.quadraticCurveTo(45, -38, 40, -18);
  ctx.stroke();

  ctx.restore();
}

// --- HAT STEM & LEAF (dengan goyangan halus) ---
function drawHatStemAndLeaf(ctx, t, fx, fy) {
  ctx.save();
  ctx.translate(fx * 0.2, -62);

  // Tangkai hijau tegak
  ctx.fillStyle = '#4CAF50';
  ctx.fillRect(-3, -16, 6, 18);

  // Daun hijau segar dengan inersia ayunan halus
  const leafFlutter = Math.sin(t * 3.2) * 0.12;
  ctx.beginPath();
  ctx.ellipse(9, -12, 10, 5, 0.45 + leafFlutter, 0, TAU);
  ctx.fill();

  // Bunga mekar kecil di topi
  ctx.fillStyle = '#FFD23F';
  ctx.strokeStyle = '#E5A510';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    ctx.beginPath();
    ctx.ellipse(-14 + Math.cos(a) * 5, -6 + Math.sin(a) * 5, 5, 6, a, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = '#FFA000';
  ctx.beginPath();
  ctx.arc(-14, -6, 3, 0, TAU);
  ctx.fill();

  ctx.restore();
}

// --- CHEEKS ---
function drawCheeks(ctx, s, fx, fy) {
  ctx.save();
  const blushOpacity = s === 'pet' ? 0.95 : (s === 'sad' ? 0.25 : (s === 'angry' ? 0.9 : 0.7));
  const blushColor = s === 'angry' ? '255, 82, 82' : '255, 140, 112';

  const leftB = ctx.createRadialGradient(-32 + fx, 12 + fy, 2, -32 + fx, 12 + fy, 14);
  leftB.addColorStop(0, `rgba(${blushColor}, ${blushOpacity})`);
  leftB.addColorStop(1, `rgba(${blushColor}, 0)`);
  ctx.fillStyle = leftB;
  ctx.beginPath();
  ctx.arc(-32 + fx, 12 + fy, 14, 0, TAU);
  ctx.fill();

  const rightB = ctx.createRadialGradient(32 + fx, 12 + fy, 2, 32 + fx, 12 + fy, 14);
  rightB.addColorStop(0, `rgba(${blushColor}, ${blushOpacity})`);
  rightB.addColorStop(1, `rgba(${blushColor}, 0)`);
  ctx.fillStyle = rightB;
  ctx.beginPath();
  ctx.arc(32 + fx, 12 + fy, 14, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// --- EYES ---
function drawEyes(ctx, s, t, st, fx, fy, blink) {
  ctx.save();
  ctx.fillStyle = '#261C08';
  ctx.strokeStyle = '#261C08';
  const exL = -20 + fx;
  const exR = 20 + fx;
  const ey = 0 + fy;

  if (s === 'pet' || (s === 'happy' && Math.sin(t * 8) > 0) || s === 'celebrate') {
    ctx.lineWidth = 3.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(exL, ey + 2, 7, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(exR, ey + 2, 7, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  } else if (s === 'angry') {
    ctx.lineWidth = 3.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(exL - 8, ey - 6); ctx.lineTo(exL + 7, ey + 1);
    ctx.moveTo(exR + 8, ey - 6); ctx.lineTo(exR - 7, ey + 1);
    ctx.stroke();
  } else if (s === 'surprised') {
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(exL, ey, 10, 0, TAU);
    ctx.arc(exR, ey, 10, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#261C08';
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.fillStyle = '#261C08';
    ctx.beginPath();
    ctx.arc(exL, ey, 3.5, 0, TAU);
    ctx.arc(exR, ey, 3.5, 0, TAU);
    ctx.fill();
  } else if (s === 'gabut') {
    // Mata lembut berbinar senang melihat kincir
    ctx.beginPath();
    ctx.arc(exL + 1.5, ey, 6.5, 0, TAU);
    ctx.arc(exR + 1.5, ey, 6.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(exL + 3.2, ey - 2, 2.3, 0, TAU);
    ctx.arc(exR + 3.2, ey - 2, 2.3, 0, TAU);
    ctx.fill();
  } else if (s === 'greeting') {
    ctx.beginPath();
    ctx.arc(exL, ey, 6.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(exL + 1.8, ey - 2, 2.2, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = '#261C08';
    ctx.lineWidth = 3.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(exR, ey + 2, 7, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  } else if (s === 'thinking') {
    ctx.beginPath();
    ctx.arc(exL - 1, ey - 2, 6.5, 0, TAU);
    ctx.arc(exR - 1, ey - 2, 6.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(exL + 0.8, ey - 4, 2.2, 0, TAU);
    ctx.arc(exR + 0.8, ey - 4, 2.2, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#261C08';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(exR - 5, ey - 10); ctx.lineTo(exR + 5, ey - 13);
    ctx.stroke();
  } else if (s === 'annoyed') {
    ctx.beginPath();
    ctx.ellipse(exL, ey + 1, 6.5, 4.5, 0, 0, TAU);
    ctx.ellipse(exR, ey + 1, 6.5, 4.5, 0, 0, TAU);
    ctx.fill();
  } else if (s === 'sleepy') {
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(exL, ey + 2, 6.5, 0.2, Math.PI - 0.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(exR, ey + 2, 6.5, 0.2, Math.PI - 0.2);
    ctx.stroke();
  } else if (blink) {
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(exL - 6, ey); ctx.lineTo(exL + 6, ey);
    ctx.moveTo(exR - 6, ey); ctx.lineTo(exR + 6, ey);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(exL, ey, 6.8, 0, TAU);
    ctx.arc(exR, ey, 6.8, 0, TAU);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(exL + 2, ey - 2, 2.4, 0, TAU);
    ctx.arc(exR + 2, ey - 2, 2.4, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

// --- MOUTH ---
function drawMouth(ctx, s, fx, fy) {
  ctx.save();
  ctx.strokeStyle = '#261C08';
  ctx.fillStyle = '#261C08';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  const mx = fx * 0.7;
  const my = 12 + fy * 0.7;

  if (s === 'sad') {
    ctx.beginPath();
    ctx.arc(mx, my + 5, 5, Math.PI * 1.2, Math.PI * 1.8);
    ctx.stroke();
  } else if (s === 'angry') {
    ctx.beginPath();
    ctx.moveTo(mx - 8, my);
    for (let i = 0; i < 4; i++) {
      ctx.lineTo(mx - 8 + (i + 0.5) * 4, my + (i % 2 === 0 ? 4 : 0));
      ctx.lineTo(mx - 8 + (i + 1) * 4, my);
    }
    ctx.stroke();
  } else if (s === 'surprised') {
    ctx.beginPath();
    ctx.ellipse(mx, my + 1, 5, 6.5, 0, 0, TAU);
    ctx.fill();
  } else if (s === 'gabut') {
    // Mulut bersiul kecil "o" meniup kincir
    ctx.beginPath();
    ctx.arc(mx, my + 1, 3.8, 0, TAU);
    ctx.stroke();
  } else if (s === 'greeting' || s === 'happy' || s === 'celebrate') {
    ctx.beginPath();
    ctx.arc(mx, my - 1, 7.5, 0.1, Math.PI - 0.1);
    ctx.fill();
    ctx.fillStyle = '#FF8FA3';
    ctx.beginPath();
    ctx.ellipse(mx, my + 3, 4, 2.5, 0, 0, Math.PI);
    ctx.fill();
  } else if (s === 'annoyed') {
    ctx.beginPath();
    ctx.moveTo(mx - 6, my + 2); ctx.lineTo(mx + 6, my + 2);
    ctx.stroke();
  } else if (s === 'sleepy') {
    ctx.beginPath();
    ctx.arc(mx, my, 4, 0.2, Math.PI - 0.2);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(mx, my - 2, 5.5, 0.2, Math.PI - 0.2);
    ctx.stroke();
  }
  ctx.restore();
}

// --- ARMS ---
function drawArms(ctx, s, t, fx, fy) {
  ctx.save();
  ctx.fillStyle = '#FFD23F';
  ctx.strokeStyle = '#E5A510';
  ctx.lineWidth = 2;

  if (s === 'greeting') {
    const wave = Math.sin(t * 10) * 0.25;
    ctx.save();
    ctx.translate(38, 8);
    ctx.rotate(-1.1 + wave);
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 22, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.beginPath();
    ctx.ellipse(-38, 28, 11, 18, 0.7, 0, TAU);
    ctx.fill();
    ctx.stroke();
  } else if (s === 'celebrate') {
    ctx.beginPath();
    ctx.ellipse(-36, 0, 10, 20, 0.6, 0, TAU);
    ctx.ellipse(36, 0, 10, 20, -0.6, 0, TAU);
    ctx.fill();
    ctx.stroke();
  } else if (s === 'thinking') {
    ctx.beginPath();
    ctx.ellipse(26, 20, 10, 18, -1.2, 0, TAU);
    ctx.ellipse(-38, 28, 11, 18, 0.7, 0, TAU);
    ctx.fill();
    ctx.stroke();
  } else if (s === 'gabut') {
    // Tangan kanan memegang batang kincir dengan stabil
    ctx.beginPath();
    ctx.ellipse(32, 22, 10, 18, -0.6, 0, TAU);
    ctx.ellipse(-38, 28, 11, 18, 0.7, 0, TAU);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.ellipse(-38, 28, 11, 18, 0.7, 0, TAU);
    ctx.ellipse(38, 28, 11, 18, -0.7, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

// --- PINWHEEL (GABUT: DINAMIKA ANGIN ALAMI) ---
function drawPinwheel(ctx, t, fx, fy) {
  ctx.save();
  const hx = 44 + fx * 0.4;
  const hy = -18 + fy * 0.4;

  // Batang kayu
  ctx.strokeStyle = '#8D6E63';
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(hx - 5, hy + 45);
  ctx.lineTo(hx, hy);
  ctx.stroke();

  // Pusat putaran kincir dengan variasi kecepatan hembusan angin
  const spinAngle = t * 5.2 + Math.sin(t * 2.4) * 1.5;

  ctx.translate(hx, hy);
  ctx.rotate(spinAngle);

  // 4 Bilah kincir warna-warni
  const colors = ['#FF5252', '#00B0FF', '#76FF03', '#FFD600'];
  for (let i = 0; i < 4; i++) {
    ctx.save();
    ctx.rotate(i * Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(16, 0);
    ctx.bezierCurveTo(16, -12, 6, -16, 0, -14);
    ctx.closePath();
    ctx.fillStyle = colors[i];
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  // Pin tengah
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#8D6E63';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
}

// --- BACK EFFECTS ---
function drawBackFx(ctx, s, t, fx) {
  if (s === 'happy' || s === 'celebrate') {
    ctx.save();
    for (let i = 0; i < 6; i++) {
      const a = t * 1.6 + i * TAU / 6;
      const r = 72 + Math.sin(t * 3 + i) * 12;
      const px = Math.cos(a) * r + fx * 0.3;
      const py = Math.sin(a) * 28 - 25 + Math.sin(t * 2 + i * 2) * 8;
      ctx.fillStyle = `rgba(255, 195, 30, ${0.5 + Math.sin(t * 2 + i) * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(px, py, 5, 9, a * 0.6, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  } else if (s === 'listening') {
    ctx.save();
    for (let i = 0; i < 3; i++) {
      const k = (t * 1.3 + i / 3) % 1;
      ctx.strokeStyle = `rgba(255, 170, 0, ${0.75 * (1 - k)})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, -85, 14 + k * 32, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// --- FRONT EFFECTS ---
function drawFrontFx(ctx, s, t, fx, fy) {
  if (s === 'angry') {
    ctx.save();
    ctx.strokeStyle = '#E53935';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    const px = 46 + fx * 0.3, py = -78 + Math.sin(t * 10) * 3;
    ctx.beginPath();
    ctx.moveTo(px - 7, py - 7); ctx.lineTo(px + 7, py + 7);
    ctx.moveTo(px + 7, py - 7); ctx.lineTo(px - 7, py + 7);
    ctx.stroke();

    ctx.fillStyle = 'rgba(230, 230, 230, 0.75)';
    for (let i = 0; i < 3; i++) {
      const sx = -40 + i * 20 + Math.sin(t * 6 + i) * 4;
      const sy = -80 - ((t * 30 + i * 20) % 40);
      ctx.beginPath();
      ctx.arc(sx, sy, 4 + i, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  } else if (s === 'sad') {
    ctx.save();
    ctx.fillStyle = 'rgba(120, 190, 255, 0.9)';
    const tOff = (Math.sin(t * 4) + 1) * 3;
    ctx.beginPath();
    ctx.ellipse(-20 + fx - 2, 14 + fy + tOff, 3, 5.5, 0, 0, TAU);
    ctx.ellipse(20 + fx + 2, 14 + fy + tOff * 0.6, 2.5, 4.5, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  } else if (s === 'surprised') {
    ctx.save();
    ctx.fillStyle = 'rgba(120, 190, 255, 0.85)';
    const dropX = 42 + fx * 0.4, dropY = -55 + Math.sin(t * 5) * 4;
    ctx.beginPath();
    ctx.moveTo(dropX, dropY - 10);
    ctx.quadraticCurveTo(dropX + 7, dropY + 2, dropX, dropY + 6);
    ctx.quadraticCurveTo(dropX - 7, dropY + 2, dropX, dropY - 10);
    ctx.fill();
    ctx.font = '800 24px sans-serif';
    ctx.fillStyle = '#FF9500';
    ctx.fillText('!', -54, -75);
    ctx.restore();
  } else if (s === 'celebrate') {
    ctx.save();
    const cols = ['#FF6B6B', '#4ECDC4', '#FFD93D', '#FF9500', '#95E77E'];
    for (let i = 0; i < 6; i++) {
      const a = t * 2.5 + i * TAU / 6;
      const r = 80 + Math.sin(t * 5 + i) * 12;
      ctx.fillStyle = cols[i % cols.length];
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r, -40 + Math.sin(a) * 32, 5, 0, TAU);
      ctx.fill();
    }
    ctx.font = '800 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🌸', 0, -100);
    ctx.restore();
  } else if (s === 'sleepy') {
    ctx.save();
    const zx = 58 + Math.sin(t * 0.8) * 4;
    const zy = -72 - (t % 3) * 10;
    ctx.fillStyle = 'rgba(180, 120, 40, 0.7)';
    ctx.font = '700 15px sans-serif';
    ctx.fillText('z', zx, zy);
    ctx.font = '700 19px sans-serif';
    ctx.fillText('Z', zx + 10, zy - 14);
    ctx.font = '700 24px sans-serif';
    ctx.fillText('Z', zx + 22, zy - 32);
    ctx.restore();
  }
}