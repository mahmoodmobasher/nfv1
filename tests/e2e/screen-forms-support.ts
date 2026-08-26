import { expect, type Locator, type Page } from "playwright/test";

export type LabelInventory = readonly {
  section: string;
  labels: readonly string[];
}[];

export async function assertFormReadingOrder(page: Page, inventory: LabelInventory) {
  const headings = page.locator("main section h2");
  await expect(headings).toHaveText(inventory.map((value) => value.section));
  const labels = page.locator("main label");
  const visible = (await labels.allTextContents()).map((value) => value.replace(/\s+/g, " ").trim());
  let cursor = -1;
  for (const expected of inventory.flatMap((value) => value.labels)) {
    const next = visible.findIndex((value, index) => index > cursor && value.includes(expected));
    expect(next, `Expected ${expected} after inventory position ${cursor}`).toBeGreaterThan(cursor);
    cursor = next;
  }
}

export async function assertLinkedErrorSummary(page: Page, fieldIds: readonly string[]) {
  const summary = page.getByRole("alert").filter({ has: page.getByRole("heading", { name: /correct|check|error/i }) });
  await expect(summary).toBeFocused();
  for (const id of fieldIds) {
    const field = page.locator(`#${id}`), error = page.locator(`#${id}-error`);
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await expect(field).toHaveAttribute("aria-describedby", new RegExp(`(?:^|\\s)${id}-error(?:\\s|$)`));
    await expect(error).toBeVisible();
    await expect(summary.locator(`a[href="#${id}"]`)).toHaveCount(1);
  }
}

export async function assertCancelFirstDialogLifecycle(input: {
  page: Page;
  trigger: Locator;
  dialogName: string | RegExp;
  cancelName?: string | RegExp;
}) {
  const { page, trigger, dialogName, cancelName = "Cancel" } = input;
  await trigger.focus();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: dialogName }), cancel = dialog.getByRole("button", { name: cancelName });
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByRole("button", { name: cancelName }).click();
  await expect(trigger).toBeFocused();
}

export async function assertNoPageOverflow(page: Page) {
  expect(await page.locator("html").evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  expect(await page.locator("body").evaluate((node) => node.scrollWidth <= window.innerWidth)).toBe(true);
}

export async function atScreenFormViewports(page: Page, verify: (label: string) => Promise<void>) {
  for (const viewport of [
    { label: "phone-320", width: 320, height: 720 },
    { label: "zoom-200", width: 640, height: 720 },
    { label: "desktop", width: 1280, height: 900 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await verify(viewport.label);
    await assertNoPageOverflow(page);
  }
}
