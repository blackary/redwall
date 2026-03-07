import { expect, test } from "@playwright/test";

test("main menu page scrolls on shorter viewports", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 640 });
  await page.goto("/?e2e=1&seed=menu-scroll");

  await expect(page.getByTestId("main-menu")).toBeVisible();

  const metrics = await page.evaluate(() => ({
    appMode: document.body.dataset.appMode,
    scrollHeight: document.scrollingElement?.scrollHeight ?? 0,
    innerHeight: window.innerHeight,
    scrollY: window.scrollY,
  }));

  expect(metrics.appMode).toBe("menu");
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.innerHeight);

  await page.evaluate(() => {
    window.scrollTo(0, document.scrollingElement?.scrollHeight ?? 0);
  });

  await page.waitForFunction(() => window.scrollY > 40);
  await expect(page.getByTestId("reduced-motion-toggle")).toBeVisible();
});
