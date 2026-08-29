---
name: worklog
description: Explicit invocation only. Estimate hands-on engineering effort per day from commit authorship and emit a timesheet CSV. Use only when the current prompt names $worklog or this skill path; never infer it from a question about how long something took.
disable-model-invocation: true
---

# Hands-on effort estimate

Produce a per-day estimate of **one person's actual working time** for a date range, as a CSV.

Ask for whatever the prompt did not supply: the date range, the author identity to attribute by, the
reporting timezone, and where the file goes. Do not guess an identity from the git config — the person
asking may not be the only author.

**Hands-on hours are a timesheet number, not a measure of delivered scope.** Never report
scope-equivalent or conventional-equivalent hours anywhere in the output. When the user works with
coding agents, often several at once, hands-on time is well below wall-clock span; the estimate must
reflect that rather than the span.

## Authorization boundary

Proceed only when the current user prompt explicitly names `$worklog` or this skill path. "How long
did that take" and "how much have I done this week" are questions to answer in prose, not triggers
for this skill.

The output attributes a **named person's** commits and states hours someone may invoice against. Do
not infer whose commits to read, and do not run this over a shared repository's history on your own
initiative — ask for the identity, as the section below requires, and let the person asking decide
that the estimate should exist at all.

## Method

- Attribute by commit **author**, and exclude other contributors' commits.
- Use **author-date, not commit-date**. Rebased branches bunch every commit date at the rebase moment,
  which destroys the daily distribution.
- Include unmerged feature branches. Deduplicate rebased copies with `git patch-id`, never by commit
  subject — a rebase preserves the subject.
- Put the workday boundary at 04:00 so past-midnight work counts toward the previous day.
- Report days with no commits as `0`. Do not spread work into them.

## Estimating the number

Compute each day's first→last commit span **first**. Hands-on hours must not exceed that span, and
should normally land well under it.

**Do not use lines changed as the effort proxy.** Estimate from the number of distinct problems solved
and how hard each was.

- Weight **upward** for: production migrations, especially multi-stage or with a backfill; native
  platform work; cross-cutting refactors; and anything debugged rather than written.
- Weight **downward** for: generated or formulaic code, documentation, and mechanical call-site updates.
- Treat iteration as a difficulty signal: repeated commits touching the same files, fix and revert
  commits, and large deletions of code added earlier all indicate something was hard.

Exclude from all analysis: generated migration snapshots, lockfiles, and binary assets.

## Output

A CSV file with this exact header:

```
Date,InvoiceId,Day,Summary,Estimated Hands-on h
```

- One row per calendar day in the range, including zero days, in date order.
- `Date`: `YYYY-MM-DD`. `Day`: weekday name.
- `InvoiceId`: as the user defines it; if they use a period-ending date, derive it from the range
  rather than hardcoding one.
- `Summary`: what was actually worked on that day, as one quoted field. Commas allowed inside the
  quotes, no line breaks. Empty `""` for zero days.
- `Estimated Hands-on h`: a number to one decimal place, no unit suffix.
