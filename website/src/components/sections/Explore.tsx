"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useState } from "react";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { SplitText } from "@/components/ui/SplitText";
import { Aurora } from "@/components/visuals/Aurora";
import { company, experiments, journey, openings, perks, pillars, values } from "@/content/site";
import { useFinePointer } from "@/lib/hooks";
import { cn } from "@/lib/cn";

const statusColor: Record<string, string> = { Live: "#22C59A", Evolved: "#9fb4ff", Archive: "#8b8b95", Program: "#c8a8ff" };

const items = [
  { key: "journey", title: "Our journey", hint: "2006 → now", href: "/about#journey" },
  { key: "build", title: "How we build", hint: "4 principles", href: "/about#innovation" },
  { key: "lab", title: "The Lab", hint: `${experiments.length} experiments`, href: "/about#lab" },
  { key: "culture", title: "Culture", hint: `${values.length} beliefs`, href: "/about#culture" },
  { key: "careers", title: "Careers", hint: `${openings.length} open roles`, href: "/careers" },
] as const;
type Key = (typeof items)[number]["key"];

/**
 * A compact index of everything beyond the products. Hovering (or tapping) a
 * title opens a preview of that part of the story; clicking goes to the full page.
 */
export function Explore({ index = "03" }: { index?: string }) {
  const fine = useFinePointer();
  const [active, setActive] = useState<Key>("journey");

  return (
    <section id="explore" aria-labelledby="explore-title" className="relative isolate overflow-hidden py-24 md:py-32">
      <Aurora intensity={0.18} className="-z-10" />
      <div className="container-x">
        <div className="grid gap-6 md:grid-cols-12 md:items-end">
          <div className="md:col-span-8">
            <SectionLabel index={index}>Inside Walkover</SectionLabel>
            <SplitText id="explore-title" className="display mt-8 text-[clamp(2.6rem,6vw,6rem)]" lines={["The story,", { text: "in one place.", serif: true, className: "text-aurora" }]} />
          </div>
          <p className="max-w-sm text-paper/65 md:col-span-4 md:justify-self-end">{fine ? "Hover a title to preview it. Click to open the full story." : "Tap a title to preview it."}</p>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-12 lg:gap-10">
          <ul className="lg:col-span-5">
            {items.map((it, i) => {
              const on = active === it.key;
              return (
                <li key={it.key} className="border-b border-line first:border-t">
                  <Link
                    href={it.href}
                    onMouseEnter={() => fine && setActive(it.key)}
                    onFocus={() => fine && setActive(it.key)}
                    onClick={(e) => {
                      if (!fine && active !== it.key) {
                        e.preventDefault();
                        setActive(it.key);
                      }
                    }}
                    aria-expanded={on}
                    aria-controls="explore-preview"
                    data-cursor="Open"
                    className="group flex items-center justify-between gap-4 py-5 md:py-6"
                  >
                    <span className="flex items-baseline gap-4">
                      <span className={cn("font-mono text-xs transition-colors", on ? "text-paper" : "text-mute")}>0{i + 1}</span>
                      <span
                        className={cn(
                          "font-display text-[clamp(1.8rem,3.6vw,3.2rem)] font-bold tracking-[-0.04em] transition-all duration-500 ease-expo",
                          on ? "translate-x-2 text-aurora" : "text-paper/45 group-hover:text-paper/80",
                        )}
                      >
                        {it.title}
                      </span>
                    </span>
                    <span className={cn("shrink-0 text-right font-mono text-[0.7rem] uppercase tracking-widest transition-colors", on ? "text-paper/80" : "text-dim")}>
                      {it.hint}
                      <span aria-hidden className={cn("ml-2 inline-block transition-transform duration-500", on && "translate-x-1")}>
                        →
                      </span>
                    </span>
                  </Link>

                  {/* Touch: preview opens inline under the tapped title */}
                  {!fine && (
                    <AnimatePresence initial={false}>
                      {on && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden lg:hidden">
                          <div className="glass mb-5 rounded-[24px] p-5">
                            <Preview k={it.key} href={it.href} />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  )}
                </li>
              );
            })}
          </ul>

          {/* Pointer devices: one large preview panel beside the list */}
          <div className={cn("lg:col-span-7", fine ? "block" : "hidden")}>
            <div id="explore-preview" className="glass relative min-h-[460px] overflow-hidden rounded-[32px] p-8 [perspective:1400px] md:p-10 lg:sticky lg:top-28">
              <AnimatePresence mode="wait">
                <motion.div
                  key={active}
                  initial={{ opacity: 0, filter: "blur(8px)", rotateY: -38, x: 40 }}
                  animate={{ opacity: 1, filter: "blur(0px)", rotateY: 0, x: 0 }}
                  exit={{ opacity: 0, filter: "blur(8px)", rotateY: 38, x: -40 }}
                  style={{ transformOrigin: "50% 50%" }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                >
                  <Preview k={active} href={items.find((i) => i.key === active)!.href} />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Preview({ k, href }: { k: Key; href: string }) {
  return (
    <div className="flex flex-col gap-6">
      {k === "journey" && <JourneyPreview />}
      {k === "build" && <BuildPreview />}
      {k === "lab" && <LabPreview />}
      {k === "culture" && <CulturePreview />}
      {k === "careers" && <CareersPreview />}
      <Link href={href} className="inline-flex w-fit items-center gap-2 rounded-full bg-paper px-5 py-2.5 text-sm font-medium text-ink transition-transform hover:scale-105">
        Open full {k === "careers" ? "careers page" : "story"} <span aria-hidden>↗</span>
      </Link>
    </div>
  );
}

function PreviewHead({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="text-[clamp(1.6rem,2.8vw,2.4rem)] font-bold leading-tight tracking-[-0.03em]">{title}</h3>
      <p className="mt-2 max-w-lg text-paper/65">{body}</p>
    </div>
  );
}

function JourneyPreview() {
  return (
    <>
      <PreviewHead title="From a college idea to a family of products." body={`${new Date().getFullYear() - company.founded} years of building, failing, learning and scaling.`} />
      <ol className="relative grid gap-3 border-l border-paper/15 pl-5">
        {journey.map((m, i) => (
          <motion.li key={m.year} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.04 * i }} className="relative">
            <span className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full bg-gradient-to-br from-[#9fb4ff] to-[#8be3d6]" />
            <span className="font-mono text-xs text-paper/50">{m.year}</span>
            <span className="ml-3 text-paper/90">{m.title}</span>
          </motion.li>
        ))}
      </ol>
    </>
  );
}

function BuildPreview() {
  return (
    <>
      <PreviewHead title="How we build what we build." body="Four ideas run through every Walkover product." />
      <ul className="grid gap-3 sm:grid-cols-2">
        {pillars.map((p, i) => (
          <motion.li key={p.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }} className="rounded-2xl border border-paper/10 bg-paper/[0.04] p-4">
            <p className="font-display text-lg font-semibold">{p.title}</p>
            <p className="mt-1 text-sm text-paper/60">{p.lead}</p>
          </motion.li>
        ))}
      </ul>
    </>
  );
}

function LabPreview() {
  return (
    <>
      <PreviewHead title="40+ products tried." body="Some became companies, some became lessons. A peek inside the lab." />
      <ul className="flex flex-wrap gap-2">
        {experiments.map((e, i) => (
          <motion.li
            key={e.name}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.03 * i }}
            className="inline-flex items-center gap-2 rounded-full border border-paper/12 bg-paper/[0.04] px-3.5 py-2 text-sm"
          >
            <span className="h-2 w-2 rounded-full" style={{ background: statusColor[e.status] }} />
            {e.name}
            <span className="font-mono text-[0.65rem] uppercase tracking-widest text-paper/40">{e.status}</span>
          </motion.li>
        ))}
      </ul>
    </>
  );
}

function CulturePreview() {
  return (
    <>
      <PreviewHead title="The Spartans behind the products." body="Builders in Indore and remote, sharing five simple beliefs." />
      <ul className="grid gap-2">
        {values.map((v, i) => (
          <motion.li key={v.title} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i }} className="flex items-baseline justify-between gap-4 border-b border-paper/10 pb-2">
            <span className="font-display text-lg font-semibold">{v.title}</span>
            <span className="hidden text-right text-sm text-paper/55 sm:block">{v.body}</span>
          </motion.li>
        ))}
      </ul>
    </>
  );
}

function CareersPreview() {
  return (
    <>
      <PreviewHead title="Don't join a project. Own a product." body={perks.map((p) => p.title).join(" · ")} />
      <ul className="grid gap-2">
        {openings.slice(0, 4).map((o, i) => (
          <motion.li key={o.role} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }} className="flex items-center justify-between gap-4 rounded-xl border border-paper/10 bg-paper/[0.04] px-4 py-3">
            <span className="font-medium">{o.role}</span>
            <span className="shrink-0 text-xs text-paper/50">{o.location}</span>
          </motion.li>
        ))}
      </ul>
    </>
  );
}
