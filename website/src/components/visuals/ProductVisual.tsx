"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import type { Product } from "@/content/site";

/**
 * A small, looping, product-specific illustration. Each product gets its own
 * visual metaphor, drawn in its brand colour. Loops only run while visible.
 */
export function ProductVisual({ product, className }: { product: Product; className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const live = useInView(ref, { margin: "-10% 0px" });
  const c = product.color;
  const Scene = scenes[product.visual];

  return (
    <svg ref={ref} viewBox="0 0 400 300" className={className} aria-hidden fill="none">
      <defs>
        <radialGradient id={`glow-${product.slug}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={c} stopOpacity="0.35" />
          <stop offset="100%" stopColor={c} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="200" cy="150" r="150" fill={`url(#glow-${product.slug})`} />
      <Scene c={c} live={live} />
    </svg>
  );
}

type SceneProps = { c: string; live: boolean };
const loop = (live: boolean, duration: number, delay = 0) =>
  live ? { duration, delay, repeat: Infinity, ease: "easeInOut" as const } : { duration: 0 };

function Msg91({ c, live }: SceneProps) {
  const bubbles = [
    { x: 90, y: 70, w: 150, side: "l" },
    { x: 160, y: 120, w: 150, side: "r" },
    { x: 90, y: 170, w: 120, side: "l" },
    { x: 180, y: 220, w: 130, side: "r" },
  ];
  return (
    <g>
      {[0, 1, 2].map((i) => (
        <motion.circle
          key={i}
          cx="330"
          cy="60"
          r="14"
          stroke={c}
          strokeWidth="1.5"
          initial={{ scale: 1, opacity: 0.8 }}
          animate={live ? { scale: [1, 3.2], opacity: [0.7, 0] } : {}}
          transition={loop(live, 2.4, i * 0.8)}
          style={{ transformOrigin: "330px 60px" }}
        />
      ))}
      <circle cx="330" cy="60" r="6" fill={c} />
      {bubbles.map((b, i) => (
        <motion.g
          key={i}
          initial={{ opacity: 0.2, y: 10 }}
          animate={live ? { opacity: [0.15, 1, 1, 0.15], y: [10, 0, 0, -6] } : { opacity: 1, y: 0 }}
          transition={{ ...loop(live, 4, i * 0.45), times: [0, 0.2, 0.75, 1] }}
        >
          <rect x={b.x} y={b.y} width={b.w} height="34" rx="17" fill={b.side === "r" ? c : "rgba(243,241,234,0.08)"} stroke={b.side === "r" ? "none" : "rgba(243,241,234,0.18)"} />
          <rect x={b.x + 16} y={b.y + 15} width={b.w * 0.5} height="4" rx="2" fill={b.side === "r" ? "rgba(7,7,10,0.55)" : "rgba(243,241,234,0.4)"} />
        </motion.g>
      ))}
    </g>
  );
}

function ViaSocket({ c, live }: SceneProps) {
  const left = [70, 150, 230];
  const right = [90, 210];
  return (
    <g>
      {left.map((y, i) => (
        <motion.path
          key={`l${i}`}
          d={`M 80 ${y} C 150 ${y}, 140 150, 200 150`}
          stroke={c}
          strokeWidth="2"
          strokeDasharray="6 8"
          animate={live ? { strokeDashoffset: [0, -56] } : {}}
          transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
          opacity={0.8}
        />
      ))}
      {right.map((y, i) => (
        <motion.path
          key={`r${i}`}
          d={`M 200 150 C 260 150, 250 ${y}, 320 ${y}`}
          stroke={c}
          strokeWidth="2"
          strokeDasharray="6 8"
          animate={live ? { strokeDashoffset: [0, -56] } : {}}
          transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
          opacity={0.8}
        />
      ))}
      {left.map((y, i) => (
        <rect key={`lb${i}`} x="44" y={y - 18} width="36" height="36" rx="10" fill="rgba(243,241,234,0.06)" stroke="rgba(243,241,234,0.2)" />
      ))}
      {right.map((y, i) => (
        <rect key={`rb${i}`} x="320" y={y - 18} width="36" height="36" rx="10" fill="rgba(243,241,234,0.06)" stroke="rgba(243,241,234,0.2)" />
      ))}
      <motion.rect
        x="176"
        y="126"
        width="48"
        height="48"
        rx="14"
        fill={c}
        animate={live ? { rotate: [0, 90, 90, 180] } : {}}
        transition={{ ...loop(live, 4), times: [0, 0.3, 0.7, 1] }}
        style={{ transformOrigin: "200px 150px" }}
      />
      <circle cx="200" cy="150" r="7" fill="#07070a" />
    </g>
  );
}

function Gtwy({ c, live }: SceneProps) {
  const ins = [50, 90, 130, 170, 210, 250];
  return (
    <g>
      {ins.map((y, i) => (
        <g key={i}>
          <path d={`M 40 ${y} C 120 ${y}, 140 150, 190 150`} stroke="rgba(243,241,234,0.16)" strokeWidth="1.5" />
          <motion.circle
            r="3.5"
            fill={c}
            animate={live ? { offsetDistance: ["0%", "100%"], opacity: [0, 1, 1, 0] } : { opacity: 0 }}
            transition={{ duration: 2.2, delay: i * 0.35, repeat: Infinity, ease: "easeIn" }}
            style={{ offsetPath: `path("M 40 ${y} C 120 ${y}, 140 150, 190 150")` }}
          />
          <circle cx="40" cy={y} r="5" fill="rgba(243,241,234,0.35)" />
        </g>
      ))}
      <motion.polygon
        points="200,110 240,150 200,190 160,150"
        fill={c}
        animate={live ? { scale: [1, 1.08, 1] } : {}}
        transition={loop(live, 2.2)}
        style={{ transformOrigin: "200px 150px" }}
      />
      <polygon points="200,128 222,150 200,172 178,150" fill="#07070a" />
      <path d="M 240 150 L 360 150" stroke={c} strokeWidth="2.5" />
      <motion.circle
        cy="150"
        r="5"
        fill="#f3f1ea"
        animate={live ? { cx: [245, 360], opacity: [1, 0] } : { cx: 300 }}
        transition={{ duration: 1.1, repeat: Infinity, ease: "easeOut" }}
      />
      <rect x="350" y="132" width="36" height="36" rx="10" stroke={c} strokeWidth="1.5" fill="rgba(243,241,234,0.04)" />
    </g>
  );
}

function Giddh({ c, live }: SceneProps) {
  const bars = [60, 110, 85, 150, 125, 190];
  return (
    <g>
      {[0, 1, 2, 3].map((i) => (
        <line key={i} x1="60" x2="340" y1={80 + i * 50} y2={80 + i * 50} stroke="rgba(243,241,234,0.08)" />
      ))}
      {bars.map((bh, i) => (
        <motion.rect
          key={i}
          x={70 + i * 45}
          width="26"
          rx="6"
          fill={i === bars.length - 1 ? c : "rgba(243,241,234,0.14)"}
          initial={{ height: 0, y: 240 }}
          animate={live ? { height: [0, bh, bh, 0], y: [240, 240 - bh, 240 - bh, 240] } : { height: bh, y: 240 - bh }}
          transition={{ duration: 5, delay: i * 0.12, repeat: Infinity, times: [0, 0.25, 0.85, 1], ease: [0.16, 1, 0.3, 1] }}
        />
      ))}
      <motion.path
        d="M 83 190 L 128 150 L 173 168 L 218 110 L 263 128 L 308 60"
        stroke={c}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={live ? { pathLength: [0, 1, 1, 0] } : { pathLength: 1 }}
        transition={{ duration: 5, repeat: Infinity, times: [0, 0.35, 0.85, 1], ease: "easeInOut" }}
      />
      <circle cx="308" cy="60" r="6" fill={c} />
    </g>
  );
}

function Agents({ c, live }: SceneProps) {
  const rings = [
    { r: 60, n: 3, d: 10 },
    { r: 110, n: 5, d: 18 },
  ];
  return (
    <g>
      {rings.map((ring, ri) => (
        <g key={ri}>
          <circle cx="200" cy="150" r={ring.r} stroke="rgba(243,241,234,0.12)" strokeDasharray="2 6" />
          <motion.g
            animate={live ? { rotate: ri % 2 ? -360 : 360 } : {}}
            transition={{ duration: ring.d, repeat: Infinity, ease: "linear" }}
            style={{ transformOrigin: "200px 150px" }}
          >
            {Array.from({ length: ring.n }).map((_, i) => {
              const a = (i / ring.n) * Math.PI * 2;
              return (
                <circle
                  key={i}
                  cx={200 + Math.cos(a) * ring.r}
                  cy={150 + Math.sin(a) * ring.r}
                  r={ri ? 9 : 11}
                  fill={i === 0 ? c : "rgba(243,241,234,0.2)"}
                  stroke={c}
                  strokeOpacity={0.6}
                />
              );
            })}
          </motion.g>
        </g>
      ))}
      <motion.circle
        cx="200"
        cy="150"
        r="26"
        fill={c}
        animate={live ? { scale: [1, 1.12, 1] } : {}}
        transition={loop(live, 2.6)}
        style={{ transformOrigin: "200px 150px" }}
      />
      <circle cx="192" cy="146" r="3.5" fill="#07070a" />
      <circle cx="208" cy="146" r="3.5" fill="#07070a" />
    </g>
  );
}

function DocStar({ c, live }: SceneProps) {
  return (
    <g>
      {[2, 1, 0].map((i) => (
        <motion.g
          key={i}
          animate={live ? { rotate: [0, (i - 1) * 7 - 4, 0], x: [0, (i - 1) * 26, 0] } : {}}
          transition={loop(live, 4.5)}
          style={{ transformOrigin: "200px 260px" }}
        >
          <rect x="135" y={50 + i * 6} width="130" height="170" rx="12" fill={i === 0 ? "#141419" : "#101015"} stroke={i === 0 ? c : "rgba(243,241,234,0.15)"} />
        </motion.g>
      ))}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <motion.rect
          key={i}
          x="155"
          y={84 + i * 20}
          height="6"
          rx="3"
          fill={i === 0 ? c : "rgba(243,241,234,0.3)"}
          initial={{ width: 0 }}
          animate={live ? { width: [0, i === 0 ? 60 : 90 - (i % 3) * 18, i === 0 ? 60 : 90 - (i % 3) * 18, 0] } : { width: 80 }}
          transition={{ duration: 5, delay: i * 0.25, repeat: Infinity, times: [0, 0.2, 0.85, 1] }}
        />
      ))}
      <motion.polygon
        points={star(291, 85, 18, 7.5)}
        fill={c}
        animate={live ? { rotate: 360 } : {}}
        transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
        style={{ transformOrigin: "291px 85px" }}
      />
    </g>
  );
}

function star(cx: number, cy: number, outer: number, inner: number) {
  return Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 ? inner : outer;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    return `${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`;
  }).join(" ");
}

const scenes: Record<Product["visual"], (p: SceneProps) => React.ReactElement> = {
  msg91: Msg91,
  viasocket: ViaSocket,
  gtwy: Gtwy,
  giddh: Giddh,
  agents: Agents,
  docstar: DocStar,
};
