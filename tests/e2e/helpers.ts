import { expect, type Page } from "@playwright/test";

export async function waitForSession(page: Page): Promise<void> {
  await expect(page.getByTestId("game-shell")).toBeVisible();
  await expect(page.getByTestId("hud")).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__REDWALL_DEBUG__?.getSnapshot()));
}

export async function startSkirmish(page: Page): Promise<void> {
  await page.getByTestId("start-skirmish").click();
  await waitForSession(page);
}

export async function startTutorial(page: Page): Promise<void> {
  await page.getByTestId("start-tutorial").click();
  await waitForSession(page);
}

export async function continueSkirmish(page: Page): Promise<void> {
  await page.getByTestId("continue-skirmish").click();
  await waitForSession(page);
}
