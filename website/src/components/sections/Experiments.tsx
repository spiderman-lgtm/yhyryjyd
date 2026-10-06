"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { SplitText } from "@/components/ui/SplitText";
import { experiments, type Experiment } from "@/content/site";
import { cn } from "@/lib/cn";

const filters = ["All", "Live", "Evolved", "Archive", "Program"] as const;
const statusColor: Record<Experiment["status"], string> = {
  Live: "#22C59A",
  Evolved: "#3D7BFF",
  Archive: "#8b8b95",
  Program: "#FF4F9A",
};

export function Experiments({ index = "05" }: { index?: string }) {
  const [filter, setFilter] = useState<(typeof filters)[number]>("All");
  const shown = experiments.filter((e) => filter === "All" || e.status === filter);

  const onMove = (e: React.PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  };

  return (
    <section id="lab" aria-labelledby="lab-title" className="relative overflow-hidden bg-paper py-28 text-ink md:py-40">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.5] [background-image:linear-gradient(rgba(7,7,10,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(7,7,10,0.06)_1px,transparent_1px)] [background-size:56px_56px]" />
      <div className="container-x relative">
        <div className="grid gap-8 md:grid-cols-12 md:items-end">
          <div className="md:col-span-8">
            <SectionLabel index={index} onLight>
              The Lab — our experiments
            </SectionLabel>
            <SplitText
              id="lab-title"
              className="display mt-8 text-[clamp(2.8rem,6vw,6rem)]"
              lines={["40+ products tried.", { text: "Every one taught us", serif: true }, "something."]}
            />
          </div>
          <p className="max-w-sm text-ink/70 md:col-span-4 md:justify-self-end">
            Some experiments became companies. Some became lessons. Here&apos;s a peek inside the lab — past, present and in progress.
          </p>
        </div>

        <div role="group" aria-label="Filter experiments" className="mt-12 flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                "relative rounded-full border px-4 py-2 text-sm transition-colors",
                filter === f ? "border-ink text-paper" : "border-ink/20 text-ink/70 hover:border-ink/60",
              )}
            >
              {filter === f && <motion.span layoutId="lab-filter" className="absolute inset-0 rounded-full bg-ink" transition={{ type: "spring", stiffness: 400, damping: 34 }} />}
              <span className="relative">{f}</span>
            </button>
          ))}
        </div>

        <motion.ul layout className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {shown.map((e, i) => {
              // In the full view the first tile is a wide feature and the last one a full-width banner,
              // which keeps the 3-column grid free of gaps.
              const feature = filter === "All" && i === 0;
              const banner = filter === "All" && i === shown.length - 1;
              return (
              <motion.li
                key={e.name}
                layout
                initial={{ opacity: 0, scale: 0.94, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94 }}
                transition={{ duration: 0.5, delay: i * 0.03, ease: [0.16, 1, 0.3, 1] }}
                onPointerMove={onMove}
                className={cn(
                  "group relative overflow-hidden rounded-[24px] border p-6 backdrop-blur-sm transition-[transform,box-shadow] duration-500 hover:-translate-y-1 hover:shadow-[0_30px_60px_-30px_rgba(7,7,10,0.35)]",
                  banner ? "border-ink bg-ink text-paper lg:col-span-3" : "border-ink/10 bg-white/70",
                  feature && "sm:col-span-2",
                )}
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute -inset-px opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                  style={{ background: `radial-gradient(260px circle at var(--mx) var(--my), ${statusColor[e.status]}55, transparent 70%)` }}
                />
                <div className="relative flex h-full flex-col">
                  <div className="flex items-center justify-between">
                    <span className={cn("inline-flex items-center gap-2 font-mono text-[0.7rem] uppercase tracking-widest", banner ? "text-paper/60" : "text-ink/70")}>
                      <span className="h-2 w-2 rounded-full ring-1 ring-ink/20" style={{ background: statusColor[e.status] }} />
                      {e.status}
                    </span>
                    {e.year && <span className="font-mono text-xs text-ink/50">{e.year}</span>}
                  </div>
                  <h3 className={cn("mt-10 font-medium tracking-[-0.03em]", feature || banner ? "text-4xl lg:text-5xl" : "text-2xl")}>{e.name}</h3>
                  <p className={cn("mt-3", banner ? "max-w-xl text-paper/70" : "text-ink/65")}>{e.body}</p>
                </div>
              </motion.li>
              );
            })}
          </AnimatePresence>
        </motion.ul>
      </div>
    </section>
  );
}
