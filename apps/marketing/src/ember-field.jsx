import React, { useRef, useCallback, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

// Green ember palette - glowing dark green coals matching the Authenik8 logo.
const EMBERS = [
  [36, 106, 67],    // dark green (logo primary)
  [57, 201, 120],   // bright green (logo ring)
  [23, 73, 47],     // deep dark green
  [189, 246, 212],  // pale green (logo inner ring)
  [39, 138, 82],    // mid green
  [30, 90, 55],     // forest dark green
];

const DENSITY_BY_NAME = {
  subtle: 24,
  reduced: 40,
  default: 70,
};

// --- Drawing helpers (module-level to keep EmberField readable) ---

function drawHaze(ctx, state, w, h) {
  const t = state.time * 0.0004;
  ctx.save();
  for (let i = 0; i < 3; i++) {
    const cx = (Math.sin(t + i * 2.1) * 0.35 + 0.5) * w;
    const cy = (Math.cos(t * 0.6 + i) * 0.5) * h;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * 0.85);
    g.addColorStop(0, 'rgba(36, 106, 67, 0.04)');
    g.addColorStop(0.5, 'rgba(57, 201, 120, 0.02)');
    g.addColorStop(1, 'rgba(36, 106, 67, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  const baseG = ctx.createLinearGradient(0, h * 0.6, 0, h);
  baseG.addColorStop(0, 'rgba(23, 73, 47, 0)');
  baseG.addColorStop(1, 'rgba(23, 73, 47, 0.05)');
  ctx.fillStyle = baseG;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function drawParticle(ctx, state, p) {
  const t = state.time;
  const flicker = p.isBright
    ? 0.5 + 0.5 * Math.sin(t * 0.015 + p.phase)
    : 0.75 + 0.25 * Math.sin(t * 0.007 + p.x * 0.01);
  const alpha = Math.max(0, Math.min(1, p.opacity * flicker));
  const size = p.size * (1 + (p.isBright ? 0.3 * Math.sin(t * 0.02) : 0));

  ctx.save();
  ctx.shadowBlur = p.isBright ? 18 : 10;
  ctx.shadowColor = `rgba(${p.color[0]},${p.color[1]},${p.color[2]},0.8)`;
  ctx.fillStyle = `rgba(${p.color[0]},${p.color[1]},${p.color[2]},${alpha * 0.9})`;
  ctx.beginPath();
  ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = `rgba(189, 246, 212, ${alpha * 0.6})`;
  ctx.beginPath();
  ctx.arc(p.x, p.y, size * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function spawnParticle(state) {
  const { width, height } = state;
  const w = Math.max(width, 1);
  const h = Math.max(height, 1);
  const color = EMBERS[Math.floor(Math.random() * EMBERS.length)];
  const isBright = Math.random() < 0.3;
  return {
    x: Math.random() * w,
    y: h + Math.random() * 60,
    vx: (Math.random() - 0.5) * 0.5,
    vy: 0.4 + Math.random() * 0.9,
    size: isBright ? 1.2 + Math.random() * 2.5 : 0.8 + Math.random() * 2.0,
    opacity: isBright
      ? 0.6 + Math.random() * 0.4
      : 0.2 + Math.random() * 0.45,
    life: 0,
    maxLife: 80 + Math.random() * 160,
    color,
    isBright,
    phase: Math.random() * Math.PI * 2,
  };
}

function initParticles(state, density) {
  const { width, height } = state;
  const w = Math.max(width, 1);
  const h = Math.max(height, 1);
  let count = DENSITY_BY_NAME[density] ?? DENSITY_BY_NAME.default;
  const areaScale = Math.min(Math.max((w * h) / (1440 * 900), 0.4), 2.2);
  count = Math.max(12, Math.floor(count * areaScale));
  state.particles = Array.from({ length: count }, () => spawnParticle(state));
}

// --- Component ---

export function EmberField({ density = 'default', className = '' }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const ioRef = useRef(null);
  const state = useRef({ particles: [], width: 0, height: 0, dpr: 1, time: 0, ctx: null });

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(canvas.clientWidth, 1);
    const height = Math.max(canvas.clientHeight, 1);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    const ctx = canvas.getContext('2d', { alpha: true });
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    Object.assign(state.current, { width, height, dpr, ctx });
  }, []);

  const animate = useCallback(() => {
    const s = state.current;
    const { width, height, ctx, particles } = s;
    if (!ctx) { rafRef.current = requestAnimationFrame(animate); return; }
    ctx.clearRect(0, 0, width, height);
    drawHaze(ctx, s, width, height);
    const next = particles.filter(p => p.life < p.maxLife && p.y > -30);
    while (next.length < particles.length) next.push(spawnParticle(s));
    s.particles = next;
    next.forEach(p => {
      p.vx += Math.sin(p.life * 0.1) * 0.012;
      p.x += p.vx; p.y -= p.vy; p.life += 1;
      const alpha = Math.max(0, 1 - p.life / p.maxLife);
      drawParticle(ctx, s, { ...p, alpha: Math.max(0, Math.min(1, p.opacity * alpha)) });
    });
    s.time += 1;
    rafRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    resize(); initParticles(state.current, density);
    rafRef.current = requestAnimationFrame(animate);
    const io = new ResizeObserver(() => resize());
    io.observe(canvas); ioRef.current = io;
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); if (ioRef.current) ioRef.current.disconnect(); };
  }, [density, resize, animate]);

  return <canvas ref={canvasRef} className={`ember-canvas ${className}`.trim()} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', pointerEvents: 'none', zIndex: 0, background: 'transparent' }} />;
}

export function mountEmberField(container, density = 'default') {
  if (!container) return;
  const root = createRoot(container);
  root.render(React.createElement(EmberField, { density }));
}