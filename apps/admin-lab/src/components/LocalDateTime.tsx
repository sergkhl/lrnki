"use client";

import { useEffect, useState } from "react";

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

export function LocalDateTime({ iso }: Readonly<{ iso: string }>) {
  const [label, setLabel] = useState(() => formatUtcFallback(iso));

  useEffect(() => {
    setLabel(formatLocalDateTime(iso));
  }, [iso]);

  return <time dateTime={iso}>{label}</time>;
}
