import { expect, test } from "playwright/test";

test("plan selection presents server-catalog intent with canonical Workspace and seat policy", async ({ page }) => {
  await page.goto("/select-plan?plan=growth&cadence=annual");
  await expect(page.getByRole("heading", { name: "Choose one Workspace plan for your company" })).toBeVisible();
  await expect(page.getByText("Each self-service subscription includes one company Workspace.")).toBeVisible();
  await expect(page.getByRole("radio", { name: "Annual · Selected" })).toHaveAttribute("aria-checked", "true");
  const growth = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Growth" }) });
  await expect(growth).toHaveAttribute("aria-current", "true");
  await expect(growth).toContainText("1 Owner");
  await expect(growth).toContainText("Production billing and plan changes are not connected.");
  const enterprise = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Enterprise" }) });
  await expect(enterprise.getByRole("link", { name: "Contact Sales" })).toHaveAttribute("href", /mailto:/);
  await expect(page.getByRole("link", { name: /create.*Workspace/i })).toHaveCount(0);
});

test("plan selection reflows at 320px without losing single-choice state", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/select-plan?plan=essentials&cadence=monthly");
  await expect(page.getByRole("radio", { name: "Monthly · Selected" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("link", { name: "Start with Essentials" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
