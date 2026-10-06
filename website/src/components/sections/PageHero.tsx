"use client";

import { motion } from "framer-motion";
import { SplitText } from "@/components/ui/SplitText";
import { Aurora } from "@/components/visuals/Aurora";

type Line = Parameters<typeof SplitText>[0]["lines"][number];

/** Shared opening block for inner pages. */
export function PageHero({ eyebrow, lines, intro }: { eyebrow: string; lines: Line[]; intro: string }) {
  return (
    <section className="relative overflow-hidden pb-20 pt-40 md:pb-28 md:pt-52">
      <Aurora intensity={0.3} follow />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-ink" />
      <div className="container-x relative">
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="label mb-8 flex items-center gap-3">
          <span className="h-2 w-2 rounded-full bg-brand shadow-[0_0_12px_rgba(201,211,255,0.9)]" />
          {eyebrow}
        </motion.p>
        <SplitText as="h1" immediate delay={0.1} className="display text-[clamp(3rem,9vw,9rem)]" lines={lines} />
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 1, ease: [0.16, 1, 0.3, 1] }}
          className="mt-10 max-w-2xl text-lg leading-relaxed text-paper/70 md:text-xl"
        >
          {intro}
        </motion.p>
      </div>
    </section>
  );
}
