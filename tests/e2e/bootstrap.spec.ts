import { expect, test } from "@playwright/test";

test("bootstrap app loads and starts skirmish shell", async ({ page }) => {
  await page.goto("/?e2e=1&seed=bootstrap");

  await expect(page.getByTestId("main-menu")).toBeVisible();
  await expect(page.getByTestId("e2e-mode")).toHaveText("enabled");
  await expect(page.getByTestId("seed-value")).toHaveText("bootstrap");

  await page.getByTestId("start-skirmish").click();

  await expect(page.getByTestId("app-mode")).toHaveText("skirmish");
  await expect(page.getByTestId("game-shell")).toBeVisible();

  const mode = await page.evaluate(() => window.__REDWALL_DEBUG__?.getMode());
  expect(mode).toBe("skirmish");
});
