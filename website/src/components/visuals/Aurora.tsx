"use client";

import { motion, useMotionValue, useSpring } from "framer-motion";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

const tones = {
  soft: ["#4b5dff", "#8a5cff", "#1fb5a0"],
  vivid: ["#3d6bff", "#9b5cff", "#22c5a8"],
};

/**
 * Slowly drifting, heavily blurred colour fields. With `follow`, an extra light
 * orb trails the pointer across the section.
 */
export function Aurora({ intensity = 0.35, follow = false, variant = "soft", className }: { intensity?: number; follow?: boolean; variant?: keyof typeof tones; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useSpring(useMotionValue(-400), { stiffness: 60, damping: 20 });
  const y = useSpring(useMotionValue(-400), { stiffness: 60, damping: 20 });
  const [a, b, c] = tones[variant];

  useEffect(() => {
    if (!follow) return;
    const el = ref.current?.parentElement;
    if (!el) return;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      x.set(e.clientX - r.left);
      y.set(e.clientY - r.top);
    };
    el.addEventListener("pointermove", move);
    return () => el.removeEventListener("pointermove", move);
  }, [follow, x, y]);

  return (
    <div ref={ref} aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} style={{ opacity: intensity }}>
      <div className="absolute -left-[10%] -top-[20%] h-[60%] w-[55%] rounded-full blur-[110px] [animation:drift-a_18s_ease-in-out_infinite]" style={{ background: a }} />
      <div className="absolute -right-[10%] top-[10%] h-[55%] w-[50%] rounded-full blur-[120px] [animation:drift-b_22s_ease-in-out_infinite]" style={{ background: b }} />
      <div className="absolute bottom-[-25%] left-[25%] h-[55%] w-[50%] rounded-full blur-[120px] [animation:drift-c_26s_ease-in-out_infinite]" style={{ background: c }} />
      {follow && (
        <motion.div
          className="absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/60 blur-[120px]"
          style={{ x, y }}
        />
      )}
    </div>
  );
}
