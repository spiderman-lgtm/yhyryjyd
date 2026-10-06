"use client";

import { motion } from "framer-motion";
import { Fragment } from "react";

type Line = string | { text: string; serif?: boolean; className?: string };

/**
 * Masked line-by-line headline reveal. Each line slides up from behind a clip.
 * Pass `serif` on a line to render it in the italic accent face.
 */
export function SplitText({
  lines,
  as: Tag = "h2",
  className,
  delay = 0,
  immediate = false,
  id,
}: {
  id?: string;
  lines: Line[];
  as?: "h1" | "h2" | "h3" | "p";
  className?: string;
  delay?: number;
  immediate?: boolean;
}) {
  const trigger = immediate ? { animate: "show" } : { whileInView: "show", viewport: { once: true, margin: "0px 0px -15% 0px" } };
  return (
    <Tag id={id} className={className}>
      <motion.span initial="hidden" {...trigger} className="block" transition={{ staggerChildren: 0.09, delayChildren: delay }}>
        {lines.map((line, i) => {
          const l = typeof line === "string" ? { text: line } : line;
          return (
            <Fragment key={i}>
              <span className="block overflow-hidden pb-[0.08em] -mb-[0.08em]">
                <motion.span
                  className={`block ${l.serif ? "font-serif italic font-normal tracking-[-0.02em]" : ""} ${l.className ?? ""}`}
                  variants={{
                    hidden: { y: "110%", rotate: 2 },
                    show: { y: "0%", rotate: 0, transition: { duration: 1.1, ease: [0.16, 1, 0.3, 1] } },
                  }}
                >
                  {l.text}{" "}
                </motion.span>
              </span>
            </Fragment>
          );
        })}
      </motion.span>
    </Tag>
  );
}
