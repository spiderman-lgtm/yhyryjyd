"use client";

import { AnimatePresence, motion, useScroll, useTransform } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { SplitText } from "@/components/ui/SplitText";
import { NetworkField } from "@/components/visuals/NetworkField";
import { company, products } from "@/content/site";

const verbs = [
  { word: "talk", color: "#3D7BFF" },
  { word: "automate", color: "#FF6A3D" },
  { word: "think", color: "#9B7BFF" },
  { word: "account", color: "#22C59A" },
];

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], ["0%", "30%"]);
  const fade = useTransform(scrollYProgress, [0, 0.7], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.94]);
  const [i, setI] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % verbs.length), 2400);
    return () => clearInterval(t);
  }, []);

  return (
    <section ref={ref} aria-labelledby="hero-title" className="relative flex min-h-[100svh] flex-col overflow-hidden">
      <NetworkField className="absolute inset-0 h-full w-full" />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,var(--color-ink)_85%)]" />

      <motion.div style={{ y, opacity: fade, scale }} className="container-x relative flex flex-1 flex-col justify-center pb-16 pt-32">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="label mb-8 flex items-center gap-3"
        >
          <span className="inline-flex h-2 w-2 rounded-full bg-brand" />
          Product company · {company.city}, India · Est. {company.founded}
        </motion.div>

        <SplitText
          as="h1"
          id="hero-title"
          immediate
          delay={0.15}
          className="display text-[clamp(3.2rem,11vw,11rem)]"
          lines={["We don't do", "projects.", { text: "We build products.", serif: true, className: "text-brand" }]}
        />

        <div className="mt-12 grid gap-10 md:grid-cols-12 md:items-end">
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-xl text-lg leading-relaxed text-paper/70 md:col-span-6 md:text-xl"
          >
            Software that helps businesses{" "}
            <span className="relative inline-grid overflow-hidden align-bottom leading-[1.25]">
              <AnimatePresence initial={false}>
                <motion.span
                  key={verbs[i].word}
                  initial={{ y: "100%" }}
                  animate={{ y: "0%" }}
                  exit={{ y: "-100%" }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  className="col-start-1 row-start-1 font-serif text-[1.2em] italic"
                  style={{ color: verbs[i].color }}
                >
                  {verbs[i].word}.
                </motion.span>
              </AnimatePresence>
            </span>
            <br />
            The team behind MSG91, viaSocket, GTWY AI and Giddh — built in Indore, used across the world.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.85, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-wrap gap-3 md:col-span-6 md:justify-end"
          >
            <Button href="/#products">Explore products</Button>
            <Button href="/careers" variant="ghost">
              Join the team
            </Button>
          </motion.div>
        </div>
      </motion.div>

      <div className="relative border-y border-line bg-ink/60 py-4 backdrop-blur-sm" aria-label="Walkover products">
        <div className="flex overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_10%,#000_90%,transparent)]">
          <ul className="marquee flex shrink-0 items-center gap-12 pr-12" style={{ ["--marquee-duration" as string]: "36s" }}>
            {[...products, ...products, ...products, ...products].map((p, k) => (
              <li key={k} aria-hidden={k >= products.length} className="flex items-center gap-3 whitespace-nowrap text-sm text-paper/60">
                <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                <span className="font-medium text-paper">{p.name}</span>
                <span className="font-mono text-xs uppercase tracking-widest">{p.kicker}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
