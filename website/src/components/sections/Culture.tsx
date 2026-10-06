"use client";

import { AnimatePresence, motion, useMotionValue, useSpring } from "framer-motion";
import { useState } from "react";
import { Reveal } from "@/components/ui/Reveal";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { SplitText } from "@/components/ui/SplitText";
import { company, insights, values } from "@/content/site";
import { useFinePointer } from "@/lib/hooks";

const tones = ["#3D7BFF", "#FF6A3D", "#9B7BFF", "#22C59A", "#FF4F9A"];

export function Culture({ index = "06" }: { index?: string }) {
  const fine = useFinePointer();
  const [hover, setHover] = useState<number | null>(null);
  const x = useSpring(useMotionValue(0), { stiffness: 260, damping: 26 });
  const y = useSpring(useMotionValue(0), { stiffness: 260, damping: 26 });
  const inclusion = insights.find((p) => p.tag === "Culture");

  const onMove = (e: React.PointerEvent<HTMLUListElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    x.set(e.clientX - r.left);
    y.set(e.clientY - r.top);
  };

  return (
    <section id="culture" aria-labelledby="culture-title" className="relative py-24 md:py-32">
      <div className="container-x">
        <div className="grid gap-8 md:grid-cols-12 md:items-end">
          <div className="md:col-span-8">
            <SectionLabel index={index}>Culture & people</SectionLabel>
            <SplitText
              id="culture-title"
              className="display mt-8 text-[clamp(2.8rem,6vw,6rem)]"
              lines={["The Spartans", { text: "behind the products.", serif: true, className: "text-brand" }]}
            />
          </div>
          <p className="max-w-sm text-paper/70 md:col-span-4 md:justify-self-end">
            A team of builders, designers and problem-solvers — working from Indore and remotely — who share five simple beliefs.
          </p>
        </div>

        <ul className="relative mt-16 border-t border-line" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
          {values.map((v, i) => (
            <li key={v.title} onPointerEnter={() => setHover(i)} className="group relative border-b border-line">
              <div className="flex flex-col gap-3 py-7 transition-transform duration-700 ease-expo md:flex-row md:items-center md:justify-between md:py-10 md:group-hover:translate-x-4">
                <div className="flex items-baseline gap-6">
                  <span className="font-mono text-xs text-mute">0{i + 1}</span>
                  <h3 className="text-[clamp(1.8rem,4.4vw,4.2rem)] font-medium leading-none tracking-[-0.04em] text-paper/80 transition-colors duration-500 group-hover:text-paper">
                    {v.title.replace(/^We (\w)/, (_, c: string) => c.toUpperCase())}
                  </h3>
                </div>
                <p className={`max-w-xs pl-12 text-mute md:pl-0 md:text-right ${fine ? "md:opacity-0 md:transition-opacity md:duration-500 md:group-hover:opacity-100" : ""}`}>{v.body}</p>
              </div>
              <span aria-hidden className="absolute bottom-[-1px] left-0 h-px w-0 transition-all duration-700 ease-expo group-hover:w-full" style={{ background: tones[i] }} />
            </li>
          ))}

          {fine && (
            <AnimatePresence>
              {hover !== null && (
                <motion.div
                  aria-hidden
                  className="pointer-events-none absolute left-0 top-0 z-10 hidden md:block"
                  style={{ x, y }}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                >
                  <motion.div
                    key={hover}
                    initial={{ rotate: -20, scale: 0.6 }}
                    animate={{ rotate: 0, scale: 1 }}
                    className="-translate-x-1/2 -translate-y-1/2 h-28 w-28 rounded-[34%] mix-blend-screen blur-[1px]"
                    style={{ background: tones[hover] }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </ul>

        <div className="mt-16 grid gap-4 md:grid-cols-3">
          <Reveal className="rounded-[28px] border border-line bg-ink-2 p-8">
            <p className="label">Home base</p>
            <p className="mt-6 text-3xl font-medium tracking-[-0.03em]">
              Built in <span className="font-serif italic text-brand">{company.city}</span>, the heart of India.
            </p>
            <p className="mt-4 text-sm text-mute">{company.address.lines.join(", ")}</p>
          </Reveal>
          <Reveal delay={0.08} className="rounded-[28px] border border-line bg-ink-2 p-8">
            <p className="label">Founded by</p>
            <p className="mt-6 text-3xl font-medium tracking-[-0.03em]">Three siblings and an itch to build.</p>
            <p className="mt-4 text-sm text-mute">{company.founders.join(", ")} — {company.founded}.</p>
          </Reveal>
          {inclusion && (
            <Reveal delay={0.16}>
              <a
                href={inclusion.href}
                target="_blank"
                rel="noopener noreferrer"
                data-cursor="Read"
                className="group flex h-full flex-col justify-between rounded-[28px] bg-brand p-8 text-ink transition-transform duration-500 ease-expo hover:-rotate-1"
              >
                <p className="font-mono text-xs uppercase tracking-widest text-ink/60">From the blog</p>
                <p className="mt-6 text-2xl font-medium leading-tight tracking-[-0.03em]">{inclusion.title}</p>
                <span className="mt-6 text-sm font-medium">Read the story ↗</span>
              </a>
            </Reveal>
          )}
        </div>
      </div>
    </section>
  );
}
