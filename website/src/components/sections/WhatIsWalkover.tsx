"use client";

import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useScroll, useTransform, type MotionValue } from "framer-motion";
import { useRef, useState } from "react";
import { Counter } from "@/components/ui/Counter";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { TiltCard } from "@/components/ui/TiltCard";
import { Aurora } from "@/components/visuals/Aurora";
import { company, stats } from "@/content/site";
import { cn } from "@/lib/cn";

const steps = [
  { title: "Find a real problem", body: "Businesses that need to talk, automate, account and think faster." },
  { title: "Build it ourselves", body: "In-house teams, in Indore, owning every line of the product." },
  { title: "Scale it", body: "To billions of messages and thousands of businesses." },
];

/**
 * Pinned scroll story: "Not an agency." and "Not an outsourcing shop." are
 * struck through in turn, then "A product company." lights up and the
 * three-step loop that defines Walkover appears.
 */
export function WhatIsWalkover({ index = "01" }: { index?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const finished = useMotionValue(1); // reduced motion shows the end state
  const p = reduce ? finished : scrollYProgress;

  return (
    <section id="about" aria-labelledby="about-title" className="relative">
      <div ref={ref} className="relative h-[260vh]">
        <div className="sticky top-0 flex h-[100svh] flex-col justify-center overflow-hidden">
          <Glow progress={p} />
          <div className="container-x relative">
            <SectionLabel index={index}>What is Walkover?</SectionLabel>
            <h2 id="about-title" className="mt-10 flex flex-col gap-1 md:gap-2">
              <Struck progress={p} range={[0.08, 0.26]}>
                Not an agency.
              </Struck>
              <Struck progress={p} range={[0.28, 0.46]}>
                Not an outsourcing shop.
              </Struck>
              <Lit progress={p} range={[0.48, 0.64]} />
            </h2>
            <Steps progress={p} />
          </div>
        </div>
      </div>

      <Stats />
    </section>
  );
}

function useRange(progress: MotionValue<number>, range: [number, number]) {
  return useTransform(progress, range, [0, 1], { clamp: true });
}

function Struck({ children, progress, range }: { children: string; progress: MotionValue<number>; range: [number, number] }) {
  const t = useRange(progress, range);
  const width = useTransform(t, [0, 1], [0, 100]);
  // Background-drawn strike so it follows the text across wrapped lines.
  const size = useMotionTemplate`${width}% 0.075em`;
  const opacity = useTransform(t, [0, 1], [1, 0.22]);
  const blur = useTransform(t, [0.4, 1], ["blur(0px)", "blur(3px)"]);
  const x = useTransform(t, [0, 1], [0, -12]);
  return (
    <motion.span style={{ opacity, x }} className="display relative block text-[clamp(2.4rem,7.4vw,7.2rem)] text-paper">
      <motion.span
        style={{ filter: blur, backgroundSize: size }}
        className="bg-gradient-to-r from-[#9fb4ff] via-[#c8a8ff] to-[#8be3d6] bg-[position:0_58%] bg-no-repeat [-webkit-box-decoration-break:clone] [box-decoration-break:clone]"
      >
        {children}
      </motion.span>
    </motion.span>
  );
}

function Lit({ progress, range }: { progress: MotionValue<number>; range: [number, number] }) {
  const t = useRange(progress, range);
  const opacity = useTransform(t, [0, 1], [0.12, 1]);
  const scale = useTransform(t, [0, 1], [0.94, 1]);
  const y = useTransform(t, [0, 1], [30, 0]);
  const glow = useTransform(t, [0, 1], ["drop-shadow(0 0 0px rgba(180,190,255,0))", "drop-shadow(0 0 40px rgba(180,190,255,0.35))"]);
  return (
    <motion.span style={{ opacity, scale, y, filter: glow }} className="display block origin-left pt-2 text-[clamp(3rem,10vw,10rem)] font-extrabold">
      <span className="text-paper">A </span>
      <span className="text-aurora">product company.</span>
    </motion.span>
  );
}

function Steps({ progress }: { progress: MotionValue<number> }) {
  const t = useRange(progress, [0.64, 0.86]);
  return (
    <ol className="mt-10 grid gap-3 md:mt-14 md:grid-cols-3 md:gap-4">
      {steps.map((s, i) => (
        <Step key={s.title} t={t} i={i} title={s.title} body={s.body} />
      ))}
    </ol>
  );
}

function Step({ t, i, title, body }: { t: MotionValue<number>; i: number; title: string; body: string }) {
  const start = i / 3;
  const opacity = useTransform(t, [start, start + 0.34], [0, 1]);
  const y = useTransform(t, [start, start + 0.34], [24, 0]);
  const blur = useTransform(t, [start, start + 0.34], ["blur(10px)", "blur(0px)"]);
  return (
    <motion.li style={{ opacity, y, filter: blur }} className="glass flex items-start gap-4 rounded-2xl p-4 md:block md:rounded-3xl md:p-6">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-paper font-mono text-xs font-medium text-ink md:mb-6">{i + 1}</span>
      <span>
        <span className="font-display block text-lg font-semibold tracking-[-0.02em] md:text-2xl">{title}</span>
        <span className="mt-1 block text-sm text-paper/60 md:mt-2">{body}</span>
      </span>
    </motion.li>
  );
}

function Glow({ progress }: { progress: MotionValue<number> }) {
  const opacity = useTransform(progress, [0.35, 0.7], [0.08, 0.5]);
  return (
    <motion.div style={{ opacity }} className="pointer-events-none absolute inset-0">
      <Aurora intensity={1} />
    </motion.div>
  );
}

function Stats() {
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div className="container-x pb-24 pt-8 md:pb-32">
      <div className="mb-8 flex items-end justify-between gap-6">
        <p className="display max-w-xl text-[clamp(2rem,4vw,3.4rem)]">
          {new Date().getFullYear() - company.founded}+ years. <span className="text-aurora">Billions</span> of messages.
        </p>
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
