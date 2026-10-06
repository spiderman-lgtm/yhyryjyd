"use client";

import { motion, useMotionTemplate, useMotionValue, useSpring } from "framer-motion";
import { useFinePointer } from "@/lib/hooks";

/** Tilts toward the pointer in 3D and tracks a soft spotlight across its surface. */
export function TiltCard({ children, className, glow = "rgba(243,241,234,0.08)", max = 8 }: { children: React.ReactNode; className?: string; glow?: string; max?: number }) {
  const fine = useFinePointer();
  const rx = useSpring(0, { stiffness: 180, damping: 20 });
  const ry = useSpring(0, { stiffness: 180, damping: 20 });
  const mx = useMotionValue(50);
  const my = useMotionValue(50);
  const spotlight = useMotionTemplate`radial-gradient(500px circle at ${mx}% ${my}%, ${glow}, transparent 45%)`;

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!fine) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    ry.set((px - 0.5) * max * 2);
    rx.set(-(py - 0.5) * max * 2);
    mx.set(px * 100);
    my.set(py * 100);
  };
  const reset = () => {
    rx.set(0);
    ry.set(0);
  };

  return (
    <div style={{ perspective: 1200 }} className={className}>
      <motion.div
        onPointerMove={onMove}
        onPointerLeave={reset}
        style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}
        className="group/tilt relative h-full"
      >
        {children}
        <motion.div aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-500 group-hover/tilt:opacity-100" style={{ background: spotlight, borderRadius: "inherit" }} />
      </motion.div>
    </div>
  );
}
