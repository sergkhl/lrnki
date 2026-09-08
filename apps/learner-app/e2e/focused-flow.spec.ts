import type { LearnerCommandDto, LearnerReadDto } from "@lrnki/learner-api/client";
import { test, expect, ok, status, signedIn, expeditionRead, guardianRead, appliedTransition, type MockState } from "./fixtures";

type View = Extract<Extract<LearnerReadDto, { status: "ok" }>["view"], { kind: "expedition" }>;
type Guardian = Extract<Extract<LearnerReadDto, { status: "ok" }>["view"], { kind: "guardian" }>;

function journey(mock: MockState) {
  let view: View = structuredClone(expeditionRead.view);
  let version = 7;
  let hideFailure = false;
  let releaseHide: (() => void) | undefined;
  let hideWait: Promise<void> | undefined;
  let answerWait: Promise<void> | undefined;
  let releaseAnswer: (() => void) | undefined;
  let answerFailure = false;
  view = { ...view,
    expedition: { ...view.expedition, legs: view.expedition.legs.map((leg, legIndex) => legIndex ? leg : {
      ...leg, stops: leg.stops.map((stop, index) => index ? stop : { ...stop,
        lesson: { sections: [...stop.lesson.sections, { ...stop.lesson.sections[0], key: "second-section", title: "Follow the reasons", body: "Find the statement the reasons support." }] }
      })
    }) },
    progress: view.progress.map((progress, index) => ({ ...progress, state: index ? "locked" : "available", lessonReadAt: null, latestActivityOutcomes: [] }))
  };
  mock.handlers = {
    ...signedIn(),
    "GET /expedition/*": () => ok({ status: "ok", stateVersion: String(version), view }),
    "POST /game/commands": async ({ postData }) => {
      const command = (postData as { command: LearnerCommandDto }).command;
      if (command.kind === "answer_option_select" && command.source.kind === "support") {
        if (answerWait) await answerWait;
        if (answerFailure) return status(503);
      }
      if (command.kind === "hide_support_path") {
        if (hideWait) await hideWait;
        if (hideFailure) return status(503);
      }
      version++;
      if (command.kind === "record_lesson_read") {
        view = { ...view, progress: view.progress.map(progress => progress.stopKey === command.stopKey ? { ...progress, lessonReadAt: "2026-09-08T12:00:00Z" } : progress) };
        return ok({ ...appliedTransition({ kind: "lesson_recorded" }, view), stateVersion: String(version) });
      }
      if (command.kind === "open_support_path" || command.kind === "hide_support_path") {
        view = { ...view, supportPaths: view.supportPaths.map(path => path.supportPathKey === command.supportPathKey ? { ...path, status: command.kind === "open_support_path" ? "open" : "hidden" } : path) };
        return ok({ ...appliedTransition({ kind: command.kind === "open_support_path" ? "support_opened" : "support_hidden" }, view), stateVersion: String(version) });
      }
      if (command.kind === "answer_option_select" || command.kind === "answer_matching") {
        const correct = command.kind === "answer_option_select" ? command.chosenOptionKey === "take-southern-road"
          : command.matches.every(pair => pair.rightKey === pair.leftKey.replace("left-", "right-"));
        view = { ...view, progress: view.progress.map(progress => progress.stopKey !== command.stopKey ? progress : {
          ...progress, latestActivityOutcomes: [...progress.latestActivityOutcomes.filter(outcome => outcome.activityKey !== command.activityKey),
            { activityKey: command.activityKey, correct, answeredAt: "2026-09-08T12:00:00Z" }]
        }) };
        const first = view.progress[0];
        const complete = view.expedition.legs[0].stops[0].activities.every(activity => first.latestActivityOutcomes.some(outcome => outcome.activityKey === activity.key && outcome.correct));
        view = { ...view, progress: view.progress.map((progress, index) => index === 0 ? { ...progress, state: complete ? "mastered" : "available" }
          : index === 1 ? { ...progress, state: complete ? "available" : "locked" } : progress) };
        return ok({ ...appliedTransition({ kind: "activity_answered", activityKey: command.activityKey, correct,
          feedback: "The reasons support the conclusion.", feedbackSourceCreditKeys: ["reasoning-guide"],
          revealKey: "take-southern-road", newlyCompletedStop: complete, pointsAwarded: complete ? 1 : 0 }, view), stateVersion: String(version) });
      }
      return status(500);
    }
  };
  return {
    failHide: () => { hideFailure = true; },
    holdHide: () => { hideWait = new Promise(resolve => { releaseHide = resolve; }); },
    releaseHide: () => { releaseHide?.(); },
    holdAnswer: () => { answerWait = new Promise(resolve => { releaseAnswer = resolve; }); },
    failAnswer: () => { answerFailure = true; },
    releaseAnswer: () => { releaseAnswer?.(); },
    unlockSupport: () => {
      view = { ...view, progress: view.progress.map((progress, index) => index === 0 ? { ...progress, state: "mastered", lessonReadAt: "2026-09-08T12:00:00Z" }
        : index === 1 ? { ...progress, state: "available" } : progress) };
    }
  };
}

