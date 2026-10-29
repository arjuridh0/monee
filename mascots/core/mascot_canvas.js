// Core engine 2.5D untuk semua maskot: loop, pegas, pointer, kedip, squash-stretch, state machine.
// Maskot hanya menyediakan { id, motion(p), draw(ctx, p) } — lihat luna.js / bumi.js / mochi.js.
import { STATES, ONE_SHOT } from './states.js';
import { clamp } from './draw_util.js';
import { MASCOTS } from '../index.js';

const LOGICAL = 320; // koordinat gambar logis; canvas diskalakan ke width tampil

export class MascotCanvas {
  constructor({ canvas, mascot = 'mochi', width = 280, state = 'idle', interactive = true, autoGabut = true } = {}) {
    if (!canvas) throw new Error('canvas wajib');
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.interactive = interactive;
    this.autoGabut = autoGabut;
    this._reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.p = { state: 'idle', t: 0, st: 0, yaw: 0, pitch: 0, blink: 0, squash: 0, petting: false };
    this.target = { yaw: 0, pitch: 0 };
    this.nextBlink = 2 + Math.random() * 3;
    this.taps = [];
    this.resize(width);
    this.setMascot(mascot);
    this.setState(state);
    if (interactive) this._bind();
    this._visibility = () => this._sync();
    document.addEventListener('visibilitychange', this._visibility);
    this._start();
  }

  get reduced() { return this._reduced; }
  set reduced(value) {
    if (this._reduced === Boolean(value)) return;
    this._reduced = Boolean(value);
    if (this._reduced) {
      this.p.t = this.p.st = this.p.yaw = this.p.pitch = this.p.blink = this.p.squash = 0;
    }
    this._sync();
  }

  setMascot(id) {
    const m = typeof id === 'string' ? MASCOTS[id] : id;
    if (!m) throw new Error(`maskot tidak dikenal: ${id}`);
    this.mascot = m;
    this.p.st = 0;
    this._invalidate();
  }

  setState(s) {
    if (!STATES.includes(s)) throw new Error(`state tidak dikenal: ${s}`);
    if (s === this.p.state) return;
    this.p.state = s;
    this.p.st = 0;
    if (s === 'tap' || s === 'surprised') this.p.squash = 1;
    this._invalidate();
  }

  resize(width) {
    this.width = width;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = width * dpr;
    this.canvas.height = width * dpr;
    this.canvas.style.width = this.canvas.style.height = width + 'px';
    this.scale = (width * dpr) / LOGICAL;
    this._invalidate();
  }

  _bind() {
    const c = this.canvas;
    this._on = {
      move: (e) => {
        const r = c.getBoundingClientRect();
        this.target.yaw = clamp(((e.clientX - r.left) / r.width * 2 - 1) * 0.7, -0.6, 0.6);
        this.target.pitch = clamp(((e.clientY - r.top) / r.height * 2 - 1) * 0.5, -0.4, 0.4);
        if (this.down && Math.abs(e.clientX - this.lastX) > 4) { this.p.petting = true; this.setState('pet'); }
        this.lastX = e.clientX;
      },
      down: (e) => {
        this.down = true; this.lastX = e.clientX; this.p.petting = false;
        const now = performance.now();
        this.taps = this.taps.filter((t) => now - t < 2000); this.taps.push(now);
        this.setState(this.taps.length >= 5 ? 'angry' : 'tap');
        if (this.taps.length >= 5) this.taps = [];
      },
      up: () => { this.down = false; if (this.p.state === 'pet') this._back = 0.8; },
      leave: () => { this.down = false; this.target.yaw = this.target.pitch = 0; },
    };
    c.addEventListener('pointermove', this._on.move);
    c.addEventListener('pointerdown', this._on.down);
    window.addEventListener('pointerup', this._on.up);
    c.addEventListener('pointerleave', this._on.leave);
  }

  _start() {
    this.running = true;
    this._loop = (now) => {
      this.raf = 0;
      if (!this.running || document.hidden || this.reduced) return;
      const dt = Math.min((now - this._last) / 1000, 0.1);
      this._last = now;
      this._update(dt);
      this._render();
      this.raf = requestAnimationFrame(this._loop);
    };
    this._sync();
  }

  _invalidate() {
    if (this.running && this.reduced && !document.hidden) this._render();
  }

  _sync() {
    if (!this.running) return;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (document.hidden) return;
    this._render();
    if (!this.reduced) {
      this._last = performance.now();
      this.raf = requestAnimationFrame(this._loop);
    }
  }

  _update(dt) {
    const p = this.p;
    p.t += dt; p.st += dt;
    p.yaw += (this.target.yaw - p.yaw) * Math.min(1, dt * 10);
    p.pitch += (this.target.pitch - p.pitch) * Math.min(1, dt * 10);
    p.squash = Math.max(0, p.squash - dt * 3);
    if (this._back != null) { this._back -= dt; if (this._back <= 0) { this._back = null; this.setState('idle'); } }
    if (ONE_SHOT[p.state] && p.st > ONE_SHOT[p.state]) this.setState('idle');
    if (p.state === 'angry' && this.taps.length === 0 && p.st > 2.2 && this._tapAngry !== false) { /* dilepas oleh app */ }
    if (this.autoGabut && p.state === 'idle' && p.st > 8) this.setState('gabut');
    // kedip acak (mata tertutup oleh state tertentu diatur maskot sendiri)
    if (p.t > this.nextBlink) {
      p.blink += dt * 14;
      if (p.blink >= 1) { p.blink = 0; this.nextBlink = p.t + 2 + Math.random() * 4; }
    }
  }

  _render() {
    const { ctx, p } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.scale(this.scale, this.scale);
    const mo = Object.assign({ x: 0, y: 0, roll: 0, sx: 1, sy: 1 }, this.mascot.motion(p));
    const sq = Math.sin(p.squash * Math.PI) * 0.12 * (p.squash > 0 ? 1 : 0);
    // bayangan kontak (tidak ikut transformasi karakter)
    const lift = clamp(-mo.y / 60, -0.3, 1);
    ctx.fillStyle = `rgba(60,48,32,${0.2 - lift * 0.1})`;
    ctx.beginPath();
    ctx.ellipse(LOGICAL / 2 + mo.x * 0.5, LOGICAL * 0.9, 84 * (1 - lift * 0.4), 11 * (1 - lift * 0.3), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.translate(LOGICAL / 2 + mo.x, LOGICAL * 0.54 + mo.y);
    ctx.rotate(mo.roll);
    ctx.scale(mo.sx * (1 + sq), mo.sy * (1 - sq));
    this.mascot.draw(ctx, p);
  }

  destroy() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    document.removeEventListener('visibilitychange', this._visibility);
    if (this.interactive && this._on) {
      this.canvas.removeEventListener('pointermove', this._on.move);
      this.canvas.removeEventListener('pointerdown', this._on.down);
      window.removeEventListener('pointerup', this._on.up);
      this.canvas.removeEventListener('pointerleave', this._on.leave);
    }
  }
}

export { STATES };
