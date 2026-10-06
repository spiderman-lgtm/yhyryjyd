"use client";

import { motion } from "framer-motion";
import { SplitText } from "@/components/ui/SplitText";

type Line = Parameters<typeof SplitText>[0]["lines"][number];

/** Shared opening block for inner pages. */
export function PageHero({ eyebrow, lines, intro, accent = "#ed3338" }: { eyebrow: string; lines: Line[]; intro: string; accent?: string }) {
  return (
    <section className="relative overflow-hidden pb-20 pt-40 md:pb-28 md:pt-52">
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -right-40 -top-40 h-[560px] w-[560px] rounded-full blur-[120px]"
        style={{ background: accent }}
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 0.18, scale: 1 }}
        transition={{ duration: 2, ease: [0.16, 1, 0.3, 1] }}
      />
      <div className="container-x relative">
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="label mb-8 flex items-center gap-3">
          <span className="h-2 w-2 rounded-full" style={{ background: accent }} />
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
