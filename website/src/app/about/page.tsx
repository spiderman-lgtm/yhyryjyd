import type { Metadata } from "next";
import { Culture } from "@/components/sections/Culture";
import { Contact } from "@/components/sections/Contact";
import { Experiments } from "@/components/sections/Experiments";
import { Innovation } from "@/components/sections/Innovation";
import { Journey } from "@/components/sections/Journey";
import { PageHero } from "@/components/sections/PageHero";
import { WhatIsWalkover } from "@/components/sections/WhatIsWalkover";

export const metadata: Metadata = {
  title: "About",
  description: "The story of Walkover — from a 2006 college social network to a 2010 Indore startup to a family of communication, automation and AI products.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="About Walkover"
        lines={["Built in Indore.", { text: "Used everywhere.", serif: true, className: "text-brand" }]}
        intro="Walkover was founded in 2010 by siblings Pushpendra, Ankita and Shubhendra Agrawal in the heart of India. What began as college experiments became MSG91 — and then a whole family of products."
      />
      <WhatIsWalkover index="01" />
      <Journey index="02" />
      <Innovation index="03" />
      <Experiments index="04" />
      <Culture index="05" />
      <Contact />
    </>
  );
}
