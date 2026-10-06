"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { Counter } from "@/components/ui/Counter";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { TiltCard } from "@/components/ui/TiltCard";
import { company, stats } from "@/content/site";
import { cn } from "@/lib/cn";

/** Walkover in numbers: tilting glass stat cards that count up into view. */
export function WhatIsWalkover({ index = "01" }: { index?: string }) {
  return (
    <section id="about" aria-labelledby="about-title" className="relative pt-24 md:pt-32">
      <div className="container-x">
        <SectionLabel index={index}>By the numbers</SectionLabel>
      </div>
      <Stats />
    </section>
  );
}

function Stats() {
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div className="container-x pb-24 pt-8 md:pb-32">
      <div className="mb-8 flex items-end justify-between gap-6">
        <h2 id="about-title" className="display max-w-xl text-[clamp(2rem,4vw,3.4rem)]">
          {new Date().getFullYear() - company.founded}+ years. <span className="text-aurora">Billions</span> of messages.
        </h2>
      </div>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4" onMouseLeave={() => setHover(null)}>
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 30, filter: "blur(8px)" }}
            whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            viewport={{ once: true, margin: "0px 0px -10% 0px" }}
            transition={{ duration: 0.8, delay: (i % 3) * 0.08, ease: [0.16, 1, 0.3, 1] }}
            onMouseEnter={() => setHover(i)}
            className={cn("transition-opacity duration-500", hover !== null && hover !== i && "md:opacity-50")}
          >
            <TiltCard className="h-full" glow="rgba(200,190,255,0.14)" max={6}>
              <div className="glass relative h-full overflow-hidden rounded-[24px] p-5 md:rounded-[28px] md:p-8">
                <dt className="sr-only">{s.label}</dt>
                <dd className="display text-[clamp(2.4rem,5.6vw,5rem)]">
                  <span className={cn("transition-all duration-500", hover === i ? "text-aurora" : "text-paper")}>
                    <Counter value={s.value} suffix={s.suffix} format={s.format} />
                  </span>
                </dd>
                <dd aria-hidden className="mt-3 max-w-[24ch] text-sm text-paper/60">
                  {s.label}
                </dd>
              </div>
            </TiltCard>
          </motion.div>
        ))}
      </dl>
    </div>
  );
}
