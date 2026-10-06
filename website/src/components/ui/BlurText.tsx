"use client";

import { motion } from "framer-motion";

/** Words resolve out of a blur, one after another, when scrolled into view. */
export function BlurText({ text, className, as: Tag = "p", delay = 0, wordClassName }: { text: string; className?: string; as?: "p" | "h2" | "h3" | "span"; delay?: number; wordClassName?: (word: string, i: number) => string | undefined }) {
  const words = text.split(" ");
  return (
    <Tag className={className}>
      <motion.span className="inline" initial="hidden" whileInView="show" viewport={{ once: true, margin: "0px 0px -10% 0px" }} transition={{ staggerChildren: 0.06, delayChildren: delay }}>
        {words.map((w, i) => (
          <motion.span
            key={i}
            className={`inline-block ${wordClassName?.(w, i) ?? ""}`}
            variants={{
              hidden: { opacity: 0, filter: "blur(14px)", y: 12 },
              show: { opacity: 1, filter: "blur(0px)", y: 0, transition: { duration: 0.9, ease: [0.16, 1, 0.3, 1] } },
            }}
          >
            {w}
            {i < words.length - 1 ? " " : ""}
          </motion.span>
        ))}
      </motion.span>
    </Tag>
  );
}
