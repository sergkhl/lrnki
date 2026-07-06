"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function GenerationAutoRefresh({ active }: Readonly<{ active: boolean }>) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return undefined;
    const interval = window.setInterval(() => {
      router.refresh();
    }, 5000);
    return () => window.clearInterval(interval);
  }, [active, router]);
  return null;
}
