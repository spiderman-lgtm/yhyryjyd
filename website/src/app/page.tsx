import { Contact } from "@/components/sections/Contact";
import { Explore } from "@/components/sections/Explore";
import { Hero } from "@/components/sections/Hero";
import { Insights } from "@/components/sections/Insights";
import { Products } from "@/components/sections/Products";
import { WhatIsWalkover } from "@/components/sections/WhatIsWalkover";

export default function Home() {
  return (
    <>
      <Hero />
      <WhatIsWalkover />
      <Products />
      <Explore index="03" />
      <Insights index="04" />
      <Contact index="05" />
    </>
  );
}
