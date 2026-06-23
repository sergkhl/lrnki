"use client";

import { useSyncExternalStore } from "react";

const LOCAL_DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  dateStyle: "medium",
  timeStyle: "short"
};

export function formatUtcFallback(iso: string): string {
  return iso.slice(0, 19).replace("T", " ") + " UTC";
}

export function formatLocalDateTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, LOCAL_DATE_TIME_OPTIONS).format(new Date(iso));
}

const subscribeToNoopStore = () => () => {};

export function LocalDateTime({ iso }: Readonly<{ iso: string }>) {
  const label = useSyncExternalStore(
    subscribeToNoopStore,
    () => formatLocalDateTime(iso),
    () => formatUtcFallback(iso)
  );

  return <time dateTime={iso}>{label}</time>;
}
