"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { SplitText } from "@/components/ui/SplitText";
import { company, insights, type Insight } from "@/content/site";

export function Insights({ index = "08" }: { index?: string }) {
  return (
    <section id="insights" aria-labelledby="insights-title" className="relative py-24 md:py-32">
      <div className="container-x">
        <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <div>
            <SectionLabel index={index}>Insights</SectionLabel>
            <SplitText id="insights-title" className="display mt-8 text-[clamp(2.8rem,6vw,6rem)]" lines={["Notes from", { text: "the workshop.", serif: true }]} />
          </div>
          <Button href={company.urls.blog} external variant="ghost">
            Read Walkover Insights
          </Button>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {insights.map((post, i) => (
            <InsightCard key={post.href} post={post} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

function InsightCard({ post, index }: { post: Insight; index: number }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      transition={{ duration: 0.9, delay: index * 0.1, ease: [0.16, 1, 0.3, 1] }}
      className={index === 1 ? "md:mt-16" : undefined}
    >
      <a href={post.href} target="_blank" rel="noopener noreferrer" data-cursor="Read" className="group block">
        <motion.div
          initial={{ clipPath: "inset(100% 0 0 0)" }}
          whileInView={{ clipPath: "inset(0% 0 0 0)" }}
          viewport={{ once: true }}
          transition={{ duration: 1.2, delay: 0.1 + index * 0.1, ease: [0.76, 0, 0.24, 1] }}
          className="relative aspect-[4/5] overflow-hidden rounded-[24px]"
          style={{ background: post.tone }}
        >
          <div className="absolute inset-0 transition-transform duration-[1.2s] ease-expo group-hover:scale-110">
            <Cover tone={post.tone} seed={index} />
          </div>
          <span className="absolute left-5 top-5 rounded-full bg-ink/80 px-3 py-1 font-mono text-[0.7rem] uppercase tracking-widest text-paper backdrop-blur">{post.tag}</span>
          <span className="absolute bottom-5 right-5 grid h-12 w-12 translate-y-4 place-items-center rounded-full bg-ink text-paper opacity-0 transition-all duration-500 ease-expo group-hover:translate-y-0 group-hover:opacity-100">
            ↗
          </span>
        </motion.div>
        <h3 className="mt-6 text-2xl font-medium leading-tight tracking-[-0.03em] decoration-brand decoration-2 underline-offset-4 group-hover:underline">{post.title}</h3>
        <p className="mt-3 text-mute">{post.excerpt}</p>
      </a>
    </motion.article>
  );
}

/** Generative editorial cover — no stock imagery. */
function Cover({ tone, seed }: { tone: string; seed: number }) {
  const shapes = [
    <g key="a">
      {Array.from({ length: 9 }).map((_, i) => (
        <circle key={i} cx="200" cy="250" r={30 + i * 26} fill="none" stroke="#07070a" strokeOpacity={0.12 + i * 0.02} strokeWidth="1.5" />
      ))}
      <circle cx="200" cy="250" r="44" fill="#07070a" />
    </g>,
    <g key="b">
      {Array.from({ length: 12 }).map((_, i) => (
        <rect key={i} x={20 + (i % 4) * 92} y={40 + Math.floor(i / 4) * 140} width="80" height="120" rx="40" fill="#07070a" fillOpacity={i === 5 ? 1 : 0.1} />
      ))}
    </g>,
    <g key="c">
      {Array.from({ length: 14 }).map((_, i) => (
        <path key={i} d={`M -20 ${60 + i * 34} Q 200 ${-40 + i * 40} 420 ${60 + i * 34}`} fill="none" stroke="#07070a" strokeOpacity={0.15 + (i === 7 ? 0.85 : 0)} strokeWidth={i === 7 ? 6 : 1.5} />
      ))}
    </g>,
  ];
  return (
    <svg viewBox="0 0 400 500" preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden style={{ background: tone }}>
      {shapes[seed % shapes.length]}
    </svg>
  );
}
