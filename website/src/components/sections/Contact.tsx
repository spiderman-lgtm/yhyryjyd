"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import Link from "next/link";
import { useRef } from "react";
import { Magnetic } from "@/components/ui/Magnetic";
import { company, insights } from "@/content/site";

const routes = [
  { who: "For businesses", what: "Find the right product", href: "/products", internal: true },
  { who: "For builders", what: "Join the team", href: "/careers", internal: true },
  { who: "For founders", what: "#YourIdea #OurResources", href: insights[1].href },
  { who: "For everyone", what: "Follow along on LinkedIn", href: company.socials[0].href },
];

export function Contact() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end end"] });
  const x1 = useTransform(scrollYProgress, [0, 1], ["10%", "-20%"]);
  const x2 = useTransform(scrollYProgress, [0, 1], ["-30%", "0%"]);

  return (
    <section id="contact" ref={ref} aria-labelledby="contact-title" className="relative overflow-hidden bg-brand pb-16 pt-28 text-ink md:pt-40">
      <h2 id="contact-title" className="sr-only">
        Contact Walkover
      </h2>
      <div aria-hidden className="select-none">
        <motion.p style={{ x: x1 }} className="display whitespace-nowrap text-[clamp(5rem,17vw,17rem)]">
          Let&apos;s build something
        </motion.p>
        <motion.p style={{ x: x2 }} className="display whitespace-nowrap font-serif text-[clamp(5rem,17vw,17rem)] font-normal italic">
          worth using. worth using.
        </motion.p>
      </div>

      <div className="container-x relative mt-16 grid gap-12 md:grid-cols-12 md:items-center">
        <div className="flex justify-center md:col-span-4 md:justify-start">
          <Magnetic strength={0.5}>
            <a
              href={company.address.mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative grid h-48 w-48 place-items-center rounded-full bg-ink text-center text-paper transition-transform duration-500 ease-expo hover:scale-105 md:h-56 md:w-56"
            >
              <span className="absolute inset-3 rounded-full border border-dashed border-paper/25 [animation:spin-slow_18s_linear_infinite]" />
              <span className="text-lg font-medium leading-tight">
                Visit us
                <br />
                <span className="font-serif text-2xl italic text-brand">in Indore</span>
              </span>
            </a>
          </Magnetic>
        </div>

        <ul className="grid gap-px overflow-hidden rounded-3xl bg-ink/15 sm:grid-cols-2 md:col-span-8">
          {routes.map((r) => {
            const inner = (
              <>
                <span className="font-mono text-xs uppercase tracking-widest text-ink/60">{r.who}</span>
                <span className="mt-3 flex items-center justify-between gap-4 text-xl font-medium tracking-[-0.02em]">
                  {r.what}
                  <span className="transition-transform duration-500 group-hover:translate-x-1 group-hover:-translate-y-1">↗</span>
                </span>
              </>
            );
            const cls = "group flex h-full flex-col bg-brand p-6 transition-colors duration-500 hover:bg-ink hover:text-paper [&:hover_span:first-child]:text-paper/50";
            return (
              <li key={r.who}>
                {r.internal ? (
                  <Link href={r.href} className={cls}>
                    {inner}
                  </Link>
                ) : (
                  <a href={r.href} target="_blank" rel="noopener noreferrer" className={cls}>
                    {inner}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="container-x mt-16 grid gap-6 border-t border-ink/15 pt-8 text-sm md:grid-cols-3">
        <address className="not-italic">
          <span className="font-mono text-xs uppercase tracking-widest text-ink/60">Office</span>
          <span className="mt-2 block">{company.legalName}</span>
          {company.address.lines.map((l) => (
            <span key={l} className="block">
              {l}
            </span>
          ))}
        </address>
        <div>
          <span className="font-mono text-xs uppercase tracking-widest text-ink/60">Follow</span>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {company.socials.map((s) => (
              <li key={s.href}>
                <a href={s.href} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <span className="font-mono text-xs uppercase tracking-widest text-ink/60">Careers</span>
          <a href={company.urls.careers} target="_blank" rel="noopener noreferrer" className="mt-2 block underline-offset-4 hover:underline">
            walkover.in/careers
          </a>
        </div>
      </div>
    </section>
  );
}
