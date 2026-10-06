"use client";

import { TiltCard } from "@/components/ui/TiltCard";
import { ProductVisual } from "@/components/visuals/ProductVisual";
import type { Product } from "@/content/site";

export function ProductCard({ product, index }: { product: Product; index: number }) {
  return (
    <TiltCard glow={`${product.color}33`} className="h-full">
      <a
        href={product.url}
        target="_blank"
        rel="noopener noreferrer"
        data-cursor="Visit"
        aria-label={`${product.name} — ${product.oneLiner} (opens ${product.url})`}
        className="group relative flex h-full flex-col overflow-hidden rounded-[28px] border border-line bg-ink-2 p-6 transition-colors duration-500 hover:border-transparent md:p-8"
        style={{ ["--pc" as string]: product.color }}
      >
        <span
          aria-hidden
          className="absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-700 group-hover:opacity-100"
          style={{ background: `linear-gradient(160deg, ${product.ink} 0%, #0e0e13 70%)`, boxShadow: `inset 0 0 0 1px ${product.color}55` }}
        />
        <div className="relative flex items-center justify-between">
          <span className="label">
            {String(index + 1).padStart(2, "0")} / {product.kicker}
          </span>
          {product.since && <span className="font-mono text-xs text-dim">Since {product.since}</span>}
        </div>

        <div className="relative -mx-4 my-4 flex-1 [transform:translateZ(40px)]">
          <ProductVisual product={product} className="mx-auto h-full max-h-[300px] w-full transition-transform duration-700 ease-expo group-hover:scale-[1.04]" />
        </div>

        <div className="relative [transform:translateZ(30px)]">
          <h3 className="display text-[clamp(2.4rem,4vw,3.6rem)]">
            {product.name}
            <span className="ml-2 inline-block h-3 w-3 rounded-full align-middle" style={{ background: product.color }} />
          </h3>
          <p className="mt-2 text-lg text-paper/80">{product.oneLiner}</p>

          <div className="grid grid-rows-[1fr] transition-[grid-template-rows] duration-700 ease-expo [@media(hover:hover)]:grid-rows-[0fr] [@media(hover:hover)]:group-hover:grid-rows-[1fr] [@media(hover:hover)]:group-focus-visible:grid-rows-[1fr]">
            <div className="overflow-hidden">
              <p className="pt-4 text-sm leading-relaxed text-mute">{product.description}</p>
              <ul className="mt-4 flex flex-wrap gap-2">
                {product.points.map((pt) => (
                  <li key={pt} className="rounded-full border border-paper/15 px-3 py-1 text-xs text-paper/80">
                    {pt}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <span className="mt-6 inline-flex items-center gap-2 text-sm font-medium" style={{ color: product.color }}>
            Visit {product.name}
            <span className="transition-transform duration-500 group-hover:translate-x-1 group-hover:-translate-y-1">↗</span>
          </span>
        </div>
      </a>
    </TiltCard>
  );
}
