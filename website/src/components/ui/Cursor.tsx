"use client";

import { motion, useMotionValue, useSpring } from "framer-motion";
import { useEffect, useState } from "react";
import { useFinePointer } from "@/lib/hooks";

/**
 * A two-part cursor: a precise dot plus a lagging ring that grows over
 * interactive elements. Elements can set `data-cursor="Label"` to show text.
 */
export function Cursor() {
  const fine = useFinePointer();
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const rx = useSpring(x, { stiffness: 350, damping: 32, mass: 0.6 });
  const ry = useSpring(y, { stiffness: 350, damping: 32, mass: 0.6 });
  const [state, setState] = useState<{ hover: boolean; label: string | null; down: boolean }>({
    hover: false,
    label: null,
    down: false,
  });

  useEffect(() => {
    if (!fine) return;
    document.documentElement.classList.add("has-cursor");
    const move = (e: PointerEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>("a, button, [data-cursor], input, label, select");
      const label = el?.closest<HTMLElement>("[data-cursor]")?.dataset.cursor ?? null;
      setState((s) => (s.hover === !!el && s.label === label ? s : { ...s, hover: !!el, label }));
    };
    const down = () => setState((s) => ({ ...s, down: true }));
    const up = () => setState((s) => ({ ...s, down: false }));
    const leave = () => {
      x.set(-100);
      y.set(-100);
    };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    document.addEventListener("pointerleave", leave);
    return () => {
      document.documentElement.classList.remove("has-cursor");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      document.removeEventListener("pointerleave", leave);
    };
  }, [fine, x, y]);

  if (!fine) return null;

  const size = state.label ? 88 : state.hover ? 52 : 30;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[100]">
      <motion.div
        className="absolute left-0 top-0 flex items-center justify-center rounded-full border border-paper/40 font-mono text-[10px] uppercase tracking-widest text-ink"
        style={{ x: rx, y: ry, translateX: "-50%", translateY: "-50%" }}
        animate={{
          width: size,
          height: size,
          backgroundColor: state.label ? "rgb(255 255 255 / 0.92)" : state.hover ? "rgb(243 241 234 / 0.08)" : "rgb(243 241 234 / 0)",
          borderColor: state.label ? "rgb(255 255 255 / 0)" : "rgb(243 241 234 / 0.4)",
          scale: state.down ? 0.85 : 1,
        }}
        transition={{ type: "spring", stiffness: 300, damping: 26 }}
      >
        {state.label}
      </motion.div>
      <motion.div
        className="absolute left-0 top-0 h-1.5 w-1.5 rounded-full bg-brand"
        style={{ x, y, translateX: "-50%", translateY: "-50%" }}
        animate={{ opacity: state.label ? 0 : 1 }}
      />
    </div>
  );
}
