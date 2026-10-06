"use client";

import { animate, useInView, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

/** Counts up from zero the first time it scrolls into view. */
export function Counter({ value, suffix = "", format }: { value: number; suffix?: string; format?: "year" }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const reduce = useReducedMotion();
  const from = format === "year" ? value - 16 : 0;
  const [n, setN] = useState(from);

  useEffect(() => {
    if (!inView) return;
    if (reduce) return setN(value);
    const controls = animate(from, value, { duration: 2, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => setN(Math.round(v)) });
    return () => controls.stop();
  }, [inView, reduce, value, from]);

  const text = format === "year" ? String(n) : n.toLocaleString("en-US");
  return (
    <span ref={ref} className="tabular-nums" aria-label={`${format === "year" ? value : value.toLocaleString("en-US")}${suffix}`}>
      {text}
      {suffix}
    </span>
  );
}
