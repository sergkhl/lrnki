# Make each authored Lesson teach before Activities test

Status: Accepted

## Decision

Every Stop owns one Lesson that teaches the learner-visible objective before its Activities grade it.
Lesson sections carry exact source anchors and enough explanation, contrast, or example for the
Activities to be answerable without exposing their keys.

Reading is ungraded. A Lesson cannot itself create a response, reward, or mastery; acquisition
mastery combines its read evidence with the Stop's required current Activities, except for explicit
known calibration.

## Context

Quiz-first experiences can measure guessing without building a usable mental model. A single authored
teaching substrate keeps what is taught and what is tested locally inspectable.
