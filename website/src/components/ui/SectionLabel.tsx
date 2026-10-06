import { cn } from "@/lib/cn";

/** Small mono eyebrow: "01 —— Section name". Use `onLight` on paper-coloured sections. */
export function SectionLabel({ index, children, onLight }: { index: string; children: React.ReactNode; onLight?: boolean }) {
  return (
    <div className={cn("label flex items-center gap-3", onLight && "text-ink/60")}>
      <span className={onLight ? "text-ink" : "text-brand"}>{index}</span>
      <span className={cn("h-px w-8", onLight ? "bg-ink/20" : "bg-paper/20")} />
      <span>{children}</span>
    </div>
  );
}
