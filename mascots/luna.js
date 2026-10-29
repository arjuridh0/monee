// Luna — "The Playful Cat" / "The Dreamy Stargazer"
// Animasi organik dengan fisika parabola, squash & stretch pada sundulan bola,
// tatapan pupil mengikuti bola, dan pernapasan halus.

const TAU = Math.PI * 2;

export const luna = {
  id: 'luna',

  motion({ state: s, t, st }) {
    switch (s) {
      case 'gabut': {
        // Siklus sundulan bola: frekuensi 1.4 Hz
        const p = (t * 1.4) % 1;
        const contactDist = p > 0.5 ? (1 - p) : p; // 0 saat kontak, 0.5 di puncak
        // Efek hentakan sundulan (headbutt impact & spring)
        const hit = contactDist < 0.12 ? Math.cos((contactDist / 0.12) * Math.PI * 0.5) : 0;
        return {
          y: Math.sin(t * 2.0) * 3 - hit * 5, // kepala menghentak ke atas menyundul bola
          roll: Math.sin(t * 1.4) * 0.02 + hit * 0.03,
          sx: 1 - hit * 0.04,
          sy: 1 + hit * 0.06,
        };
      }
      case 'happy': {
        // Melompat riang dengan squash saat mendarat & stretch saat di udara
        const jumpPhase = Math.sin(t * 7.5);
        const isAir = jumpPhase > 0.2;
        return {
          y: -Math.abs(jumpPhase) * 22,
          roll: Math.sin(t * 5.5) * 0.07,
          sx: isAir ? 0.95 : 1.08,
          sy: isAir ? 1.06 : 0.92,
        };
      }
      case 'pet': {
        // Reaksi dimanja: meleleh rileks, dengkuran halus
        const purr = Math.sin(t * 16) * 0.6;
        return {
          y: Math.sin(t * 3.5) * 2 + purr,
          sx: 1.08 + Math.sin(t * 3.5) * 0.02,
          sy: 0.92 - Math.sin(t * 3.5) * 0.02,
          roll: Math.sin(t * 2.5) * 0.03,
        };
      }
      case 'angry': {
        // Gemas/marah: getaran kencang, bulu mengembang
        const quiver = Math.sin(t * 42) * 2.5;
        return { x: quiver, y: 1, sx: 1.12, sy: 1.04 };
      }
      case 'sad': {
        // Lesu menunduk
        return { y: 9 + Math.sin(t * 1.4) * 2, sy: 0.96, roll: 0.02 };
      }
      case 'surprised': {
        // Hentakan kaget seketika membal
        return { y: -Math.abs(Math.sin(st * 7)) * 24 * Math.exp(-st * 1.4), sx: 0.92, sy: 1.1 };
      }
      case 'listening': {
        return { y: Math.sin(t * 2) * 3, roll: 0.07 };
      }
      case 'thinking': {
        return { y: Math.sin(t * 1.6) * 3.5, roll: Math.sin(t * 1.2) * 0.08 };
      }
      case 'tap': {
        // Membal squash kenyal saat disentuh
        return { y: -Math.abs(Math.sin(st * 10)) * 12 * Math.exp(-st * 3), sx: 1.08, sy: 0.92 };
      }
      case 'greeting': {
        return { y: -Math.abs(Math.sin(t * 6)) * 8, roll: Math.sin(t * 4) * 0.05 };
      }
      case 'annoyed': {
        return { x: Math.sin(t * 6) * 2.5, y: 3, roll: Math.sin(t * 6) * 0.03 };
      }
      case 'celebrate': {
        const cJump = Math.sin(t * 9);
        const isUp = cJump > 0.2;
        return {
          y: -Math.abs(cJump) * 24,
          roll: Math.sin(t * 7) * 0.1,
          sx: isUp ? 0.95 : 1.08,
          sy: isUp ? 1.06 : 0.92,
        };
      }
      case 'sleepy': {
        // Nafas tidur lambat & dalam
        const sleepBreath = Math.sin(t * 1.2);
        return {
          y: 7 + sleepBreath * 2.5,
          sx: 1 + sleepBreath * 0.02,
          sy: 0.96 - sleepBreath * 0.02,
          roll: 0.06,
        };
      }
      default: { // idle
        // Nafas rileks alami
        const breath = Math.sin(t * 2.2);
        return {
          y: breath * 5,
          roll: Math.sin(t * 1.4) * 0.02,
          sx: 1 + breath * 0.012,
          sy: 1 - breath * 0.012,
        };
      }
    }
  },

  draw(ctx, p) {
    const { state: s, t, st } = p;
    const fx = p.yaw * 24;
    const fy = p.pitch * 16;
    const isAngry = s === 'angry';
    const blink = p.blink > 0 && !['pet', 'sad', 'happy', 'surprised', 'celebrate'].includes(s);

    // Variabel posisi bola untuk eye-tracking & interaksi
    const ballCycle = (t * 1.4) % 1;
    const ballArc = 4 * ballCycle * (1 - ballCycle); // parabola 0 -> 1 -> 0

    // ===== 1. EFEK BELAKANG =====
    drawBackFx(ctx, s, t, fx, fy);

    // ===== 2. EKOR KUCING BERBULU =====
    drawTail(ctx, s, t);

    // ===== 3. KAKI (FEET) =====
    drawFeet(ctx, s, isAngry);

    // ===== 4. TELINGA KUCING (CAT EARS) =====
    drawEars(ctx, s, t, fx, fy, isAngry, ballCycle);

    // ===== 5. BADAN UTAMA (MAIN FLUFFY BODY) =====
    drawBody(ctx, s, fx, fy, isAngry);

    // ===== 6. FACE MASK (KREMASI WAJAH KUCING) =====
    drawFaceMask(ctx, fx, fy, isAngry);

    // ===== 7. KUMIS (WHISKERS) =====
    drawWhiskers(ctx, s, fx, fy);

    // ===== 8. MATA BESAR ANIME / EKSPRESI (dengan Eye-tracking saat gabut) =====
    drawEyes(ctx, s, t, st, fx, fy, blink, ballArc);

    // ===== 9. HIDUNG & MULUT (:3 CAT MOUTH) =====
    drawMouth(ctx, s, fx, fy);

    // ===== 10. TANGAN / CAKAR (ARMS & PAWS) =====
    drawArms(ctx, s, t, fx, ballCycle);

    // ===== 11. GABUT: SUNDUL BOLA BIRU (FISIKA PARABOLA & SQUASH) =====
    if (s === 'gabut') {
      drawToyBall(ctx, ballCycle, ballArc, fx, fy);
    }

    // ===== 12. EFEK DEPAN (AIR MATA, SPARKLE, CONFETTI) =====
    drawFrontFx(ctx, s, t, fx, fy);
  }
};

