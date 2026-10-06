"use client";

import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { company, nav, products } from "@/content/site";
import { cn } from "@/lib/cn";
import { Logo } from "./Logo";

export function Nav() {
  const pathname = usePathname();
  const { scrollY } = useScroll();
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  useMotionValueEvent(scrollY, "change", (y) => {
    const prev = scrollY.getPrevious() ?? 0;
    setHidden(y > prev && y > 240 && !open);
    setScrolled(y > 24);
  });

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.documentElement.style.overflow = open ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : !href.includes("#") && pathname.startsWith(href));

  return (
    <>
      <motion.header
        className="fixed inset-x-0 top-0 z-50"
        animate={{ y: hidden ? "-110%" : "0%" }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="container-x flex items-center justify-between py-4">
          <Link href="/" aria-label="Walkover home" className="group relative z-10">
            <Logo />
          </Link>

          <nav
            aria-label="Primary"
            className={cn(
              "absolute left-1/2 hidden -translate-x-1/2 rounded-full border p-1 backdrop-blur-xl transition-colors duration-500 lg:block",
              scrolled ? "border-line bg-ink-2/70" : "border-transparent bg-transparent",
            )}
            onMouseLeave={() => setHovered(null)}
          >
            <ul className="flex items-center">
              {nav.map((item) => (
                <li key={item.href} className="relative">
                  <Link
                    href={item.href}
                    onMouseEnter={() => setHovered(item.href)}
                    aria-current={isActive(item.href) ? "page" : undefined}
                    className={cn(
                      "relative z-10 block px-4 py-2 text-[0.82rem] transition-colors",
                      isActive(item.href) ? "text-paper" : "text-paper/60 hover:text-paper",
                    )}
                  >
                    {item.label}
                    {isActive(item.href) && <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-brand" />}
                  </Link>
                  {hovered === item.href && (
                    <motion.span layoutId="nav-hover" className="absolute inset-0 rounded-full bg-paper/[0.08]" transition={{ type: "spring", stiffness: 400, damping: 34 }} />
                  )}
                </li>
              ))}
            </ul>
          </nav>

          <div className="relative z-10 flex items-center gap-3">
            <Link
              href="/careers"
              className="hidden items-center gap-2 rounded-full border border-line px-4 py-2 text-[0.8rem] text-paper/80 transition-colors hover:border-brand hover:text-paper sm:inline-flex"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-brand [animation:pulse-dot_2s_ease-in-out_infinite]" />
              We&apos;re hiring
            </Link>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-controls="mobile-menu"
              aria-label={open ? "Close menu" : "Open menu"}
              className="grid h-11 w-11 place-items-center rounded-full border border-line bg-ink-2/70 backdrop-blur-xl lg:hidden"
            >
              <span className="relative block h-3 w-5">
                <span className={cn("absolute left-0 h-px w-5 bg-paper transition-all duration-500 ease-expo", open ? "top-1.5 rotate-45" : "top-0")} />
                <span className={cn("absolute left-0 h-px w-5 bg-paper transition-all duration-500 ease-expo", open ? "top-1.5 -rotate-45" : "top-3")} />
              </span>
            </button>
          </div>
        </div>
      </motion.header>

      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="fixed inset-0 z-40 flex flex-col bg-ink pt-24 lg:hidden"
            initial={{ clipPath: "inset(0 0 100% 0)" }}
            animate={{ clipPath: "inset(0 0 0% 0)" }}
            exit={{ clipPath: "inset(0 0 100% 0)" }}
            transition={{ duration: 0.7, ease: [0.76, 0, 0.24, 1] }}
          >
            <nav aria-label="Mobile" className="container-x flex-1 overflow-y-auto">
              <ul>
                {nav.map((item, i) => (
                  <li key={item.href} className="overflow-hidden border-b border-line">
                    <motion.div
                      initial={{ y: "100%" }}
                      animate={{ y: 0 }}
                      transition={{ delay: 0.2 + i * 0.05, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <Link href={item.href} onClick={() => setOpen(false)} className="flex items-baseline justify-between py-4">
                        <span className="display text-[2.6rem]">{item.label}</span>
                        <span className="label">0{i + 1}</span>
                      </Link>
                    </motion.div>
                  </li>
                ))}
              </ul>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="py-8">
                <p className="label mb-3">Products</p>
                <div className="flex flex-wrap gap-2">
                  {products.map((p) => (
                    <a key={p.slug} href={p.url} target="_blank" rel="noopener noreferrer" className="rounded-full border border-line px-3 py-1.5 text-sm">
                      <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
                      {p.name}
                    </a>
                  ))}
                </div>
                <p className="mt-6 text-sm text-mute">{company.address.lines.join(", ")}</p>
              </motion.div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
