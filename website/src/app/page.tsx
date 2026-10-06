import { Careers } from "@/components/sections/Careers";
import { Contact } from "@/components/sections/Contact";
import { Culture } from "@/components/sections/Culture";
import { Experiments } from "@/components/sections/Experiments";
import { Hero } from "@/components/sections/Hero";
import { Innovation } from "@/components/sections/Innovation";
import { Insights } from "@/components/sections/Insights";
import { Journey } from "@/components/sections/Journey";
import { Products } from "@/components/sections/Products";
import { WhatIsWalkover } from "@/components/sections/WhatIsWalkover";

export default function Home() {
  return (
    <>
      <Hero />
      <WhatIsWalkover />
      <Products />
      <Journey />
      <Innovation />
      <Experiments />
      <Culture />
      <Careers />
      <Insights />
      <Contact />
    </>
  );
}
