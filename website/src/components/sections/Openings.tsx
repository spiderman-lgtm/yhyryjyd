"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { company, openings, type Opening } from "@/content/site";
import { cn } from "@/lib/cn";

const teams = ["All", ...Array.from(new Set(openings.map((o) => o.team)))] as const;

/** Filterable list of open roles; every row links out to the live careers page. */
export function Openings({ limit }: { limit?: number }) {
  const [team, setTeam] = useState<string>("All");
  const list = openings.filter((o) => team === "All" || o.team === team).slice(0, limit);

  return (
    <div>
      <div role="group" aria-label="Filter roles by team" className="flex flex-wrap gap-2">
        {teams.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={team === t}
            onClick={() => setTeam(t)}
            className={cn(
              "relative rounded-full border px-4 py-2 text-sm transition-colors",
              team === t ? "border-brand text-ink" : "border-line text-paper/70 hover:border-paper/40",
            )}
          >
            {team === t && <motion.span layoutId={`team-filter-${limit ?? "all"}`} className="absolute inset-0 rounded-full bg-brand" transition={{ type: "spring", stiffness: 400, damping: 34 }} />}
            <span className="relative">{t}</span>
          </button>
        ))}
      </div>

      <ul className="mt-8 border-t border-line">
        <AnimatePresence mode="popLayout" initial={false}>
          {list.map((o) => (
            <motion.li key={o.role} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
              <OpeningRow o={o} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <p className="mt-4 text-xs text-dim">Openings change often — the live list is always on our careers page.</p>
    </div>
  );
}

function OpeningRow({ o }: { o: Opening }) {
  return (
    <a
      href={company.urls.careers}
      target="_blank"
      rel="noopener noreferrer"
      data-cursor="Apply"
      className="group relative grid grid-cols-[1fr_auto] items-center gap-4 overflow-hidden border-b border-line py-6 md:grid-cols-[1.6fr_1fr_1fr_auto] md:py-7"
    >
      <span aria-hidden className="absolute inset-0 origin-bottom scale-y-0 bg-paper transition-transform duration-500 ease-expo group-hover:scale-y-100" />
      <span className="relative text-xl font-medium tracking-[-0.02em] transition-colors duration-500 group-hover:translate-x-3 group-hover:text-ink md:text-2xl">{o.role}</span>
      <span className="relative hidden text-sm text-mute transition-colors duration-500 group-hover:text-ink/70 md:block">{o.team}</span>
      <span className="relative hidden text-sm text-mute transition-colors duration-500 group-hover:text-ink/70 md:block">
        {o.location} · {o.type}
      </span>
      <span className="relative grid h-10 w-10 place-items-center rounded-full border border-line transition-all duration-500 group-hover:-rotate-45 group-hover:border-ink group-hover:bg-ink group-hover:text-brand">→</span>
    </a>
  );
}
