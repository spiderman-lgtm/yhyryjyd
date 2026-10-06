"use client";

import { useEffect, useRef } from "react";

type Node = { x: number; y: number; z: number; vx: number; vy: number; hue: string };
type Packet = { a: number; b: number; t: number; speed: number; color: string };

const PALETTE = ["#3D7BFF", "#FF6A3D", "#9B7BFF", "#22C59A", "#FF4F9A", "#FFC23D"];

/**
 * A field of drifting nodes that link up when close — a quiet metaphor for
 * messages, integrations and models talking to each other. Coloured "packets"
 * travel along the links. The cursor gently pulls the network toward it.
 *
 * Pauses when offscreen or the tab is hidden; renders a single still frame
 * when the user prefers reduced motion.
 */
export function NetworkField({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    let w = 0;
    let h = 0;
    let nodes: Node[] = [];
    let packets: Packet[] = [];
    let raf = 0;
    let running = false;
    const mouse = { x: -9999, y: -9999, active: false };

    const linkDist = () => Math.min(170, Math.max(110, w / 9));

    const setup = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(110, Math.max(36, (w * h) / 14000)));
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        z: 0.35 + Math.random() * 0.65,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        hue: PALETTE[Math.floor(Math.random() * PALETTE.length)],
      }));
      packets = [];
    };

    const spawnPacket = () => {
      const a = Math.floor(Math.random() * nodes.length);
      const d = linkDist();
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < nodes.length; i++) {
        if (i === a) continue;
        const dx = nodes[i].x - nodes[a].x;
        const dy = nodes[i].y - nodes[a].y;
        const dd = dx * dx + dy * dy;
        if (dd < d * d && dd < bestD && Math.random() > 0.3) {
          best = i;
          bestD = dd;
        }
      }
      if (best >= 0) packets.push({ a, b: best, t: 0, speed: 0.008 + Math.random() * 0.012, color: nodes[a].hue });
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const d = linkDist();

      for (const n of nodes) {
        if (!reduce) {
          if (mouse.active) {
            const dx = mouse.x - n.x;
            const dy = mouse.y - n.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 220 && dist > 1) {
              n.vx += (dx / dist) * 0.012 * n.z;
              n.vy += (dy / dist) * 0.012 * n.z;
            }
          }
          n.vx *= 0.985;
          n.vy *= 0.985;
          n.vx += (Math.random() - 0.5) * 0.01;
          n.vy += (Math.random() - 0.5) * 0.01;
          n.x += n.vx * n.z;
          n.y += n.vy * n.z;
          if (n.x < -20) n.x = w + 20;
          if (n.x > w + 20) n.x = -20;
          if (n.y < -20) n.y = h + 20;
          if (n.y > h + 20) n.y = -20;
        }
      }

      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dd = dx * dx + dy * dy;
          if (dd < d * d) {
            const alpha = (1 - Math.sqrt(dd) / d) * 0.22 * Math.min(a.z, b.z);
            ctx.strokeStyle = `rgba(243,241,234,${alpha})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      for (const n of nodes) {
        ctx.fillStyle = `rgba(243,241,234,${0.25 + n.z * 0.5})`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, 0.6 + n.z * 1.4, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!reduce && packets.length < 14 && Math.random() < 0.08) spawnPacket();
      packets = packets.filter((p) => p.t <= 1);
      for (const p of packets) {
        p.t += p.speed;
        const a = nodes[p.a];
        const b = nodes[p.b];
        const x = a.x + (b.x - a.x) * p.t;
        const y = a.y + (b.y - a.y) * p.t;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 12;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(x, y, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    };

    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (running || reduce) return;
      running = true;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    setup();
    draw();

    const io = new IntersectionObserver(([entry]) => (entry.isIntersecting ? start() : stop()));
    io.observe(canvas);
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);

    let resizeTimer = 0;
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        setup();
        draw();
      }, 120);
    });
    ro.observe(canvas);

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
      mouse.active = mouse.y > 0 && mouse.y < r.height;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    return () => {
      stop();
      io.disconnect();
      ro.disconnect();
      clearTimeout(resizeTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className={className} />;
}
