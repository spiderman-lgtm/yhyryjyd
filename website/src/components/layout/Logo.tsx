import Image from "next/image";

/** Walkover's official mark (the red die) with the wordmark. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Image src="/brand/walkover-logo.png" alt="" width={34} height={34} priority className="h-[34px] w-[34px] transition-transform duration-700 ease-expo group-hover:rotate-[20deg]" />
      <span className="text-[1.2rem] font-semibold tracking-[-0.04em]">walkover</span>
    </span>
  );
}
