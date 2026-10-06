"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { BlurText } from "@/components/ui/BlurText";
import { Button } from "@/components/ui/Button";
import { Magnetic } from "@/components/ui/Magnetic";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { SplitText } from "@/components/ui/SplitText";
import { Aurora } from "@/components/visuals/Aurora";
import { company, insights, openings, products } from "@/content/site";
import { cn } from "@/lib/cn";

const intents = [
  { key: "product", label: "I need a product", glyph: "◆" },
  { key: "join", label: "I want to join", glyph: "✦" },
  { key: "idea", label: "I have an idea", glyph: "◎" },
  { key: "visit", label: "I want to visit", glyph: "⌖" },
] as const;
type Intent = (typeof intents)[number]["key"];

/**
 * Contact as a guided conversation: the visitor picks why they're here and a
 * glass panel answers with the right next step. Aurora light follows the cursor.
 */
export function Contact({ asPage = false, index = "09" }: { asPage?: boolean; index?: string }) {
  const [intent, setIntent] = useState<Intent>("product");

  return (
    <section
      id="contact"
      aria-labelledby="contact-title"
      className={cn("relative isolate overflow-hidden border-t border-line", asPage ? "pb-24 pt-36 md:pt-44" : "py-24 md:py-32")}
    >
      <Aurora intensity={0.45} follow variant="vivid" className="-z-10" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-40 [background-image:linear-gradient(rgb(255_255_255/0.05)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.05)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:radial-gradient(ellipse_at_center,#000_20%,transparent_75%)]"
      />

      <div className="container-x">
        <SectionLabel index={index}>Contact</SectionLabel>
        <SplitText
          as={asPage ? "h1" : "h2"}
          id="contact-title"
          immediate={asPage}
          className="display mt-8 text-[clamp(3rem,8vw,8rem)]"
          lines={["Let's build", { text: "something together.", serif: true, className: "text-aurora" }]}
        />
        <BlurText
          className="mt-8 max-w-xl text-lg leading-relaxed text-paper/70 md:text-xl"
          text="Tell us why you're here and we'll point you to the fastest way to reach the right people at Walkover."
        />

        <div className="mt-14 grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <div role="tablist" aria-label="What brings you here?" className="glass flex flex-wrap gap-1 rounded-[22px] p-1.5">
              {intents.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  id={`intent-${t.key}`}
                  aria-selected={intent === t.key}
                  aria-controls="intent-panel"
                  onClick={() => setIntent(t.key)}
                  className={cn(
                    "relative flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-[16px] px-4 py-3 text-sm transition-colors",
                    intent === t.key ? "text-ink" : "text-paper/70 hover:text-paper",
                  )}
                >
                  {intent === t.key && (
                    <motion.span layoutId="intent-pill" className="absolute inset-0 rounded-[16px] bg-paper shadow-[0_0_40px_rgba(201,211,255,0.45)]" transition={{ type: "spring", stiffness: 380, damping: 32 }} />
                  )}
                  <span aria-hidden className="relative">
                    {t.glyph}
                  </span>
                  <span className="relative">{t.label}</span>
                </button>
              ))}
            </div>

            <div id="intent-panel" role="tabpanel" aria-labelledby={`intent-${intent}`} className="glass relative mt-4 min-h-[340px] overflow-hidden rounded-[28px] p-6 md:p-10">
              <AnimatePresence mode="wait">
                <motion.div
                  key={intent}
                  initial={{ opacity: 0, filter: "blur(12px)", y: 16 }}
                  animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
                  exit={{ opacity: 0, filter: "blur(12px)", y: -10 }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                >
                  {intent === "product" && <ProductPanel />}
                  {intent === "join" && <JoinPanel />}
                  {intent === "idea" && <IdeaPanel />}
                  {intent === "visit" && <VisitPanel />}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          <div className="flex flex-col gap-6 lg:col-span-4">
            <IndoreClock />
            <div className="glass rounded-[28px] p-6 md:p-8">
              <p className="label">Follow Walkover</p>
              <ul className="mt-5 flex flex-wrap gap-2">
                {company.socials.map((s) => (
                  <li key={s.href}>
                    <Magnetic strength={0.4}>
                      <a
                        href={s.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-full border border-paper/15 bg-paper/5 px-4 py-2 text-sm text-paper/85 backdrop-blur transition-colors hover:border-paper/40 hover:bg-paper hover:text-ink"
                      >
                        {s.label} <span aria-hidden>↗</span>
                      </a>
                    </Magnetic>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      <p
        aria-hidden
        className="pointer-events-none mt-24 select-none text-center text-[clamp(5rem,22vw,22rem)] font-semibold leading-[0.8] tracking-[-0.06em] text-transparent [-webkit-text-stroke:1px_rgb(255_255_255/0.14)] [mask-image:linear-gradient(to_bottom,#000_30%,transparent)]"
      >
        walkover
      </p>
    </section>
  );
}

function PanelHead({ title, body }: { title: string; body: string }) {
  return (
    <div className="mb-8 max-w-xl">
      <h3 className="text-[clamp(1.6rem,3vw,2.4rem)] font-medium leading-tight tracking-[-0.03em]">{title}</h3>
      <p className="mt-3 text-paper/65">{body}</p>
    </div>
  );
}

function ProductPanel() {
  return (
    <>
      <PanelHead title="Talk to the team behind the product." body="Each Walkover product has its own team, docs and support. Pick yours and go straight to them." />
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {products.map((p, i) => (
          <motion.li key={p.slug} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }}>
            <a
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative flex items-center justify-between gap-3 overflow-hidden rounded-2xl border border-paper/10 bg-paper/[0.04] px-4 py-3.5 transition-colors hover:border-paper/30"
            >
              <span aria-hidden className="absolute -left-6 top-1/2 h-16 w-16 -translate-y-1/2 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-70" style={{ background: p.color }} />
              <span className="relative">
                <span className="flex items-center gap-2 font-medium">
                  <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                  {p.name}
                </span>
                <span className="mt-0.5 block text-xs text-mute">{p.kicker}</span>
              </span>
              <span aria-hidden className="relative text-paper/50 transition-transform duration-500 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-paper">
                ↗
              </span>
            </a>
          </motion.li>
        ))}
      </ul>
    </>
  );
}

function JoinPanel() {
  return (
    <>
      <PanelHead title={`${openings.length} roles open right now.`} body="Engineering, AI, growth and internships, in Indore and remote. Small teams, real products, real users." />
      <ul className="divide-y divide-paper/10 border-y border-paper/10">
        {openings.slice(0, 3).map((o) => (
          <li key={o.role} className="flex items-center justify-between gap-4 py-3.5">
            <span className="font-medium">{o.role}</span>
            <span className="shrink-0 text-sm text-mute">{o.location}</span>
          </li>
        ))}
      </ul>
      <div className="mt-8">
        <Button href="/careers">See every opening</Button>
      </div>
    </>
  );
}

function IdeaPanel() {
  const post = insights.find((p) => p.href.includes("invest")) ?? insights[0];
  return (
    <>
      <PanelHead
        title="#YourIdea #OurResources"
        body="Walkover backs ideas worth building with its team, infrastructure and 15+ years of shipping products. If you have one, start here."
      />
      <div className="flex flex-wrap gap-3">
        <Button href={post.href} external>
          Read how it works
        </Button>
        <Button href={company.socials[0].href} external variant="ghost">
          Message us on LinkedIn
        </Button>
      </div>
    </>
  );
}

function VisitPanel() {
  const [copied, setCopied] = useState(false);
  const full = `${company.legalName}, ${company.address.lines.join(", ")}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <>
      <PanelHead title="Come say hello in Indore." body="Our home base is in the heart of India." />
      <address className="select-all not-italic leading-relaxed text-paper/85">
        <span className="block font-medium text-paper">{company.legalName}</span>
        {company.address.lines.map((l) => (
          <span key={l} className="block">
            {l}
          </span>
        ))}
      </address>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button href={company.address.mapUrl} external>
          Open in Maps
        </Button>
        <button type="button" onClick={copy} className="rounded-full border border-paper/20 px-6 py-3.5 text-sm transition-colors hover:border-paper/60" aria-live="polite">
          {copied ? "Address copied" : "Copy address"}
        </button>
      </div>
    </>
  );
}

/** Live local time at the Indore office (IST). Renders after mount to avoid hydration drift. */
function IndoreClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const parts = now
    ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(now)
    : null;
  const get = (type: string) => parts?.find((p) => p.type === type)?.value ?? "--";
  const hour = Number(get("hour"));
  const day = parts ? hour >= 6 && hour < 19 : true;

  return (
    <div className="glass relative overflow-hidden rounded-[28px] p-6 md:p-8">
      <div aria-hidden className={cn("absolute -right-10 -top-10 h-40 w-40 rounded-full blur-3xl transition-colors duration-1000", day ? "bg-[#ffd27a]/40" : "bg-[#6b7bff]/40")} />
      <p className="label relative">Indore, India · IST</p>
      <p className="relative mt-5 font-mono text-[clamp(2.6rem,5vw,3.6rem)] font-medium tabular-nums tracking-tight" suppressHydrationWarning>
        {get("hour")}:{get("minute")}
        <span className="text-paper/35">:{get("second")}</span>
      </p>
      <p className="relative mt-2 text-sm text-mute">{parts ? (day ? "Daytime at the office" : "Night-time in Indore right now") : "Local time at our office"}</p>
    </div>
  );
}
