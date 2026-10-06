import type { Metadata } from "next";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Culture } from "@/components/sections/Culture";
import { Openings } from "@/components/sections/Openings";
import { Aurora } from "@/components/visuals/Aurora";
import { PageHero } from "@/components/sections/PageHero";
import { company, perks } from "@/content/site";

export const metadata: Metadata = {
  title: "Careers",
  description: "Join Walkover in Indore — own real products used by thousands of businesses, ship from week one and experiment freely.",
  alternates: { canonical: "/careers" },
};

export default function CareersPage() {
  return (
    <>
      <PageHero
        eyebrow="Careers at Walkover"
        lines={["Don't join a project.", { text: "Own a product.", serif: true, className: "text-aurora" }]}
        intro="Small teams, real users, real scale. At Walkover you'll work on products that move billions of messages, power automations and put AI to work — from week one."
      />

      <section aria-labelledby="why-title" className="container-x py-16">
        <SectionLabel index="01">Why Walkover</SectionLabel>
        <h2 id="why-title" className="sr-only">
          Why join Walkover
        </h2>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {perks.map((p, i) => (
            <Reveal as="li" key={p.title} delay={i * 0.08} className="group rounded-[28px] border border-line bg-ink-2 p-8 transition-colors duration-500 hover:border-brand/50">
              <p className="display text-6xl text-paper/15 transition-colors duration-500 group-hover:text-brand">0{i + 1}</p>
              <p className="mt-10 text-xl font-medium tracking-[-0.02em]">{p.title}</p>
              <p className="mt-3 text-sm text-mute">{p.body}</p>
            </Reveal>
          ))}
        </ul>
      </section>

      <section id="openings" aria-labelledby="openings-title" className="container-x py-24">
        <div className="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <SectionLabel index="02">Open roles</SectionLabel>
            <h2 id="openings-title" className="display mt-6 text-[clamp(2.6rem,5vw,4.8rem)]">
              Find your <span className="font-extrabold text-aurora">next problem.</span>
            </h2>
          </div>
          <Button href={company.urls.careers} external>
            Apply on walkover.in
          </Button>
        </div>
        <Openings />
      </section>

      <section aria-labelledby="avengers-title" className="container-x pb-12">
        <Reveal className="glass relative isolate overflow-hidden rounded-[32px] p-8 md:p-14">
          <Aurora intensity={0.6} follow className="-z-10" />
          <p className="label">Internship programme</p>
          <h2 id="avengers-title" className="display mt-6 text-[clamp(2.4rem,5vw,4.6rem)]">
            Walkover <span className="font-extrabold text-aurora">Avengers</span>
          </h2>
          <p className="mt-6 max-w-xl text-lg text-paper/75">
            A six-month mission in Indore for students and freshers: build real features for real products, alongside the people who run them — with the chance of a pre-placement offer at the end.
          </p>
          <div className="mt-8">
            <a href={company.urls.careers} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-paper px-6 py-3.5 text-sm font-medium text-ink transition-transform hover:scale-105">
              Join the mission ↗
            </a>
          </div>
        </Reveal>
      </section>

      <Culture index="03" />
    </>
  );
}
