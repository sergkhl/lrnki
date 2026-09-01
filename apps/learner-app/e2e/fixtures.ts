import { test as base, expect, type Page, type Route } from "@playwright/test";
import type {
  LearnerReadDto,
  LearnerTransitionDto
} from "@lrnki/learner-api/client";

export const API_ORIGIN = process.env.E2E_API_ORIGIN ?? "http://127.0.0.1:8788";

export type Reply = { status: number; body: unknown };
export const ok = (body: unknown): Reply => ({ status: 200, body });
export const status = (code: number, body: unknown = { error: "error" }): Reply => ({ status: code, body });
export type Handler = (ctx: { method: string; pathname: string; postData: unknown }) => Reply | Promise<Reply>;
export type MockState = {
  handlers: Partial<Record<string, Handler>>;
  unmatched: string[];
  requests: Array<{ method: string; pathname: string; postData: unknown }>;
};

export const sessionUser = {
  id: "gate-explorer",
  name: "Gate Explorer",
  email: "gate-explorer@e2e.invalid",
  emailVerified: false,
  image: null,
  profileComplete: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

export const sessionPayload = {
  session: {
    id: "e2e-session",
    userId: sessionUser.id,
    token: "e2e-session-token",
    expiresAt: "2099-01-01T00:00:00.000Z",
    createdAt: sessionUser.createdAt,
    updatedAt: sessionUser.updatedAt
  },
  user: sessionUser
};

export const credentialSuccess = { token: sessionPayload.session.token, user: sessionUser };
export const invalidCredentials = { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" };
export const signedIn = (): MockState["handlers"] => ({ "GET /auth/get-session": () => ok(sessionPayload) });
export const signedOut = (): MockState["handlers"] => ({ "GET /auth/get-session": () => ok(null) });

const sourceCredits = [{
  key: "reasoning-guide",
  title: "Critical Thinking source guide",
  url: "https://example.org/reasoning-guide",
  publisher: "Example Institute",
  accessedAt: "2026-09-01",
  note: "Production-shape intercepted-web fixture."
}];

const optionActivity = {
  family: "option_select" as const,
  key: "identify-conclusion",
  prompt: "Which claim is the conclusion?",
  options: [
    { key: "northern-road-closed", text: "The northern road is closed." },
    { key: "take-southern-road", text: "We should take the southern road." }
  ]
};

const matchingActivity = {
  family: "matching" as const,
  key: "map-argument-parts",
  prompt: "Match each reasoning role to what it does.",
  left: [
    { key: "left-claim", text: "Claim" },
    { key: "left-conclusion", text: "Conclusion" }
  ],
  right: [
    { key: "right-conclusion", text: "The claim the reasons support" },
    { key: "right-claim", text: "A statement that can be accepted or rejected" }
  ]
};

const impostorActivity = {
  family: "impostor" as const,
  key: "spot-evidence-impostor",
  prompt: "One statement overclaims. Find the impostor.",
  statements: [
    { key: "random-selection-reduces-bias", text: "Random selection can reduce selection bias." },
    { key: "anecdote-shows-possibility", text: "An anecdote can show that something can happen." },
    { key: "size-cures-bias", text: "A large sample always removes selection bias." }
  ]
};

export const journalRead = {
  status: "ok",
  stateVersion: "7",
  view: {
    kind: "journal",
    activeExpeditionKey: "critical-thinking",
    expeditions: [{
      expeditionKey: "critical-thinking",
      title: "Critical Thinking",
      contentRevision: "revision-critical-thinking",
      contentChanged: false,
      adoptedAt: "2026-08-31T00:00:00.000Z",
      masteredStopCount: 1,
      knownStopCount: 0,
      totalStopCount: 3
    }]
  }
} satisfies LearnerReadDto;

export const emptyJournalRead = {
  status: "ok",
  stateVersion: "0",
  view: { kind: "journal", activeExpeditionKey: null, expeditions: [] }
} satisfies LearnerReadDto;

export const catalogRead = {
  status: "ok",
  stateVersion: "7",
  view: {
    kind: "catalog",
    catalogRevision: "catalog-revision",
    expeditions: [{
      expeditionKey: "critical-thinking",
      title: "Critical Thinking",
      teaser: "Make reasoning visible, test it against evidence, and revise confidence.",
      declaredDomain: "Reasoning and decision-making",
      audience: "Adult learners building practical reasoning habits",
      sourceCredits,
      contentRevision: "revision-critical-thinking",
      adopted: true,
      active: true
    }]
  }
} satisfies LearnerReadDto;

export const expeditionView = {
  kind: "expedition" as const,
  expedition: {
    key: "critical-thinking",
    contentRevision: "revision-critical-thinking",
    title: "Critical Thinking",
    teaser: "Make reasoning visible, test it against evidence, and revise confidence.",
    declaredDomain: "Reasoning and decision-making",
    audience: "Adult learners building practical reasoning habits",
    sourceCredits,
    legs: [{
      key: "reasoning-foundations",
      title: "From claims to warranted conclusions",
      stops: [
        {
          key: "argument-structure",
          label: "See the support structure",
          requires: [],
          difficultyBand: 1 as const,
          lesson: { sections: [{
            key: "claims-and-support",
            title: "Separate claims from support",
            body: "A support relationship links reasons to the conclusion they are intended to establish.",
            sourceCreditKeys: ["reasoning-guide"],
            explorableTerms: []
          }] },
          activities: [optionActivity, matchingActivity],
          supportPaths: []
        },
        {
          key: "evidence-quality",
          label: "Judge how much the evidence earns",
          requires: ["argument-structure"],
          difficultyBand: 2 as const,
          lesson: { sections: [{
            key: "representative-evidence",
            title: "A large sample can answer the wrong question",
            body: "Recover the support relationship, then inspect how the sample was selected.",
            sourceCreditKeys: ["reasoning-guide"],
            explorableTerms: [{ term: "support relationship", supportPathKey: "review-support-relationship" }]
          }] },
          activities: [
            { ...optionActivity, key: "evaluate-sample", prompt: "Which sample best matches the named population?" },
            impostorActivity
          ],
          supportPaths: [{ key: "review-support-relationship", term: "support relationship" }]
        },
        {
          key: "causal-claims",
          label: "Test the causal story",
          requires: ["evidence-quality"],
          difficultyBand: 3 as const,
          lesson: { sections: [{
            key: "association-vs-cause",
            title: "Association leaves several stories open",
            body: "A common cause can move both observed variables without the proposed causal link.",
            sourceCreditKeys: ["reasoning-guide"],
            explorableTerms: []
          }] },
          activities: [{ ...optionActivity, key: "diagnose-fire-correlation", prompt: "Which common cause should be tested?" }],
          supportPaths: []
        }
      ]
    }]
  },
  active: true,
  progress: [
    {
      stopKey: "argument-structure",
      state: "mastered" as const,
      lessonReadAt: "2026-08-31T00:01:00.000Z",
      latestActivityOutcomes: [
        { activityKey: "identify-conclusion", correct: true, answeredAt: "2026-08-31T00:02:00.000Z" },
        { activityKey: "map-argument-parts", correct: true, answeredAt: "2026-08-31T00:03:00.000Z" }
      ],
      firstGradedCompletion: {
        stopKey: "argument-structure",
        completedAt: "2026-08-31T00:03:00.000Z",
        difficultyBand: 1,
        points: 1
      },
      restorationStopKeys: []
    },
    {
      stopKey: "evidence-quality",
      state: "available" as const,
      lessonReadAt: "2026-08-31T00:04:00.000Z",
      latestActivityOutcomes: [],
      firstGradedCompletion: null,
      restorationStopKeys: []
    },
    {
      stopKey: "causal-claims",
      state: "locked" as const,
      lessonReadAt: null,
      latestActivityOutcomes: [],
      firstGradedCompletion: null,
      restorationStopKeys: []
    }
  ],
  supportPaths: [{
    supportPathKey: "review-support-relationship",
    parentStopKey: "evidence-quality",
    term: "support relationship",
    status: "closed" as const,
    steps: [{
      stopKey: "argument-structure",
      activityKey: "identify-conclusion",
      stopLabel: "See the support structure",
      lesson: { sections: [{
        key: "claims-and-support",
        title: "Separate claims from support",
        body: "A support relationship links reasons to a conclusion.",
        sourceCreditKeys: ["reasoning-guide"],
        explorableTerms: []
      }] },
      activity: optionActivity
    }]
  }],
  guardians: [
    {
      scope: { kind: "leg" as const, legKey: "reasoning-foundations" },
      state: "locked" as const,
      eligibleActivityCount: 2,
      activeChallengeId: null,
      firstWinChallengeId: null
    },
    {
      scope: { kind: "expedition" as const },
      state: "locked" as const,
      eligibleActivityCount: 3,
      activeChallengeId: null,
      firstWinChallengeId: null
    }
  ]
};

export const expeditionRead = {
  status: "ok",
  stateVersion: "7",
  view: expeditionView
} satisfies LearnerReadDto;

export const guardianActiveView = {
  kind: "guardian" as const,
  state: "active" as const,
  expeditionKey: "critical-thinking",
  challengeId: "guardian-e2e",
  scope: { kind: "leg" as const, legKey: "reasoning-foundations" },
  wardTotal: 3,
  unresolvedWardCount: 3,
  resolvedWardCount: 0,
  remainingShield: 3,
  shieldTotal: 3,
  retreated: false,
  sourceCredits,
  currentActivity: impostorActivity,
  matchingProgress: null
};

export const guardianRead = {
  status: "ok",
  stateVersion: "9",
  view: guardianActiveView
} satisfies LearnerReadDto;

export const leaderboardRead = {
  status: "ok",
  stateVersion: "7",
  view: {
    kind: "leaderboard",
    weekKey: "2026-W36",
    entries: [
      { id: "rival-a", name: "Mina", points: 8, rank: 1, isViewer: false, isRival: true, badges: { podiums: 1 } },
      { id: "gate-explorer", name: "Gate Explorer", points: 3, rank: 2, isViewer: true, isRival: false, badges: { podiums: 0 } }
    ],
    chase: { name: "Mina", gap: 5, direction: "ahead" },
    viewerPoints: 3,
    viewerRank: 2,
    masteredCrystalCount: 1,
    division: { name: "Quartz", threshold: 0, nextThreshold: 25 },
    podiumEarnedForPreviousWeek: false
  }
} satisfies LearnerReadDto;

type AppliedTransition = Extract<LearnerTransitionDto, { status: "applied" }>;
type AppliedEffect = AppliedTransition["effect"];

const baseEffect: AppliedEffect = {
  kind: "expedition_activated",
  expeditionKey: "critical-thinking",
  legKey: null,
  stopKey: null,
  activityKey: null,
  supportPathKey: null,
  challengeId: null,
  correct: null,
  revealKey: null,
  feedback: null,
  feedbackSourceCreditKeys: [],
  newlyCompletedStop: false,
  pointsAwarded: 0,
  firstGuardianWin: false
};

export function appliedTransition(
  effect: Partial<AppliedEffect> = {},
  view: AppliedTransition["view"] = expeditionView
): LearnerTransitionDto {
  return {
    status: "applied",
    replayed: false,
    stateVersion: "8",
    committedStateVersion: "8",
    effect: { ...baseEffect, ...effect },
    view
  };
}

export const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const corsHeaders = (origin: string | undefined): Record<string, string> => ({
  "access-control-allow-origin": origin ?? API_ORIGIN,
  "access-control-allow-credentials": "true",
  "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type",
  vary: "origin"
});

async function installMock(page: Page, state: MockState): Promise<void> {
  await page.route(
    (url) => url.href.startsWith(API_ORIGIN),
    async (route: Route) => {
      const request = route.request();
      const method = request.method();
      const headers = corsHeaders(request.headers()["origin"]);
      if (method === "OPTIONS") {
        await route.fulfill({ status: 204, headers, body: "" });
        return;
      }
      const pathname = new URL(request.url()).pathname;
      const key = matchKey(method, pathname, state.handlers);
      let postData: unknown;
      try {
        postData = request.postDataJSON();
      } catch {
        postData = undefined;
      }
      state.requests.push({ method, pathname, postData });
      if (!key) {
        state.unmatched.push(`${method} ${pathname}`);
        await route.fulfill({ status: 500, headers, contentType: "application/json", body: JSON.stringify({ error: "unmocked" }) });
        return;
      }
      const reply = await state.handlers[key]!({ method, pathname, postData });
      await route.fulfill({
        status: reply.status,
        contentType: "application/json",
        headers,
        body: JSON.stringify(reply.body)
      });
    }
  );
}

function matchKey(method: string, pathname: string, handlers: MockState["handlers"]): string | undefined {
  const exact = `${method} ${pathname}`;
  if (handlers[exact]) return exact;
  for (const key of Object.keys(handlers)) {
    const [candidateMethod, pattern] = key.split(" ");
    if (candidateMethod !== method || !pattern?.endsWith("/*")) continue;
    if (pathname.startsWith(pattern.slice(0, -1))) return key;
  }
  return undefined;
}

export async function readableStorageKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index) ?? ""));
}

type Fixtures = { mock: MockState; pageErrors: string[] };

export const test = base.extend<Fixtures>({
  pageErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console.error: ${message.text()}`);
    });
    await use(errors);
  },
  mock: async ({ page }, use) => {
    const state: MockState = { handlers: {}, unmatched: [], requests: [] };
    await installMock(page, state);
    await use(state);
    expect(state.unmatched, `unmocked API calls: ${state.unmatched.join(", ")}`).toEqual([]);
  }
});

export { expect };
