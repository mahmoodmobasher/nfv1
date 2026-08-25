import { Pool } from "pg";
import { expect, test, type Locator, type Page } from "playwright/test";

const databaseUrl = process.env.DATABASE_URL;
const database = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null;
test.use({ baseURL: process.env.HOMEPAGE_BASE_URL ?? "http://127.0.0.1:3000" });

function channel(value: number) { const normalized = value / 255; return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4; }
function contrast(foreground: string, background: string) {
  const values = (value: string) => value.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(channel);
  const luminance = (value: string) => { const [red, green, blue] = values(value); return .2126 * red + .7152 * green + .0722 * blue; };
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + .05) / (darker + .05);
}
async function textContrast(target: Locator) {
  const colors = await target.evaluate((element) => {
    let node: Element | null = element;
    while (node) { const background = getComputedStyle(node).backgroundColor; if (background !== "transparent" && !background.endsWith(", 0)")) return { foreground: getComputedStyle(element).color, background }; node = node.parentElement; }
    throw new Error("No opaque background");
  });
  return contrast(colors.foreground, colors.background);
}
async function assertNoOverflow(page: Page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true); }

test.afterAll(async () => { await database?.end(); });

for (const viewport of [["desktop", 1440, 900], ["tablet", 768, 1024], ["mobile", 320, 700]] as const) {
  for (const theme of ["light", "dark"] as const) {
    test(`homepage Spectrum presentation is accessible at ${viewport[0]} ${theme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.addInitScript((value) => document.documentElement.dataset.theme = value, theme);
      await page.setViewportSize({ width: viewport[1], height: viewport[2] });
      await page.goto("/");
      await expect(page.getByRole("banner")).toBeVisible();
      await expect(page.getByRole("main")).toBeVisible();
      await expect(page.getByRole("contentinfo")).toBeVisible();
      await expect(page.getByRole("heading", { level: 1, name: "Keep the whole customer journey in view." })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Primary navigation" })).toHaveCount(viewport[1] >= 1024 ? 1 : 0);
      await expect(page.getByRole("link", { name: "Explore plans" })).toHaveAttribute("href", "/select-plan");
      if (viewport[1] >= 1024) {
        await expect(page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Plans" })).toHaveAttribute("href", "/select-plan");
      }
      await expect(page.getByText("One Workspace subscription includes 1 active seat, Owner included.")).toBeVisible();
      await expect(page.getByText("One Workspace subscription includes 1 active seats, Owner included.")).toHaveCount(0);
      for (const detail of ["$69.99", "$89.99", "$119.99", "Billing is not connected in this environment.", "Contact Sales"]) await expect(page.getByText(detail, { exact: false })).toBeVisible();
      await expect(page.getByText(/per user/i)).toHaveCount(0);
      const faq = page.locator("#questions summary").first();
      await faq.focus(); await page.keyboard.press("Enter"); await expect(page.getByText(/UAT environment is live/)).toBeVisible();
      const planLink = page.getByRole("link", { name: "Choose Essentials" });
      await planLink.focus(); await expect(planLink).toBeFocused();
      expect(await textContrast(page.getByRole("contentinfo").getByText("NexaFlow Systems", { exact: true }))).toBeGreaterThanOrEqual(4.5);
      await assertNoOverflow(page);
    });
  }
}

test("homepage system theme follows its semantic footer tokens", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  expect(await textContrast(page.getByRole("contentinfo").getByText("NexaFlow Systems", { exact: true }))).toBeGreaterThanOrEqual(4.5);
  await assertNoOverflow(page);
});

test("homepage fails closed when the effective catalog is unavailable", async ({ page }) => {
  test.skip(!database, "requires the isolated browser database");
  await database!.query("update plan_catalog_entries set included_active_seats=2 where code='essentials' and catalog_version='2026-08-commercial-v1'");
  try {
    await page.goto("/");
    await expect(page.getByText("Plans are temporarily unavailable. Contact Sales for help.", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /Choose / })).toHaveCount(0);
  } finally {
    await database!.query("update plan_catalog_entries set included_active_seats=1 where code='essentials' and catalog_version='2026-08-commercial-v1'");
  }
});
