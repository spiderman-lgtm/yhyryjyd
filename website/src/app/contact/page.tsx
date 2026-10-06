import type { Metadata } from "next";
import { Contact } from "@/components/sections/Contact";

export const metadata: Metadata = {
  title: "Contact",
  description: "Reach the right team at Walkover: our products, careers, the #YourIdea #OurResources programme, or our office in Indore.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return <Contact asPage index="01" />;
}
