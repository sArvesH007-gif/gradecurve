import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type BadgeTone = "neutral" | "positive" | "warning" | "info";
const tones: Record<BadgeTone, string> = {
  neutral: "border-white/10 bg-white/[0.04] text-muted",
  positive: "border-emerald/20 bg-emerald/10 text-emerald",
  warning: "border-amber-300/20 bg-amber-300/10 text-amber-200",
  info: "border-cyan/20 bg-cyan/10 text-cyan",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