test.afterEach(async ({ pageErrors }) => {
  expect(pageErrors).toEqual([]);
});

test("theory and questions advance individually, with compact sources, held feedback and explicit retry", async ({ page, mock }) => {
  journey(mock);
  await page.goto("/expedition/critical-thinking");
  const footer = page.getByTestId("learning-footer");
  await expect(page.getByText("Theory 1 of 2", { exact: true })).toBeVisible();
  await expect(page.getByTestId("theory-claims-and-support")).toBeVisible();
  await expect(page.getByTestId("theory-second-section")).toHaveCount(0);
  const source = page.getByTestId("sources-button");
  await expect(source).toHaveCount(1);
  await source.click();
  await expect(page.getByText("Critical Thinking source guide", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close sources" }).click();
  await expect(source).toBeFocused();
  await footer.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByTestId("theory-second-section")).toBeVisible();
  expect(mock.requests.filter(request => request.method === "POST")).toHaveLength(0);
  await page.reload();
  await expect(page.getByText("Theory 2 of 2", { exact: true })).toBeVisible();
  await footer.getByRole("button", { name: "Start questions" }).click();
  expect(mock.requests.filter(request => request.method === "POST")).toHaveLength(1);
  await expect(page.getByTestId("activity-identify-conclusion")).toBeVisible();
  await expect(page.locator('[data-testid^="theory-"]')).toHaveCount(0);
  await expect(page.getByTestId("sources-button")).toHaveCount(0);
  await page.getByLabel("The northern road is closed.", { exact: true }).click();
  await expect(page.getByText("Not quite.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("We should take the southern road.", { exact: true })).toBeDisabled();
  await expect(page.getByTestId("sources-button")).toHaveCount(1);
  await footer.getByRole("button", { name: "Review theory" }).click();
  await expect(page.getByText("Theory 1 of 2", { exact: true })).toBeVisible();
  await footer.getByRole("button", { name: "Continue", exact: true }).click();
  await footer.getByRole("button", { name: "Back to question" }).click();
  await footer.getByRole("button", { name: "Try again" }).click();
  await page.getByLabel("We should take the southern road.", { exact: true }).click();
  await expect(page.getByText("Correct.", { exact: true })).toBeVisible();
  await expect(page.getByTestId("activity-map-argument-parts")).toHaveCount(0);
  await footer.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByTestId("activity-map-argument-parts")).toBeVisible();
  await footer.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByText("Correct.", { exact: true })).toBeVisible();
  const commandsBeforeBack = mock.requests.filter(request => request.method === "POST").length;
  await footer.getByRole("button", { name: "Continue", exact: true }).click();
  expect(mock.requests.filter(request => request.method === "POST")).toHaveLength(commandsBeforeBack);
  await page.getByLabel("Claim", { exact: true }).click();
  await page.getByLabel("A statement that can be accepted or rejected", { exact: true }).click();
  await expect(page.getByLabel("Pair 1", { exact: true })).toHaveCount(2);
  await page.getByLabel("Conclusion", { exact: true }).click();
  await page.getByLabel("The claim the reasons support", { exact: true }).click();
  await page.getByRole("button", { name: "Submit matches" }).click();
  await expect(page.getByText("Correct.", { exact: true })).toBeVisible();
  await expect(page.getByTestId("learning-completion")).toHaveCount(0);
  await footer.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByTestId("learning-completion")).toBeVisible();
  await footer.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByTestId("theory-representative-evidence")).toBeVisible();
});

