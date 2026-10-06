"use client";

import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "framer-motion";
import { useLayoutEffect, useRef, useState } from "react";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { SplitText } from "@/components/ui/SplitText";
import { products } from "@/content/site";
import { useMediaQuery } from "@/lib/hooks";
import { ProductCard } from "./ProductCard";

/**
 * Desktop: a pinned section whose cards travel horizontally as you scroll down.
 * Touch / small screens / reduced motion: a native swipeable, snap-scrolling row.
 */
export function Products() {
  const desktop = useMediaQuery("(min-width: 1024px)");
  const reduce = useReducedMotion();
  return desktop && !reduce ? <PinnedProducts /> : <SwipeProducts />;
}

function Intro() {
  return (
    <div className="flex h-full flex-col justify-between">
      <SectionLabel index="02">Our products</SectionLabel>
      <div>
        <SplitText
          id="products-title"
          className="display text-[clamp(3rem,6vw,6.5rem)]"
          lines={["Six products.", { text: "One obsession.", serif: true, className: "text-brand" }]}
        />
        <p className="mt-6 max-w-sm text-paper/70">
          Communication, automation, AI, accounting and docs. Each one is a company of its own — built, run and scaled by Walkover.
        </p>
      </div>
      <p className="label hidden lg:block">Scroll to explore →</p>
    </div>
  );
}

function PinnedProducts() {
  const section = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [distance, setDistance] = useState(0);

  useLayoutEffect(() => {
    const measure = () => {
      if (track.current) setDistance(Math.max(0, track.current.scrollWidth - window.innerWidth));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (track.current) ro.observe(track.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const { scrollYProgress } = useScroll({ target: section, offset: ["start start", "end end"] });
  const smooth = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.3 });
  const x = useTransform(smooth, (v) => -v * distance);
  const bar = useTransform(smooth, [0, 1], ["0%", "100%"]);

  return (
    <section id="products" ref={section} aria-labelledby="products-title" className="relative" style={{ height: `calc(100vh + ${distance}px)` }}>
      <div className="sticky top-0 flex h-screen flex-col justify-center overflow-hidden">
        <motion.div ref={track} style={{ x }} className="flex h-[78vh] max-h-[760px] items-stretch gap-6 pl-[var(--gutter)] will-change-transform">
          <div className="w-[min(36vw,520px)] shrink-0 py-2 pr-8">
            <Intro />
          </div>
          {products.map((p, i) => (
            <div key={p.slug} className="w-[min(34vw,480px)] shrink-0">
              <ProductCard product={p} index={i} />
            </div>
          ))}
          <div aria-hidden className="w-[var(--gutter)] shrink-0" />
        </motion.div>
        <div className="container-x mt-8">
          <div className="h-px w-full bg-line">
            <motion.div className="h-px bg-brand" style={{ width: bar }} />
          </div>
        </div>
      </div>
    </section>
  );
}

function SwipeProducts() {
  return (
    <section id="products" aria-labelledby="products-title" className="relative py-24">
      <div className="container-x mb-10">
        <Intro />
      </div>
      <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-[var(--gutter)] pb-6 [scrollbar-width:none]" role="list">
        {products.map((p, i) => (
          <div key={p.slug} role="listitem" className="w-[min(86vw,440px)] shrink-0 snap-center">
            <ProductCard product={p} index={i} />
          </div>
        ))}
      </div>
    </section>
  );
}
