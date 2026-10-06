"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { SplitText } from "@/components/ui/SplitText";
import { pillars } from "@/content/site";
import { cn } from "@/lib/cn";

const glyphs: Record<string, React.ReactElement> = {
  communication: (
    <svg viewBox="0 0 80 80" className="h-full w-full" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="8" y="14" width="44" height="28" rx="14" />
      <rect x="28" y="38" width="44" height="28" rx="14" fill="currentColor" fillOpacity="0.15" />
    </svg>
  ),
  automation: (
    <svg viewBox="0 0 80 80" className="h-full w-full" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="16" cy="40" r="8" />
      <circle cx="64" cy="18" r="8" />
      <circle cx="64" cy="62" r="8" fill="currentColor" fillOpacity="0.15" />
      <path d="M24 40 C 40 40, 40 18, 56 18 M24 40 C 40 40, 40 62, 56 62" />
    </svg>
  ),
  ai: (
    <svg viewBox="0 0 80 80" className="h-full w-full" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M40 8 L72 40 L40 72 L8 40 Z" />
      <path d="M40 24 L56 40 L40 56 L24 40 Z" fill="currentColor" fillOpacity="0.15" />
    </svg>
  ),
  experiments: (
    <svg viewBox="0 0 80 80" className="h-full w-full" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M30 8 h20 M34 8 v22 L14 66 a6 6 0 0 0 5 8 h42 a6 6 0 0 0 5 -8 L46 30 V8" />
      <path d="M22 52 h36 L66 66 a6 6 0 0 1 -5 8 H19 a6 6 0 0 1 -5 -8 Z" fill="currentColor" fillOpacity="0.15" stroke="none" />
    </svg>
  ),
};

/**
 * Four principles as expanding panels: hover (or tap) one and it opens wide,
 * the rest compress to labelled spines. Stacks into an accordion on mobile.
 */
export function Innovation({ index = "04" }: { index?: string }) {
  const [open, setOpen] = useState(0);

  return (
    <section id="innovation" aria-labelledby="innovation-title" className="relative py-24 md:py-32">
      <div className="container-x">
        <div className="grid gap-8 md:grid-cols-12 md:items-end">
          <div className="md:col-span-7">
            <SectionLabel index={index}>Built for innovation</SectionLabel>
            <SplitText
              id="innovation-title"
              className="display mt-8 text-[clamp(2.6rem,5.4vw,5.4rem)]"
              lines={["How we build", { text: "what we build.", serif: true, className: "text-aurora" }]}
            />
          </div>
          <p className="max-w-md text-paper/70 md:col-span-5 md:justify-self-end">
            Four ideas run through every Walkover product — from the first SMS API to the newest AI agent.
          </p>
        </div>

        <div className="mt-16 flex flex-col gap-3 lg:h-[520px] lg:flex-row">
          {pillars.map((p, i) => {
            const isOpen = open === i;
            return (
              <div
                key={p.key}
                onMouseEnter={() => setOpen(i)}
                className={cn(
                  "relative overflow-hidden rounded-[28px] border transition-[flex-grow,background-color,border-color] duration-700 ease-expo",
                  isOpen ? "border-brand/40 bg-ink-3 lg:flex-[3.2]" : "border-line bg-ink-2 lg:flex-1",
                )}
              >
                <button
                  type="button"
                  onClick={() => setOpen(i)}
                  onFocus={() => setOpen(i)}
                  aria-expanded={isOpen}
                  aria-controls={`pillar-${p.key}`}
                  className="flex w-full items-center justify-between gap-4 p-6 text-left lg:h-full lg:flex-col lg:items-start lg:justify-between lg:p-8"
                >
                  <span className="flex items-center gap-4 lg:flex-col lg:items-start">
                    <span className="font-mono text-xs text-brand">0{i + 1}</span>
                    <span className={cn("text-2xl font-medium tracking-[-0.03em] transition-colors lg:text-3xl", isOpen ? "text-paper" : "text-paper/60")}>{p.title}</span>
                  </span>
                  <span className={cn("h-10 w-10 shrink-0 transition-colors duration-500 lg:h-16 lg:w-16", isOpen ? "text-brand" : "text-paper/30")}>{glyphs[p.key]}</span>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      id={`pillar-${p.key}`}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                      className="lg:absolute lg:inset-x-8 lg:bottom-8 lg:left-[40%] lg:!h-auto"
                    >
                      <div className="px-6 pb-6 lg:p-0">
                        <p className="font-serif text-[clamp(1.6rem,2.6vw,2.5rem)] italic leading-tight">{p.lead}</p>
                        <p className="mt-4 max-w-md text-paper/70">{p.body}</p>
                        <p className="label mt-6">{p.tag}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