test("a reload resumes the next unfinished question without recording another answer", async ({ page, mock }) => {
  journey(mock);
  await page.goto("/expedition/critical-thinking");
  await page.getByTestId("learning-footer").getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Start questions" }).click();
  await page.getByLabel("We should take the southern road.", { exact: true }).click();
  await expect(page.getByText("Correct.", { exact: true })).toBeVisible();
  const submitted = mock.requests.filter(request => request.method === "POST").length;
  await page.reload();
  await expect(page.getByTestId("activity-map-argument-parts")).toBeVisible();
  expect(mock.requests.filter(request => request.method === "POST")).toHaveLength(submitted);
});

test("Support preserves the parent card and keeps failed or pending hide actions in context", async ({ page, mock }) => {
  const fixture = journey(mock);
  fixture.unlockSupport();
  await page.goto("/expedition/critical-thinking");
  await expect(page.getByTestId("theory-representative-evidence")).toBeVisible();
  await page.getByTestId("learning-help").click();
  const support = page.getByTestId("fullscreen-content");
  await expect(support.getByText("Support Path", { exact: true })).toBeVisible();
  await expect(support.getByTestId("theory-claims-and-support")).toBeVisible();
  await expect(support.getByTestId("activity-identify-conclusion")).toHaveCount(0);
  await support.getByRole("button", { name: "Start questions" }).click();
  await expect(support.getByTestId("activity-identify-conclusion")).toBeVisible();
  await page.reload();
  await expect(support.getByTestId("activity-identify-conclusion")).toBeVisible();
  await page.getByRole("button", { name: "Back to lesson", exact: true }).click();
  await expect(support).toHaveCount(0);
  await expect(page.getByTestId("theory-representative-evidence")).toBeVisible();
  await page.getByTestId("learning-help").click();
  await expect(support.getByTestId("activity-identify-conclusion")).toBeVisible();
  fixture.holdHide();
  fixture.failHide();
  await support.getByRole("button", { name: "Hide path" }).click();
  await expect(support.getByRole("button", { name: "Back to lesson", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(support).toBeVisible();
  fixture.releaseHide();
  await expect(support.getByText(/Your progress could not be saved/)).toBeVisible();
  await expect(support.getByRole("button", { name: "Back to lesson", exact: true })).toBeEnabled();
});

test("a completed Support answer resumes after feedback on reload without another submission", async ({ page, mock }) => {
  const fixture = journey(mock);
  fixture.unlockSupport();
  await page.goto("/expedition/critical-thinking");
  await page.getByTestId("learning-help").click();
  const support = page.getByTestId("fullscreen-content");
  await support.getByRole("button", { name: "Start questions" }).click();
  await support.getByLabel("We should take the southern road.", { exact: true }).click();
  await expect(support.getByTestId("answer-feedback")).toContainText("Correct.");
  const answers = () => mock.requests.filter(call => call.method === "POST" && call.pathname === "/game/commands" &&
    (call.postData as { command: LearnerCommandDto }).command.kind === "answer_option_select");
  expect(answers()).toHaveLength(1);
  await page.reload();
  await expect(support.getByTestId("learning-completion")).toBeVisible();
  await expect(support.getByTestId("activity-identify-conclusion")).toHaveCount(0);
  expect(answers()).toHaveLength(1);
});

test("a pending Support answer blocks dismissal, then a failed answer stays retryable", async ({ page, mock }) => {
  const fixture = journey(mock);
  fixture.unlockSupport();
  await page.goto("/expedition/critical-thinking");
  await page.getByTestId("learning-help").click();
  const support = page.getByTestId("fullscreen-content");
  await support.getByRole("button", { name: "Start questions" }).click();
  fixture.holdAnswer();
  fixture.failAnswer();
  await support.getByLabel("We should take the southern road.", { exact: true }).click();
  const close = support.getByRole("button", { name: "Back to lesson", exact: true });
  await expect(close).toBeDisabled();
  await expect(support.getByRole("button", { name: "Hide path" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(support).toBeVisible();
  fixture.releaseAnswer();
  await expect(support.getByTestId("activity-identify-conclusion").getByText(/Your progress could not be saved/)).toBeVisible();
  await expect(support.getByLabel("We should take the southern road.", { exact: true })).toBeEnabled();
  await close.click();
  await expect(support).toHaveCount(0);
  await expect(page.getByTestId("theory-representative-evidence")).toBeVisible();
});

test("Guardian explanations remain on their submitted question, including the final answer", async ({ page, mock }) => {
  let view: Guardian = structuredClone(guardianRead.view);
  let answers = 0;
  mock.handlers = {
    "GET /guardian/*": () => ok({ ...guardianRead, view }),
    "POST /game/commands": () => {
      answers++;
      view = answers === 1 ? { ...guardianRead.view, currentActivity: expeditionRead.view.expedition.legs[0].stops[0].activities[0], resolvedWardCount: 1, unresolvedWardCount: 2 }
        : { kind: "guardian", state: "won", expeditionKey: "critical-thinking", challengeId: "guardian-e2e", scope: guardianRead.view.scope, wardTotal: 3, firstWin: true };
      return ok(appliedTransition({ kind: "guardian_answered", correct: true, feedback: "Feedback belongs to the submitted question.", feedbackSourceCreditKeys: ["reasoning-guide"] }, view));
    }
  };
  await page.goto("/guardian/critical-thinking/guardian-e2e");
  await page.getByLabel("A large sample always removes selection bias.").click();
  await expect(page.getByText("Feedback belongs to the submitted question.")).toBeVisible();
  await expect(page.getByTestId("guardian-activity-spot-evidence-impostor")).toBeVisible();
  await expect(page.getByTestId("guardian-activity-identify-conclusion")).toHaveCount(0);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByTestId("guardian-activity-identify-conclusion")).toBeVisible();
  await page.getByLabel("The northern road is closed.", { exact: true }).click();
  await expect(page.getByText("Feedback belongs to the submitted question.")).toBeVisible();
  await expect(page.getByText("Guardian won", { exact: true })).toHaveCount(0);
  await page.getByTestId("sources-button").click();
  await expect(page.getByText("Critical Thinking source guide", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close sources" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText("Guardian won", { exact: true })).toBeVisible();
  expect(answers).toBe(2);
});

test("a Guardian matching pair holds feedback before the remaining pairs become interactive", async ({ page, mock }) => {
  const matching = expeditionRead.view.expedition.legs[0].stops[0].activities[1];
  let view: Guardian = { ...guardianRead.view, currentActivity: matching, matchingProgress: { matchedLeftKeys: [], roundIndex: 0 } };
  mock.handlers = {
    "GET /guardian/*": () => ok({ ...guardianRead, view }),
    "POST /game/commands": () => {
      view = { ...guardianRead.view, currentActivity: matching, matchingProgress: { matchedLeftKeys: ["left-claim"], roundIndex: 0 } };
      return ok(appliedTransition({ kind: "guardian_answered", correct: true, revealKey: "right-claim", feedback: "This pair is correct." }, view));
    }
  };
  await page.goto("/guardian/critical-thinking/guardian-e2e");
  await page.getByLabel("Claim", { exact: true }).click();
  await page.getByLabel("A statement that can be accepted or rejected", { exact: true }).click();
  await expect(page.getByText("Pair matched.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Conclusion", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByLabel("Conclusion", { exact: true })).toBeEnabled();
  await expect(page.getByLabel("Claim", { exact: true })).toBeDisabled();
});

for (const kind of ["retreat", "abandon"] as const) {
  test(`failed Guardian ${kind} stays on the challenge with a retryable action`, async ({ page, mock }) => {
    mock.handlers = {
      "GET /guardian/*": () => ok({ ...guardianRead, view: { ...guardianRead.view, retreated: kind === "abandon" } }),
      "POST /game/commands": () => status(503)
    };
    await page.goto("/guardian/critical-thinking/guardian-e2e");
    const control = page.getByRole("button", { name: kind === "retreat" ? "Retreat to trail" : "Abandon", exact: true });
    await expect(control).toBeVisible();
    await control.click();
    await expect(page.getByText(/Your progress could not be saved/)).toBeVisible();
    await expect(page).toHaveURL(/\/guardian\/critical-thinking\/guardian-e2e$/);
    await expect(control).toBeEnabled();
  });
}
