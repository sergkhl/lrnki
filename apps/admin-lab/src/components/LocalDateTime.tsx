"use client";

import { useSyncExternalStore } from "react";

const LOCAL_DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  dateStyle: "medium",
  timeStyle: "short"
};

export type DateTimeValue = string | Date;

export function normalizeDateTimeValue(value: DateTimeValue): string {
  return value instanceof Date ? value.toISOString() : value;
}

export function formatUtcFallback(value: DateTimeValue): string {
  const iso = normalizeDateTimeValue(value);
  return iso.slice(0, 19).replace("T", " ") + " UTC";
}

export function formatLocalDateTime(value: DateTimeValue): string {
  const iso = normalizeDateTimeValue(value);
  return new Intl.DateTimeFormat(undefined, LOCAL_DATE_TIME_OPTIONS).format(new Date(iso));
}

const subscribeToNoopStore = () => () => {};

export function LocalDateTime({ iso }: Readonly<{ iso: DateTimeValue }>) {
  const normalizedIso = normalizeDateTimeValue(iso);
  const label = useSyncExternalStore(
    subscribeToNoopStore,
    () => formatLocalDateTime(normalizedIso),
    () => formatUtcFallback(normalizedIso)
  );

  return <time dateTime={normalizedIso}>{label}</time>;
}
