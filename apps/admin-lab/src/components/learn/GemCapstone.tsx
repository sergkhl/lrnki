import { GemIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function GemCapstone({ collected }: Readonly<{ collected: boolean }>) {
  return (
    <Badge variant={collected ? "secondary" : "outline"} className="w-fit">
      <GemIcon data-icon="inline-start" />
      {collected ? "Collected" : "Uncut"}
    </Badge>
  );
}
