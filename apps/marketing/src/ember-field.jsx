import React, { useCallback, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

// Ember theme palette — warm glowing coals. Amber, orange, gold, warm green.
const EMBERS = [
  [255, 140, 40],   // hot amber
  [255, 180, 60],   // warm gold
  [255, 100, 30],   // deep ember orange
  [180, 220, 120],  // warm green spark
  [255, 220, 140],  // pale ember glow
  [120, 200, 100],  // forest ember
];

// Particles per density tier, scaled further by viewport area below.
const DENSITY_BY_NAME = {
  subtle: 24,
  reduced: 40,
  default: 70,
  increased: 100,
  high: 140,
};

/**
 * EmberField — a warm ember particle field rendered on HTML Canvas.
 * Designed to give the site its atmospheric identity: glowing embers
 * drifting upward behind the content.
 *
 * All animation runs in a requestAnimationFrame loop over refs, so the
 * component mounts once and never triggers React re-renders while running.
 */
export function EmberField({ density = 'default', className = '' }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const ioRef = useRef(null);
  const state = useRef({
    particles: [],
    width: 0,
    height: 0,
    dpr: 1,
    time: 0,
    ctx: null,
  });

  const prefersReduced = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const canvasInViewport = () => {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const rect = canvas.getBoundingClientRect();
    return (
      rect.bottom > 0 &&
      rect.top < window.innerHeight &&
      rect.right > 0 &&
      rect.left < window.innerWidth
    );
  };

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
    state.current.width = width;
    state.current.height = height;
    state.current.dpr = dpr;
    state.current.ctx = ctx;
  }, []);

  const spawnParticle = useCallback(() => {
    const { width, height } = state.current;
    const w = Math.max(width, 1);
    const h = Math.max(height, 1);
    const color = EMBERS[Math.floor(Math.random() * EMBERS.length)];
    const isBright = Math.random() < 0.3; // more bright sparks
    return {
      x: Math.random() * w,
      y: h + Math.random() * 60, // start below the canvas
      vx: (Math.random() - 0.5) * 0.5,
      vy: 0.4 + Math.random() * 0.9, // drift upward
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
  }, []);

  const initParticles = useCallback(() => {
    const { width, height } = state.current;
    const w = Math.max(width, 1);
    const h = Math.max(height, 1);
    let count = DENSITY_BY_NAME[density] ?? DENSITY_BY_NAME.default;
    const areaScale = Math.min(Math.max((w * h) / (1440 * 900), 0.4), 2.2);
    count = Math.max(12, Math.floor(count * areaScale));
    state.current.particles = Array.from({ length: count }, spawnParticle);
  }, [density, spawnParticle]);

  const drawHaze = (ctx, w, h) => {
    const t = state.current.time * 0.0004;
    ctx.save();
    // Warm ember haze — large soft radial glows that drift slowly
    for (let i = 0; i < 3; i++) {
      const cx = (Math.sin(t + i * 2.1) * 0.35 + 0.5) * w;
      const cy = (Math.cos(t * 0.6 + i) * 0.5) * h;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * 0.85);
      g.addColorStop(0, 'rgba(255, 140, 40, 0.035)');
      g.addColorStop(0.5, 'rgba(255, 180, 60, 0.015)');
      g.addColorStop(1, 'rgba(255, 140, 40, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    // Deep base glow at the bottom — embers rising from heat
    const baseG = ctx.createLinearGradient(0, h * 0.6, 0, h);
    baseG.addColorStop(0, 'rgba(255, 100, 30, 0)');
    baseG.addColorStop(1, 'rgba(255, 100, 30, 0.04)');
    ctx.fillStyle = baseG;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  };

  const drawParticle = (ctx, p) => {
    const t = state.current.time;
    const flicker = p.isBright
      ? 0.5 + 0.5 * Math.sin(t * 0.015 + p.phase)
      : 0.75 + 0.25 * Math.sin(t * 0.007 + p.x * 0.01);
    const alpha = Math.max(0, Math.min(1, p.opacity * flicker));
    const size = p.size * (1 + (p.isBright ? 0.3 * Math.sin(t * 0.02) : 0));

    ctx.save();
    // Warm outer glow
    ctx.shadowBlur = p.isBright ? 18 : 10;
    ctx.shadowColor = `rgba(${p.color[0]},${p.color[1]},${p.color[2]},0.8)`;
    ctx.fillStyle = `rgba(${p.color[0]},${p.color[1]},${p.color[2]},${alpha * 0.9})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
    ctx.fill();
    // Hot bright core
    ctx.shadowBlur = 0;
    ctx.fillStyle = `rgba(255, 240, 200, ${alpha * 0.6})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, size * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  const animate = useCallback(() => {
    const { width, height, ctx, particles } = state.current;
    if (!ctx) {
      rafRef.current = requestAnimationFrame(animate);
      return;
    }
    ctx.clearRect(0, 0, width, height);
    drawHaze(ctx, width, height);

    const next = particles.filter(p => p.life < p.maxLife && p.y > -30);
    while (next.length < particles.length) {
      next.push(spawnParticle());
    }
    state.current.particles = next;

    next.forEach(p => {
      p.vx += Math.sin(p.life * 0.1) * 0.012;
      p.x += p.vx;
      p.y -= p.vy;
      p.life += 1;
      const alpha = Math.max(0, 1 - p.life / p.maxLife);
      const drawAlpha = Math.max(0, Math.min(1, p.opacity * alpha));
      drawParticle(ctx, { ...p, alpha: drawAlpha });
    });

    state.current.time += 1;
    rafRef.current = requestAnimationFrame(animate);
  }, [drawHaze, drawParticle, spawnParticle]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    resize();
    initParticles();
    rafRef.current = requestAnimationFrame(animate);

    const io = new ResizeObserver(() => resize());
    io.observe(canvas);
    ioRef.current = io;

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (ioRef.current) ioRef.current.disconnect();
    };
  }, [resize, initParticles, animate]);

  return (
    <canvas
      ref={canvasRef}
      className={`ember-canvas ${className}`.trim()}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', pointerEvents: 'none', zIndex: 0, background: 'transparent' }}
    />
  );
}

/**
 * Mount an EmberField into a plain DOM container. Intended for the static
 * HTML marketing pages, which are not a React app. React and ReactDOM are
 * bundled into the emitted script, so no CDN is required.
 */
export function mountEmberField(container, density = 'default') {
  if (!container) return;
  const root = createRoot(container);
  root.render(React.createElement(EmberField, { density }));
}