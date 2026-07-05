import { GemIcon } from "lucide-react";

export function GemCapstone({ collected }: Readonly<{ collected: boolean }>) {
  return (
    <GemIcon
      aria-label={collected ? "Collected" : "Not collected"}
      className={collected ? "fill-[color:var(--journal-gem)] text-[color:var(--journal-gem)]" : "text-[color:var(--journal-muted)]"}
    />
  );
}
