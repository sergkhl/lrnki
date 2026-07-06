"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Polls a server-rendered page while something is in flight: re-runs the server
// component read on an interval so live progress needs no manual reload. Renders
// nothing and stops as soon as `active` drops.
export function AutoRefresh({ active, intervalMs = 5000 }: Readonly<{ active: boolean; intervalMs?: number }>) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return undefined;
    const interval = window.setInterval(() => {
      router.refresh();
    }, intervalMs);
    return () => window.clearInterval(interval);
  }, [active, intervalMs, router]);
  return null;
}
