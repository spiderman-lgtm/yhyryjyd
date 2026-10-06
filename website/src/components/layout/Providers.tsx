"use client";

import { MotionConfig } from "framer-motion";
import { Cursor } from "@/components/ui/Cursor";
import { SmoothScroll } from "./SmoothScroll";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <SmoothScroll>
        {children}
        <Cursor />
      </SmoothScroll>
    </MotionConfig>
  );
}
