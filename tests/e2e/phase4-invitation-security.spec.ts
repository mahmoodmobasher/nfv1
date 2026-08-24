import { expect, test } from "playwright/test";

const token = "invitation-browser-security-probe-1234567890";
const encodedToken = encodeURIComponent(token);
const entry = `/workspace/invitations/accept?token=${encodedToken}`;

function expectTokenFree(value: string) {
  expect(value).not.toContain(token);
  expect(value).not.toContain(encodedToken);
}

test("invitation capture stays outside HTML, RSC, history, storage, and outbound requests", async ({
  context,
  page,
}) => {
  const requestShapes: Array<Record<string, string>> = [{}, { RSC: "1" }];
  for (const headers of requestShapes) {
    const capture = await context.request.get(entry, {
      headers,
      maxRedirects: 0,
    });
    expect(capture.status()).toBe(303);
    expect(capture.headers()["location"]).toBe(
      "/workspace/invitations/accept",
    );
    expect(capture.headers()["cache-control"]).toBe("private, no-store");
    expect(capture.headers()["referrer-policy"]).toBe("no-referrer");
    expectTokenFree(await capture.text());
    expectTokenFree(capture.headers()["location"] ?? "");
    expectTokenFree(capture.headers()["set-cookie"] ?? "");
  }

  await page.goto("/login");
  const outbound: string[] = [];
  page.on("request", (request) => outbound.push(request.url()));
  await page.goto(entry);
  await expect(page).toHaveURL(
    "http://127.0.0.1:3000/workspace/invitations/accept",
  );
  await expect(
    page.getByRole("heading", { name: "This invitation isn’t available" }),
  ).toBeVisible();
  expectTokenFree(await page.content());
  expectTokenFree(JSON.stringify(await page.evaluate(() => history.state)));
  expectTokenFree(
    JSON.stringify(
      await page.evaluate(() => ({
        local: Object.entries(localStorage),
        session: Object.entries(sessionStorage),
      })),
    ),
  );
  for (const url of outbound.slice(1)) expectTokenFree(url);

  await page.goBack();
  await expect(page).toHaveURL(/\/login$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/workspace\/invitations\/accept$/);
  expectTokenFree(page.url());
});
