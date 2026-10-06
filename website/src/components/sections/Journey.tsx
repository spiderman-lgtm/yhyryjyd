"use client";

import { AnimatePresence, motion, useMotionValueEvent, useScroll, useSpring } from "framer-motion";
import { useRef, useState } from "react";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { SplitText } from "@/components/ui/SplitText";
import { journey, type Milestone } from "@/content/site";
import { cn } from "@/lib/cn";

/**
 * Sticky storytelling timeline. A progress rail fills as you scroll and the
 * big year on the left swaps to match the milestone you have reached.
 */
export function Journey({ index = "03" }: { index?: string }) {
  const list = useRef<HTMLOListElement>(null);
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({ target: list, offset: ["start 60%", "end 50%"] });
  const fill = useSpring(scrollYProgress, { stiffness: 140, damping: 30 });
  useMotionValueEvent(scrollYProgress, "change", (v) => setActive(Math.min(journey.length - 1, Math.max(0, Math.floor(v * journey.length)))));

  return (
    <section id="journey" aria-labelledby="journey-title" className="relative py-24 md:py-32">
      <div className="container-x grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-28">
            <SectionLabel index={index}>The Walkover journey</SectionLabel>
            <SplitText
              id="journey-title"
              className="display mt-8 text-[clamp(2.6rem,5vw,4.8rem)]"
              lines={["From a college idea", { text: "to a family", serif: true }, "of products."]}
            />
            <div aria-hidden className="relative mt-12 hidden h-[clamp(6rem,12vw,11rem)] overflow-hidden lg:block">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={journey[active].year}
                  initial={{ y: "100%", opacity: 0 }}
                  animate={{ y: "0%", opacity: 1 }}
                  exit={{ y: "-100%", opacity: 0 }}
                  transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                  className="display absolute inset-0 text-[clamp(6rem,12vw,11rem)] text-brand"
                >
                  {journey[active].year}
                </motion.span>
              </AnimatePresence>
            </div>
          </div>
        </div>

        <ol ref={list} className="relative lg:col-span-7">
          <div aria-hidden className="absolute bottom-0 left-[7px] top-0 w-px bg-line">
            <motion.div className="h-full w-px origin-top bg-brand" style={{ scaleY: fill }} />
          </div>
          {journey.map((m, i) => (
            <MilestoneItem key={m.year} m={m} active={i === active} />
          ))}
        </ol>
      </div>
    </section>
  );
}

function MilestoneItem({ m, active }: { m: Milestone; active: boolean }) {
  return (
    <motion.li
      initial={{ opacity: 0, x: 30 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: "0px 0px -15% 0px" }}
      transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      className="relative pb-16 pl-12 last:pb-0 md:pb-24"
    >
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-2 h-[15px] w-[15px] rounded-full border-2 transition-all duration-500",
          active ? "scale-125 border-brand bg-brand shadow-[0_0_24px_rgba(237,51,56,0.6)]" : "border-paper/30 bg-ink",
        )}
      />
      <p className={cn("font-mono text-sm tracking-widest transition-colors duration-500", active ? "text-brand" : "text-mute")}>{m.year}</p>
      <h3 className={cn("mt-3 text-[clamp(1.6rem,3vw,2.6rem)] font-medium leading-tight tracking-[-0.03em] transition-colors duration-500", active ? "text-paper" : "text-paper/50")}>
        {m.title}
      </h3>
      <p className="mt-4 max-w-lg leading-relaxed text-mute">{m.body}</p>
    </motion.li>
  );
}
