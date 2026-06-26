import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { formatLocalDateTime, formatUtcFallback, LocalDateTime, normalizeDateTimeValue } from "./LocalDateTime";

test("LocalDateTime renders a UTC ISO fallback before client hydration", () => {
  const html = renderToStaticMarkup(<LocalDateTime iso="2026-06-20T14:05:30.000Z" />);

  assert.equal(html, '<time dateTime="2026-06-20T14:05:30.000Z">2026-06-20 14:05:30 UTC</time>');
  assert.equal(formatUtcFallback("2026-06-20T14:05:30.000Z"), "2026-06-20 14:05:30 UTC");
});

test("LocalDateTime accepts Date values from SQL-backed server loaders", () => {
  const createdAt = new Date("2026-06-20T14:05:30.000Z");
  const html = renderToStaticMarkup(<LocalDateTime iso={createdAt} />);

  assert.equal(normalizeDateTimeValue(createdAt), "2026-06-20T14:05:30.000Z");
  assert.equal(html, '<time dateTime="2026-06-20T14:05:30.000Z">2026-06-20 14:05:30 UTC</time>');
  assert.equal(formatUtcFallback(createdAt), "2026-06-20 14:05:30 UTC");
});

test("formatLocalDateTime uses the browser locale formatter with medium date and short time", () => {
  const original = Intl.DateTimeFormat;
  Object.defineProperty(Intl, "DateTimeFormat", {
    configurable: true,
    value: function mockedDateTimeFormat(locales: Intl.LocalesArgument, options: Intl.DateTimeFormatOptions) {
      assert.equal(locales, undefined);
      assert.deepEqual(options, { dateStyle: "medium", timeStyle: "short" });
      return {
        format(date: Date) {
          assert.equal(date.toISOString(), "2026-06-20T14:05:30.000Z");
          return "Jun 20, 2026, 7:05 AM";
        }
      };
    }
  });

  try {
    assert.equal(formatLocalDateTime("2026-06-20T14:05:30.000Z"), "Jun 20, 2026, 7:05 AM");
  } finally {
    Object.defineProperty(Intl, "DateTimeFormat", { configurable: true, value: original });
  }
});
