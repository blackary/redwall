import { expect, test } from "@playwright/test";
import { startSkirmish } from "./helpers";

test("pause menu blocks the skirmish and resumes cleanly", async ({ page }) => {
  await page.goto("/?e2e=1&seed=pause-flow");
  await startSkirmish(page);

  await page.getByTestId("pause-button").click();
  await expect(page.getByTestId("pause-menu")).toBeVisible();
  await expect(page.getByTestId("overlay-title")).toHaveText("Skirmish Paused");

  await page.getByTestId("overlay-resume").click();
  await expect(page.getByTestId("hud-overlay")).toBeHidden();
});

test("victory screen clears resumable state and returns to menu", async ({ page }) => {
  await page.goto("/?e2e=1&seed=victory-flow");
  await startSkirmish(page);

  await page.evaluate(() => window.__REDWALL_DEBUG__?.forceOutcome("playerVictory"));
  await expect(page.getByTestId("outcome-screen")).toBeVisible();
  await expect(page.getByTestId("overlay-title")).toHaveText("Victory in Mossflower");

  await page.getByTestId("overlay-return-menu").click();
  await expect(page.getByTestId("main-menu")).toBeVisible();
  await expect(page.getByTestId("continue-skirmish")).toBeDisabled();
  const hasResume = await page.evaluate(() => window.__REDWALL_DEBUG__?.hasResume());
  expect(hasResume).toBe(false);
});

test("defeat screen can immediately launch a fresh skirmish", async ({ page }) => {
  await page.goto("/?e2e=1&seed=defeat-flow");
  await startSkirmish(page);

  await page.evaluate(() => window.__REDWALL_DEBUG__?.forceOutcome("playerDefeat"));
  await expect(page.getByTestId("outcome-screen")).toBeVisible();
  await expect(page.getByTestId("overlay-title")).toHaveText("The Abbey Has Fallen");

  await page.getByTestId("overlay-new-skirmish").click();
  await expect(page.getByTestId("game-shell")).toBeVisible();
  await page.waitForFunction(() => window.__REDWALL_DEBUG__?.getSnapshot()?.outcome === "ongoing");
  const outcome = await page.evaluate(() => window.__REDWALL_DEBUG__?.getSnapshot()?.outcome);
  expect(outcome).toBe("ongoing");
});
