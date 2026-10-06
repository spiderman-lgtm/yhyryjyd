"use client";

import { motion, useScroll, useTransform, type MotionValue } from "framer-motion";
import { useRef } from "react";
import { Counter } from "@/components/ui/Counter";
import { Reveal } from "@/components/ui/Reveal";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { stats } from "@/content/site";

const statement =
  "Walkover is a product company. Not an agency, not an outsourcing shop. We find a real problem, build the product ourselves, and scale it — again and again since 2010.";
const highlight = new Set(["product", "company.", "ourselves,", "scale"]);

export function WhatIsWalkover({ index = "01" }: { index?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 85%", "end 45%"] });
  const words = statement.split(" ");

  return (
    <section id="about" aria-labelledby="about-title" className="relative py-24 md:py-32">
      <div className="container-x">
        <div className="mb-14 flex items-end justify-between gap-6">
          <SectionLabel index={index}>What is Walkover?</SectionLabel>
        </div>
        <h2 id="about-title" className="sr-only">
          What is Walkover?
        </h2>
        <p ref={ref} className="max-w-[22ch] text-[clamp(2rem,5.6vw,5.4rem)] font-medium leading-[1.02] tracking-[-0.04em] md:max-w-[24ch]">
          {words.map((w, i) => (
            <Word key={i} progress={scrollYProgress} range={[i / words.length, (i + 1) / words.length]} accent={highlight.has(w)}>
              {w}
            </Word>
          ))}
        </p>

        <dl className="mt-24 grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-line bg-line md:grid-cols-3">
          {stats.map((s, i) => (
            <Reveal
              key={s.label}
              delay={(i % 3) * 0.08}
              className="group relative bg-ink p-6 md:p-10"
            >
              <dt className="sr-only">{s.label}</dt>
              <dd className="display text-[clamp(2.6rem,6vw,5.5rem)] transition-colors duration-500 group-hover:text-brand">
                <Counter value={s.value} suffix={s.suffix} format={s.format} />
              </dd>
              <dd className="mt-3 max-w-[24ch] text-sm text-mute" aria-hidden>
                {s.label}
              </dd>
            </Reveal>
          ))}
        </dl>
      </div>
    </section>
  );
}

function Word({ children, progress, range, accent }: { children: string; progress: MotionValue<number>; range: [number, number]; accent: boolean }) {
  const opacity = useTransform(progress, range, [0.14, 1]);
  return (
    <motion.span style={{ opacity }} className={accent ? "font-serif italic font-normal text-aurora" : undefined}>
      {children}{" "}
    </motion.span>
  );
}
