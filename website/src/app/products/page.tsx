import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/sections/PageHero";
import { ProductShowcase } from "@/components/sections/ProductShowcase";
import { Contact } from "@/components/sections/Contact";
import { products } from "@/content/site";

export const metadata: Metadata = {
  title: "Products",
  description: "MSG91, viaSocket, GTWY AI, Giddh, 50Agents and DocStar — the Walkover family of communication, automation and AI products.",
  alternates: { canonical: "/products" },
};

export default function ProductsPage() {
  return (
    <>
      <PageHero
        eyebrow="The Walkover family"
        lines={["Products that", { text: "run businesses.", serif: true, className: "text-aurora" }]}
        intro="From the messaging backbone behind thousands of companies to AI that anyone can put to work — every product here was imagined, built and scaled by Walkover."
      />
      <nav aria-label="Jump to product" className="container-x -mt-6 mb-16 flex flex-wrap gap-2">
        {products.map((p) => (
          <Link key={p.slug} href={`#${p.slug}`} className="group inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm text-paper/70 transition-colors hover:border-paper/40 hover:text-paper">
            <span className="h-2 w-2 rounded-full transition-transform group-hover:scale-150" style={{ background: p.color }} />
            {p.name}
          </Link>
        ))}
      </nav>
      {products.map((p, i) => (
        <ProductShowcase key={p.slug} product={p} index={i} />
      ))}
      <Contact index="07" />
    </>
  );
}
