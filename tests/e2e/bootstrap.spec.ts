import { expect, test } from "@playwright/test";

test("bootstrap app loads and starts skirmish shell", async ({ page }) => {
  await page.goto("/?e2e=1&seed=bootstrap");

  await expect(page.getByTestId("main-menu")).toBeVisible();
  await expect(page.getByTestId("e2e-mode")).toHaveText("enabled");
  await expect(page.getByTestId("seed-value")).toHaveText("bootstrap");

  await page.getByTestId("start-skirmish").click();

  await expect(page.getByTestId("game-shell")).toBeVisible();
  await expect(page.getByTestId("hud")).toBeVisible();

  const mode = await page.evaluate(() => window.__REDWALL_DEBUG__?.getMode());
  expect(mode).toBe("skirmish");
});

test("camera, selection, and move commands work", async ({ page }) => {
  await page.goto("/?e2e=1&seed=movement");
  await page.getByTestId("start-skirmish").click();

  const beforeCamera = await page.evaluate(() => window.__REDWALL_DEBUG__?.getCameraState());
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(200);
  await page.keyboard.up("KeyD");
  const afterCamera = await page.evaluate(() => window.__REDWALL_DEBUG__?.getCameraState());
  expect(beforeCamera?.scrollX).not.toBe(afterCamera?.scrollX);

  const workerId = await page.evaluate(() => {
    const snapshot = window.__REDWALL_DEBUG__?.getSnapshot();
    if (!snapshot) {
      return null;
    }
    return Object.values(snapshot.entities).find((entity) => entity.kind === "unit" && entity.playerId === "player" && entity.unitType === "worker")?.id ?? null;
  });
  expect(workerId).toBeTruthy();
  if (!workerId) {
    throw new Error("Worker was not found in snapshot");
  }

  const workerPoint = await page.evaluate((id) => window.__REDWALL_DEBUG__?.getScreenPointForEntity(id), workerId);
  expect(workerPoint).toBeTruthy();
  const canvasBox = await page.locator("[data-testid='game-shell'] canvas").boundingBox();
  expect(canvasBox).toBeTruthy();
  await page.evaluate((id) => window.__REDWALL_DEBUG__?.setSelection(id ? [id] : []), workerId);
  await expect(page.getByTestId("selection-name")).toHaveText("Worker");

  const destination = { x: 8, y: 8 };
  const destinationPoint = await page.evaluate((tile) => window.__REDWALL_DEBUG__?.getScreenPointForTile(tile), destination);
  expect(destinationPoint).toBeTruthy();
  await page.evaluate((id) => {
    if (!id) {
      return false;
    }
    return window.__REDWALL_DEBUG__?.issueCommand({
      type: "move",
      unitIds: [id],
      destination: { x: 8, y: 8 },
    });
  }, workerId);

  await page.evaluate(() => window.__REDWALL_DEBUG__?.advanceTicks(30));
  const moved = await page.evaluate((id) => {
    const snapshot = window.__REDWALL_DEBUG__?.getSnapshot();
    const entity = id ? snapshot?.entities[id] : undefined;
    return entity && entity.kind === "unit" ? { x: entity.position.x, y: entity.position.y } : null;
  }, workerId);
  expect(moved).toBeTruthy();
  expect(moved!.x).toBeGreaterThan(6.5);
  expect(moved!.y).toBeGreaterThan(6.5);
});
