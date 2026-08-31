# Lrnki Context

Lrnki presents directly authored learning Expeditions through a server-owned game runtime. This file
is the project glossary; behavior belongs in ADRs and exact shapes belong in source.

## Authored learning content

**Authored Catalog**:
The tracked ordered membership of learner-visible Expeditions. _Avoid_: installed catalog, database
catalog, generated package.

**Authored Expedition**:
One complete declarative learning journey written offline from its project-owned primer and consumed
directly by the server. _Avoid_: generated course, content package, graph projection.

**Leg**:
An authored milestone containing an ordered group of three to five Stops and one Guardian scope.
_Avoid_: generated section, database chapter.

**Stop**:
One authored learning objective with a Lesson, Activities, prerequisite references, difficulty, and
optional Support Paths. _Avoid_: Concept, node, checkpoint identity.

**Lesson**:
The ungraded teaching material for one Stop, divided into source-anchored sections. _Avoid_: prompt,
quiz explanation, generated grounding.

**Activity**:
A server-graded option-select, matching, or impostor exercise with a private answer and a
source-anchored explanation. _Avoid_: Study Item, card bank, self-report.

**Explorable Term**:
An exact rendered lesson substring that opens one explicitly authored Support Path. _Avoid_: keyword,
search result, generated prerequisite.

**Support Path**:
An authored optional branch that reuses ordinary Activities from other Stops to repair a named local
confusion. _Avoid_: generated detour, retry state, second Expedition.

**Guardian**:
A server-owned Leg or Expedition challenge assembled from an explicit authored activity pool, with
durable combat, recovery, rematch, and reward state. _Avoid_: mastery-affecting quiz, client battle.

**Content Revision**:
The canonical identity of one qualified Expedition's semantic document and referenced primer bytes.
_Avoid_: file hash, formatting hash, database version.

## Learner experience

**Learner State**:
The authenticated learner's versioned durable journey aggregate, separate from authored content and
private grading material. _Avoid_: content state, client cache, session cookie.

**Expedition Journal**:
The learner's entry view over catalog order, adoption, active journey, progress, rewards, and current
leaderboard. _Avoid_: database projection, generation timeline.

**Calibration Known**:
An explicit learner assertion that a Stop is known, satisfying prerequisite closure without creating
a graded attempt, crystal, or weekly point. _Avoid_: correct answer, mastery score.
