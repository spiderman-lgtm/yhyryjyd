import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { SplitText } from "@/components/ui/SplitText";
import { perks } from "@/content/site";
import { Openings } from "./Openings";

export function Careers({ index = "07" }: { index?: string }) {
  return (
    <section id="careers" aria-labelledby="careers-title" className="relative py-24 md:py-32">
      <div className="container-x">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-28">
              <SectionLabel index={index}>Careers</SectionLabel>
              <SplitText
                id="careers-title"
                className="display mt-8 text-[clamp(2.8rem,5.6vw,5.6rem)]"
                lines={["Come build", { text: "the next one", serif: true, className: "text-brand" }, "with us."]}
              />
              <ul className="mt-12 grid gap-px overflow-hidden rounded-3xl border border-line bg-line sm:grid-cols-2">
                {perks.map((p, i) => (
                  <Reveal as="li" key={p.title} delay={i * 0.06} className="bg-ink p-6">
                    <p className="font-mono text-xs text-brand">0{i + 1}</p>
                    <p className="mt-3 font-medium">{p.title}</p>
                    <p className="mt-2 text-sm text-mute">{p.body}</p>
                  </Reveal>
                ))}
              </ul>
            </div>
          </div>

          <div className="lg:col-span-7 lg:pt-32">
            <h3 className="label mb-6">Open roles</h3>
            <Openings limit={5} />
            <div className="mt-10 flex flex-wrap gap-3">
              <Button href="/careers">Explore all jobs</Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
