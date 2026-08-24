import { Pool } from "pg";
import { expect, test, type BrowserContext, type Page } from "playwright/test";
import { keyedHash } from "../../src/server/security/crypto";

const database = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow" });
const secret = "local-only-session-secret-change-me-32chars";
const offers = [
  { code: "essentials", name: "Essentials", seats: 1, monthly: "$69.99", annual: "$24" },
  { code: "growth", name: "Growth", seats: 5, monthly: "$89.99", annual: "$57" },
  { code: "scale", name: "Scale", seats: 15, monthly: "$119.99", annual: "$107" },
] as const;
const cadences = ["monthly", "annual"] as const;

function price(offer: (typeof offers)[number], cadence: (typeof cadences)[number]) {
  return cadence === "monthly" ? offer.monthly : offer.annual;
}

async function expectTerms(page: Page, offer: (typeof offers)[number], cadence: (typeof cadences)[number]) {
  const text = await page.locator("body").innerText();
  expect(text).toContain(offer.name);
  expect(text).toContain(price(offer, cadence));
  expect(text).toContain(cadence === "monthly" ? "per month" : "monthly equivalent, billed annually");
  expect(text).toContain(`One Workspace subscription includes ${offer.seats} active seat${offer.seats === 1 ? "" : "s"}, Owner included.`);
  expect(text).toContain("14-day trial");
  expect(text).toContain("Billing is not connected");
  expect(text).not.toMatch(/per user|\$29|\$129|3 active seats/i);
}

async function persistSelection(context: BrowserContext, code: string, cadence: "monthly" | "annual") {
  const suffix = crypto.randomUUID();
  const user = (await database.query(
    "insert into users(primary_email_normalized,primary_email_display,display_name,status,email_verified_at) values($1,$1,'Commercial journey','active',now()) returning id",
    [`commercial-journey-${suffix}@example.test`],
  )).rows[0];
  const token = `commercial-journey-${suffix}`;
  await database.query(
    "insert into sessions(user_id,session_hash,security_version,idle_expires_at,absolute_expires_at,authenticated_at,auth_method) values($1,$2,1,now()+interval '1 hour',now()+interval '1 day',now(),'password')",
    [user.id, keyedHash(token, secret)],
  );
  await database.query(
    "insert into onboarding_progress(user_id,selected_plan_code,billing_cadence,current_step) values($1,$2,$3,'workspace')",
    [user.id, code, cadence],
  );
  await context.addCookies([{ name: "nexaflow_session", value: token, url: "http://127.0.0.1:3000" }]);
}

for (const offer of offers) {
  for (const cadence of cadences) {
    test(`${offer.name} ${cadence}: select-plan routes to a server-fed registration summary`, async ({ page }) => {
      await page.goto(`/select-plan?plan=${offer.code}&cadence=${cadence}`);
      const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name: offer.name }) });
      await expect(card.getByRole("link", { name: `Start with ${offer.name}` })).toHaveAttribute("href", `/register?plan=${offer.code}&cadence=${cadence}`);
      await page.goto(`/register?plan=${offer.code}&cadence=${cadence}`);
      await expect(page.getByRole("button", { name: "Create account" })).toBeEnabled();
      await expectTerms(page, offer, cadence);
    });

    test(`${offer.name} ${cadence}: persisted selection is reconfirmed before Workspace creation`, async ({ page, context }) => {
      await persistSelection(context, offer.code, cadence);
      await page.goto("/workspace/create");
      await expect(page.getByRole("heading", { name: "Create your company Workspace" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Create company Workspace" })).toBeEnabled();
      await expectTerms(page, offer, cadence);
    });
  }
}

test.afterAll(async () => { await database.end(); });
