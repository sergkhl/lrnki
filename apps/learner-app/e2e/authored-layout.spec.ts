import { loadQualifiedCatalogOrThrow, projectQualifiedCatalog, type LearnerExpeditionProjection } from "@lrnki/learner-runtime/content-node";
import { test, expect, ok, signedIn, expeditionRead } from "./fixtures";

test("authored theory, long questions and matching keep navigation reachable with normal and enlarged text", async ({ page, mock, pageErrors }, testInfo) => {
  const small = testInfo.project.name === "phone";
  await page.setViewportSize(small ? { width: 320, height: 568 } : { width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const projections = projectQualifiedCatalog(await loadQualifiedCatalogOrThrow("../../content"));
  const first = projections[0]!;
  type Stop = LearnerExpeditionProjection["legs"][number]["stops"][number];
  let target = { expedition: first, stop: first.legs[0]!.stops[0]!, questionKey: null as string | null };
  mock.handlers = {
    ...signedIn(),
    "GET /expedition/*": () => ok({ ...expeditionRead, view: { ...expeditionRead.view,
      expedition: target.expedition, guardians: [], supportPaths: [],
      progress: target.expedition.legs.flatMap(leg => leg.stops.map(stop => ({
        ...expeditionRead.view.progress[0], stopKey: stop.key,
        state: stop.key === target.stop.key ? "available" : "mastered",
        lessonReadAt: target.questionKey ? "2026-09-08T12:00:00Z" : null,
        restorationStopKeys: [],
        latestActivityOutcomes: target.questionKey ? stop.activities.filter(activity => activity.key !== target.questionKey)
          .map(activity => ({ activityKey: activity.key, correct: true, answeredAt: "2026-09-08T12:00:00Z" })) : []
      })))
    } })
  };
  const footer = page.getByTestId("learning-footer");
  const fits = async () => {
    await expect(footer).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  };
  for (const enlarged of [false, true]) {
    target = { expedition: first, stop: first.legs[0]!.stops[0]!, questionKey: null };
    await page.goto(`/expedition/${first.key}`);
    if (enlarged) await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await expect(page.locator('[data-testid^="theory-"]')).toHaveCount(1);
    const sources = page.getByRole("button", { name: /^Show sources for/ });
    await expect(sources).toHaveCount(1);
    await fits();
    const body = page.getByTestId("learning-body");
    await body.evaluate(element => { element.scrollTop = element.scrollHeight; });
    const position = await body.evaluate(element => element.scrollTop);
    if (small) expect(position).toBeGreaterThan(0);
    await sources.click();
    await expect(page.getByRole("dialog", { name: "Sources", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close sources" }).click();
    await expect(sources).toBeFocused();
    expect(await body.evaluate(element => element.scrollTop)).toBe(position);
    await page.screenshot({ path: testInfo.outputPath(enlarged ? "authored-theory-enlarged.png" : "authored-theory.png") });

    for (const matching of [false, true]) {
      const candidates = projections.flatMap(expedition => expedition.legs.flatMap(leg => leg.stops.flatMap(stop =>
        stop.activities.filter(activity => (activity.family === "matching") === matching)
          .map(activity => ({ expedition, stop, activity })))));
      const longest = candidates.sort((a, b) => b.activity.prompt.length - a.activity.prompt.length)[0]!;
      target = { expedition: longest.expedition, stop: longest.stop as Stop, questionKey: longest.activity.key };
      await page.goto(`/expedition/${target.expedition.key}`);
      if (enlarged) await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      await expect(page.getByTestId(`activity-${longest.activity.key}`)).toBeVisible();
      await expect(page.locator('[data-testid^="theory-"]')).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^Show sources for/ })).toHaveCount(0);
      await fits();
      if (longest.activity.family === "matching") {
        await page.getByLabel(longest.activity.left[0]!.text, { exact: true }).click();
        await page.getByLabel(longest.activity.right[0]!.text, { exact: true }).click();
        await expect(page.getByLabel("Pair 1", { exact: true })).toHaveCount(2);
        await page.getByRole("button", { name: "Reset", exact: true }).click();
        await expect(page.getByLabel("Pair 1", { exact: true })).toHaveCount(0);
      }
      await page.getByTestId("learning-body").evaluate(element => { element.scrollTop = 0; });
      await page.screenshot({ path: testInfo.outputPath(`${matching ? "matching" : "long-question"}${enlarged ? "-enlarged" : ""}.png`) });
    }
  }
  expect(mock.requests.filter(request => request.method === "POST")).toHaveLength(0);
  expect(mock.unmatched).toEqual([]);
  expect(pageErrors).toEqual([]);
});