// --- TAIL ---
function drawTail(ctx, s, t) {
  ctx.save();
  ctx.fillStyle = '#2875FB';
  ctx.strokeStyle = '#1A4FB8';
  ctx.lineWidth = 2.5;

  const tailSway = (s === 'happy' || s === 'celebrate')
    ? Math.sin(t * 8) * 0.45
    : (s === 'gabut' ? Math.sin(t * 1.4) * 0.25 : Math.sin(t * 2.2) * 0.35);

  ctx.translate(-55, 42);
  ctx.rotate(tailSway);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-22, -18, -18, -44);
  ctx.quadraticCurveTo(-12, -60, 0, -54);
  ctx.quadraticCurveTo(-6, -38, -14, -12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// --- FEET ---
function drawFeet(ctx, s, isAngry) {
  ctx.save();
  ctx.fillStyle = isAngry ? '#B71C1C' : '#1E3FB2';
  ctx.beginPath();
  ctx.ellipse(-32, 70, 16, 12, 0, 0, TAU);
  ctx.ellipse(32, 70, 16, 12, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// --- EARS ---
function drawEars(ctx, s, t, fx, fy, isAngry, ballCycle) {
  ctx.save();
  ctx.fillStyle = isAngry ? '#FF5252' : '#2875FB';

  // Telinga kanan bergerak sedikit saat menyundul bola
  const rEarTwitch = s === 'gabut' && (ballCycle < 0.15 || ballCycle > 0.85) ? 3 : 0;

  // Left ear
  ctx.beginPath();
  ctx.moveTo(-65 + fx * 0.2, -45 + fy * 0.2);
  ctx.lineTo(-48, -94);
  ctx.lineTo(-20, -55);
  ctx.closePath();
  ctx.fill();

  // Right ear
  ctx.beginPath();
  ctx.moveTo(20, -55);
  ctx.lineTo(48, -94 - rEarTwitch);
  ctx.lineTo(65 + fx * 0.2, -45 + fy * 0.2);
  ctx.closePath();
  ctx.fill();

  // Inner ears (soft light blue / cream)
  ctx.fillStyle = isAngry ? '#FFE0DE' : '#C3D7FC';
  ctx.beginPath();
  ctx.moveTo(-56 + fx * 0.2, -50 + fy * 0.2);
  ctx.lineTo(-46, -84);
  ctx.lineTo(-28, -58);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(28, -58);
  ctx.lineTo(46, -84 - rEarTwitch);
  ctx.lineTo(56 + fx * 0.2, -50 + fy * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// --- BODY ---
function drawBody(ctx, s, fx, fy, isAngry) {
  ctx.save();
  const radius = isAngry ? 82 : 75;
  const bodyGrad = ctx.createRadialGradient(fx - 15, -10 + fy, 15, 0, 0, radius + 8);

  if (isAngry) {
    bodyGrad.addColorStop(0, '#FF8A80');
    bodyGrad.addColorStop(0.7, '#FF5252');
    bodyGrad.addColorStop(1, '#C62828');
  } else {
    bodyGrad.addColorStop(0, '#4B8DFE');
    bodyGrad.addColorStop(0.7, '#2875FB');
    bodyGrad.addColorStop(1, '#1A4FB8');
  }

  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// --- FACE MASK ---
function drawFaceMask(ctx, fx, fy, isAngry) {
  ctx.save();
  const faceGrad = ctx.createRadialGradient(fx, -5 + fy, 10, fx, -5 + fy, 60);

  if (isAngry) {
    faceGrad.addColorStop(0, '#FFE0DE');
    faceGrad.addColorStop(0.85, '#FFC4C0');
    faceGrad.addColorStop(1, '#F8A8A2');
  } else {
    faceGrad.addColorStop(0, '#E6EEFF');
    faceGrad.addColorStop(0.85, '#C3D7FC');
    faceGrad.addColorStop(1, '#A8C4FA');
  }

  ctx.fillStyle = faceGrad;
  ctx.beginPath();
  ctx.ellipse(fx * 0.5, -4 + fy * 0.5, 54, 50, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// --- WHISKERS ---
function drawWhiskers(ctx, s, fx, fy) {
  ctx.save();
  ctx.strokeStyle = '#7AA0E8';
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  const wX = 30 + fx;
  const wY = -4 + fy;
  const alpha = s === 'surprised' ? 0.9 : (s === 'gabut' ? 0.45 : 0.65);
  ctx.globalAlpha = alpha;

  // Left whiskers
  ctx.beginPath();
  ctx.moveTo(-wX + 10, wY); ctx.lineTo(-wX - 20, wY - 8);
  ctx.moveTo(-wX + 10, wY + 3); ctx.lineTo(-wX - 22, wY + 3);
  ctx.moveTo(-wX + 10, wY + 6); ctx.lineTo(-wX - 18, wY + 14);
  ctx.stroke();

  // Right whiskers
  ctx.beginPath();
  ctx.moveTo(wX - 10, wY); ctx.lineTo(wX + 20, wY - 8);
  ctx.moveTo(wX - 10, wY + 3); ctx.lineTo(wX + 22, wY + 3);
  ctx.moveTo(wX - 10, wY + 6); ctx.lineTo(wX + 18, wY + 14);
  ctx.stroke();

  ctx.restore();
}

// --- EYES ---
function drawEyes(ctx, s, t, st, fx, fy, blink, ballArc) {
  ctx.save();
  const eyeX = 24;
  const exL = -eyeX + fx;
  const exR = eyeX + fx;
  const ey = -8 + fy;

  if (s === 'pet' || (s === 'happy' && Math.sin(t * 8) > 0) || s === 'celebrate') {
    // Crescent happy purring eyes
    ctx.strokeStyle = '#030E50';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(exL, ey + 4, 9, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(exR, ey + 4, 9, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  } else if (s === 'angry') {
    ctx.strokeStyle = '#030E50';
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(exL - 12, ey - 9); ctx.lineTo(exL + 10, ey + 4);
    ctx.moveTo(exR + 12, ey - 9); ctx.lineTo(exR - 10, ey + 4);
    ctx.stroke();
  } else if (s === 'surprised') {
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(exL, ey, 14, 0, TAU);
    ctx.arc(exR, ey, 14, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#030E50';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = '#030E50';
    ctx.beginPath();
    ctx.arc(exL, ey, 4.5, 0, TAU);
    ctx.arc(exR, ey, 4.5, 0, TAU);
    ctx.fill();
  } else if (s === 'gabut') {
    // Mata aktif mengikuti pergerakan bola sundulan!
    const trackY = -ballArc * 4.5; // pupil naik mengikuti bola
    const trackX = 1 + ballArc * 2.0; // pupil melirik sedikit ke kanan atas
    ctx.strokeStyle = '#030E50';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(exL, ey + 3, 11, 3.8, 5.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(exR, ey + 3, 11, 3.8, 5.6);
    ctx.stroke();

    // Pupil dinamis
    ctx.fillStyle = '#030E50';
    ctx.beginPath();
    ctx.arc(exL + trackX, ey + 2 + trackY, 3.2, 0, TAU);
    ctx.arc(exR + trackX, ey + 2 + trackY, 3.2, 0, TAU);
    ctx.fill();
  } else if (s === 'greeting') {
    ctx.strokeStyle = '#030E50';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(exL, ey + 4, 9, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(exR, ey, 13, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#030E50';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#030E50';
    ctx.beginPath();
    ctx.arc(exR, ey, 4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(exR - 2, ey - 3, 2, 0, TAU);
    ctx.fill();
  } else if (s === 'thinking') {
    ctx.fillStyle = '#030E50';
    ctx.beginPath();
    ctx.ellipse(exL - 2, ey - 3, 12, 16, 0, 0, TAU);
    ctx.ellipse(exR - 2, ey - 3, 12, 16, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(exL - 4, ey - 7, 3.5, 0, TAU);
    ctx.arc(exR - 4, ey - 7, 3.5, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#030E50';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(exR - 8, ey - 18); ctx.lineTo(exR + 6, ey - 22);
    ctx.stroke();
  } else if (s === 'annoyed') {
    ctx.fillStyle = '#030E50';
    ctx.beginPath();
    ctx.ellipse(exL, ey + 1, 13, 10, 0, 0, TAU);
    ctx.ellipse(exR, ey + 1, 13, 10, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#030E50';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(exL - 10, ey - 9); ctx.lineTo(exL + 6, ey - 4);
    ctx.moveTo(exR + 10, ey - 9); ctx.lineTo(exR - 6, ey - 4);
    ctx.stroke();
  } else if (s === 'sleepy') {
    ctx.strokeStyle = '#030E50';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(exL, ey + 2, 8, 0.2, Math.PI - 0.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(exR, ey + 2, 8, 0.2, Math.PI - 0.2);
    ctx.stroke();
  } else if (blink) {
    ctx.strokeStyle = '#030E50';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(exL - 8, ey); ctx.lineTo(exL + 8, ey);
    ctx.moveTo(exR - 8, ey); ctx.lineTo(exR + 8, ey);
    ctx.stroke();
  } else {
    // Confident Anime Cat Eyes
    ctx.fillStyle = '#030E50';
    ctx.beginPath();
    ctx.ellipse(exL, ey, 14, 18, 0, 0, TAU);
    ctx.ellipse(exR, ey, 14, 18, 0, 0, TAU);
    ctx.fill();

    // Glossy Highlights
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(exL - 4, ey - 6, 5, 7, 0.2, 0, TAU);
    ctx.ellipse(exR - 4, ey - 6, 5, 7, 0.2, 0, TAU);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(exL + 4, ey + 6, 2.5, 0, TAU);
    ctx.arc(exR + 4, ey + 6, 2.5, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

// --- MOUTH & NOSE ---
function drawMouth(ctx, s, fx, fy) {
  ctx.save();
  ctx.fillStyle = '#030E50';
  ctx.strokeStyle = '#030E50';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';

  const mx = fx * 0.7;
  const my = 14 + fy * 0.7;

  // Tiny triangle nose
  ctx.beginPath();
  ctx.moveTo(mx - 3, my - 4);
  ctx.lineTo(mx + 3, my - 4);
  ctx.lineTo(mx, my - 1);
  ctx.closePath();
  ctx.fill();

  if (s === 'angry') {
    ctx.beginPath();
    ctx.moveTo(mx - 9, my + 4);
    for (let i = 0; i < 4; i++) {
      ctx.lineTo(mx - 9 + (i + 0.5) * 4.5, my + (i % 2 === 0 ? 8 : 4));
      ctx.lineTo(mx - 9 + (i + 1) * 4.5, my + 4);
    }
    ctx.stroke();
  } else if (s === 'surprised') {
    ctx.beginPath();
    ctx.ellipse(mx, my + 4, 5, 6, 0, 0, TAU);
    ctx.fill();
  } else if (s === 'sad') {
    ctx.beginPath();
    ctx.arc(mx, my + 8, 5, Math.PI * 1.2, Math.PI * 1.8);
    ctx.stroke();
  } else if (s === 'greeting' || s === 'happy' || s === 'celebrate') {
    ctx.beginPath();
    ctx.arc(mx, my + 2, 7.5, 0.1, Math.PI - 0.1);
    ctx.fill();
    ctx.fillStyle = '#FF8FA3';
    ctx.beginPath();
    ctx.ellipse(mx, my + 6, 4, 3, 0, 0, Math.PI);
    ctx.fill();
  } else if (s === 'annoyed') {
    ctx.beginPath();
    ctx.moveTo(mx - 7, my + 3); ctx.lineTo(mx + 7, my + 3);
    ctx.stroke();
  } else if (s === 'sleepy') {
    ctx.beginPath();
    ctx.arc(mx, my + 1, 4, 0.2, Math.PI - 0.2);
    ctx.stroke();
  } else {
    // Cute cat mouth (:3 curve)
    ctx.beginPath();
    ctx.arc(mx - 4, my + 1, 4.5, 0, Math.PI * 0.85);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(mx + 4, my + 1, 4.5, Math.PI * 0.15, Math.PI);
    ctx.stroke();
  }
  ctx.restore();
}

// --- ARMS & PAWS ---
function drawArms(ctx, s, t, fx, ballCycle) {
  ctx.save();
  ctx.fillStyle = '#2875FB';

  if (s === 'greeting') {
    const waveAng = Math.sin(t * 10) * 0.25;
    ctx.save();
    ctx.translate(45, -5);
    ctx.rotate(waveAng);
    ctx.beginPath();
    ctx.ellipse(0, -18, 10, 20, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.ellipse(-52, 25, 10, 18, 0.45, 0, TAU);
    ctx.fill();
  } else if (s === 'celebrate') {
    ctx.beginPath();
    ctx.ellipse(-42, -5, 10, 20, 0.4, 0, TAU);
    ctx.ellipse(42, -5, 10, 20, -0.4, 0, TAU);
    ctx.fill();
  } else if (s === 'thinking') {
    ctx.beginPath();
    ctx.ellipse(32, 20, 10, 18, -1.2, 0, TAU);
    ctx.ellipse(-52, 25, 10, 18, 0.45, 0, TAU);
    ctx.fill();
  } else if (s === 'angry') {
    ctx.beginPath();
    ctx.ellipse(-54, 18, 11, 16, 0.7, 0, TAU);
    ctx.ellipse(54, 18, 11, 16, -0.7, 0, TAU);
    ctx.fill();
  } else if (s === 'gabut') {
    // Tangan kanan terangkat riang menyambut bola
    const armFlick = ballCycle < 0.2 ? -0.2 : (ballCycle > 0.8 ? -0.1 : 0);
    ctx.beginPath();
    ctx.ellipse(-40, 34, 10, 16, 0.6, 0, TAU);
    ctx.save();
    ctx.translate(40, 16);
    ctx.rotate(-0.85 + armFlick);
    ctx.beginPath();
    ctx.ellipse(0, 0, 10, 18, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  } else {
    ctx.beginPath();
    ctx.ellipse(-52, 25, 10, 18, 0.45, 0, TAU);
    ctx.ellipse(52, 25, 10, 18, -0.45, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

// --- TOY BALL (GABUT: FISIKA PARABOLA & SQUASH) ---
function drawToyBall(ctx, ballCycle, ballArc, fx, fy) {
  ctx.save();
  const contactDist = ballCycle > 0.5 ? (1 - ballCycle) : ballCycle;
  const isImpact = contactDist < 0.12;

  // Koordinat bola
  const bx = 38 + fx * 0.4;
  const baseY = -84 + fy * 0.4;
  const by = baseY - ballArc * 44; // melambung mulus hingga 44px di atas kepala

  // Squash saat menyentuh kepala, stretch saat meluncur
  let sX = 1, sY = 1;
  if (isImpact) {
    const squishFactor = 1 - (contactDist / 0.12);
    sX = 1 + squishFactor * 0.32; // memipih elastis
    sY = 1 - squishFactor * 0.26;
  } else {
    // Kecepatan vertikal: v = 4 * (1 - 2*p)
    const vel = 4 * (1 - 2 * ballCycle);
    const stretch = Math.min(0.14, Math.abs(vel) * 0.04);
    sX = 1 - stretch * 0.6;
    sY = 1 + stretch;
  }

  // Shadow trail pada kepala
  ctx.fillStyle = `rgba(0, 100, 220, ${0.35 * (1 - ballArc * 0.6)})`;
  ctx.beginPath();
  ctx.ellipse(bx, baseY + 6, 14 * (1 - ballArc * 0.4), 4, 0, 0, TAU);
  ctx.fill();

  // Gambar bola dengan transformasi squash/stretch
  ctx.translate(bx, by);
  ctx.scale(sX, sY);

  // Bola biru bergradasi glossy
  const bGrad = ctx.createRadialGradient(-4, -4, 2, 0, 0, 15);
  bGrad.addColorStop(0, '#B3E5FC');
  bGrad.addColorStop(0.35, '#29B6F6');
  bGrad.addColorStop(0.75, '#0288D1');
  bGrad.addColorStop(1, '#01579B');
  ctx.fillStyle = bGrad;
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, TAU);
  ctx.fill();

  // Kilauan highlight bola
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.beginPath();
  ctx.arc(-4, -5, 4.2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.beginPath();
  ctx.arc(4, 5, 2, 0, TAU);
  ctx.fill();

  // Motif bintang halus
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0.4, 2.4);
  ctx.stroke();

  ctx.restore();
}

// --- BACK EFFECTS ---
function drawBackFx(ctx, s, t, fx, fy) {
  if (s === 'angry') {
    ctx.save();
    for (let i = 0; i < 5; i++) {
      const a = t * 2 + i * TAU / 5;
      const r = 85 + Math.sin(t * 8 + i) * 8;
      ctx.fillStyle = `rgba(255, ${60 + i * 20}, 40, ${0.35 + Math.sin(t * 6 + i) * 0.15})`;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r, Math.sin(a) * (r * 0.8), 12, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  } else if (s === 'listening') {
    ctx.save();
    for (let i = 0; i < 3; i++) {
      const k = (t * 1.4 + i / 3) % 1;
      ctx.strokeStyle = `rgba(0, 122, 255, ${0.75 * (1 - k)})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, -90, 16 + k * 36, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// --- FRONT EFFECTS ---
function drawFrontFx(ctx, s, t, fx, fy) {
  if (s === 'angry') {
    ctx.save();
    const px = 52 + fx * 0.3;
    const py = -92 + Math.sin(t * 10) * 3;
    ctx.strokeStyle = '#D32F2F';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(px - 7, py - 7); ctx.lineTo(px + 7, py + 7);
    ctx.moveTo(px + 7, py - 7); ctx.lineTo(px - 7, py + 7);
    ctx.stroke();
    ctx.restore();
  } else if (s === 'sad') {
    ctx.save();
    ctx.fillStyle = 'rgba(120, 190, 255, 0.9)';
    const tOff = (Math.sin(t * 4) + 1) * 4;
    ctx.beginPath();
    ctx.ellipse(-24 + fx - 3, 12 + fy + tOff, 4, 6.5, 0, 0, TAU);
    ctx.ellipse(24 + fx + 3, 12 + fy + tOff * 0.6, 3.5, 5.5, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  } else if (s === 'surprised') {
    ctx.save();
    ctx.fillStyle = 'rgba(120, 190, 255, 0.85)';
    const dropX = 56, dropY = -52 + Math.sin(t * 5) * 4;
    ctx.beginPath();
    ctx.moveTo(dropX, dropY - 10);
    ctx.quadraticCurveTo(dropX + 8, dropY + 2, dropX, dropY + 7);
    ctx.quadraticCurveTo(dropX - 8, dropY + 2, dropX, dropY - 10);
    ctx.fill();
    ctx.font = '800 24px sans-serif';
    ctx.fillStyle = '#FF9500';
    ctx.fillText('!', -60, -80);
    ctx.restore();
  } else if (s === 'celebrate') {
    ctx.save();
    const cols = ['#007AFF', '#5BA8FF', '#FF9500', '#FF2D55', '#34C759'];
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
    ctx.fillText('🎉', 0, -105);
    ctx.restore();
  } else if (s === 'sleepy') {
    ctx.save();
    const zx = 60 + Math.sin(t * 0.8) * 4;
    const zy = -75 - (t % 3) * 10;
    ctx.fillStyle = 'rgba(70, 100, 180, 0.7)';
    ctx.font = '700 15px sans-serif';
    ctx.fillText('z', zx, zy);
    ctx.font = '700 19px sans-serif';
    ctx.fillText('Z', zx + 10, zy - 14);
    ctx.font = '700 24px sans-serif';
    ctx.fillText('Z', zx + 22, zy - 32);
    ctx.restore();
  }
}