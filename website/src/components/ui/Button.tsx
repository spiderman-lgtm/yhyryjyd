import Link from "next/link";
import { cn } from "@/lib/cn";
import { Magnetic } from "./Magnetic";

type Props = {
  href: string;
  children: React.ReactNode;
  variant?: "solid" | "ghost";
  external?: boolean;
  className?: string;
};

export function Button({ href, children, variant = "solid", external, className }: Props) {
  const classes = cn(
    "group relative inline-flex items-center gap-3 overflow-hidden rounded-full px-6 py-3.5 text-sm font-medium transition-colors duration-300",
    variant === "solid" ? "glass text-paper hover:text-ink" : "border border-paper/20 text-paper hover:border-paper/60",
    className,
  );
  const inner = (
    <>
      <span
        aria-hidden
        className={cn(
          "absolute inset-0 origin-bottom scale-y-0 rounded-full transition-transform duration-500 ease-expo group-hover:scale-y-100",
          variant === "solid" ? "bg-paper" : "bg-paper/10",
        )}
      />
      <span className="relative">{children}</span>
      <span aria-hidden className="relative grid h-5 w-5 place-items-center overflow-hidden">
        <span className="transition-transform duration-500 ease-expo group-hover:-translate-y-5 group-hover:translate-x-5">↗</span>
        <span className="absolute -translate-x-5 translate-y-5 transition-transform duration-500 ease-expo group-hover:translate-x-0 group-hover:translate-y-0">↗</span>
      </span>
    </>
  );
  return (
    <Magnetic>
      {external ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className={classes}>
          {inner}
        </a>
      ) : (
        <Link href={href} className={classes}>
          {inner}
        </Link>
      )}
    </Magnetic>
  );
}
