"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { Button } from "@/components/ui/Button";
import { ProductVisual } from "@/components/visuals/ProductVisual";
import type { Product } from "@/content/site";
import { cn } from "@/lib/cn";

/** One full-width product chapter with a parallaxing visual. Alternates sides. */
export function ProductShowcase({ product, index }: { product: Product; index: number }) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [60, -60]);
  const rotate = useTransform(scrollYProgress, [0, 1], [index % 2 ? 4 : -4, index % 2 ? -4 : 4]);
  const flip = index % 2 === 1;

  return (
    <section ref={ref} id={product.slug} aria-labelledby={`${product.slug}-title`} className="relative border-t border-line py-20 md:py-32">
      <div className="container-x grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
        <motion.div style={{ y, rotate }} className={cn("relative", flip && "lg:order-2")}>
          <div className="relative overflow-hidden rounded-[32px] border border-line" style={{ background: `linear-gradient(150deg, ${product.ink}, #0e0e13 70%)` }}>
            <ProductVisual product={product} className="aspect-[4/3] w-full" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "0px 0px -15% 0px" }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="label flex items-center gap-3">
            <span style={{ color: product.color }}>{String(index + 1).padStart(2, "0")}</span>
            <span className="h-px w-8 bg-paper/20" />
            {product.kicker}
            {product.since && <span className="text-dim">· since {product.since}</span>}
          </p>
          <h2 id={`${product.slug}-title`} className="display mt-6 text-[clamp(3rem,7vw,6.5rem)]">
            {product.name}
          </h2>
          <p className="mt-4 font-display text-[clamp(1.5rem,2.6vw,2.2rem)] font-semibold leading-tight tracking-[-0.03em]" style={{ color: product.color }}>
            {product.oneLiner}
          </p>
          <p className="mt-6 max-w-lg leading-relaxed text-paper/70">{product.description}</p>
          <ul className="mt-8 grid gap-3 sm:grid-cols-3">
            {product.points.map((pt) => (
              <li key={pt} className="rounded-2xl border border-line bg-ink-2 p-4 text-sm text-paper/80">
                <span className="mb-3 block h-1.5 w-6 rounded-full" style={{ background: product.color }} />
                {pt}
              </li>
            ))}
          </ul>
          <div className="mt-10">
            <Button href={product.url} external variant="ghost">
              Visit {product.name}
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
