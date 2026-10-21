'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';

export default function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {}
      }}
      className="rounded-lg border-2 border-dashed border-brand bg-brand-light px-3 py-1.5 font-mono text-sm font-bold text-brand-dark"
    >
      {copied ? 'Copied ✓' : code}
    </motion.button>
  );
}
