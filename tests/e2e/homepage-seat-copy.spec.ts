import { expect, test } from "playwright/test";

for (const viewport of [{ width: 1440, height: 900 }, { width: 320, height: 700 }]) {
  test(`homepage uses singular Essentials seat copy at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByText("One Workspace subscription includes 1 active seat, Owner included.")).toBeVisible();
    await expect(page.getByText("One Workspace subscription includes 1 active seats, Owner included.")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
}
