"use client";

import { lazy, Suspense, useEffect, useState } from "react";

const DieScene = lazy(() => import("./DieScene"));

/** Loads the three.js scene only in the browser, after first paint. */
export function Hero3D() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // Skip WebGL entirely when the browser can't provide it.
    const ok = (() => {
      try {
        return !!document.createElement("canvas").getContext("webgl2");
      } catch {
        return false;
      }
    })();
    setReady(ok);
  }, []);
  if (!ready) return null;
  return (
    <Suspense fallback={null}>
      <DieScene />
    </Suspense>
  );
}
