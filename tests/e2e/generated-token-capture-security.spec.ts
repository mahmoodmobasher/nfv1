import { expect, test, type APIResponse } from "playwright/test";

const token = "browser-capture/synthetic+token-123456789";
const encoded = encodeURIComponent(token);
const twiceEncoded = encodeURIComponent(encoded);

const entries = [
  ["/verify-email/capture", "/verify-email"],
  ["/verify-email", "/verify-email"],
  ["/reset-password/capture", "/reset-password"],
  ["/reset-password", "/reset-password"],
  ["/workspace/invitations/accept", "/workspace/invitations/accept"],
] as const;

async function expectTokenFree(response: APIResponse) {
  const observable = `${JSON.stringify(response.headersArray())}\n${await response.text()}`;
  for (const value of [token, encoded, twiceEncoded]) expect(observable).not.toContain(value);
}

function expectCaptureHeaders(response: APIResponse) {
  const headers = response.headers();
  expect(headers["cache-control"]).toBe("private, no-store");
  expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["content-security-policy"]).toMatch(
    /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/,
  );
  expect(response.headersArray().filter(({ name }) => name.toLowerCase() === "referrer-policy"))
    .toEqual([{ name: "referrer-policy", value: "no-referrer" }]);
}

test("real encrypted Outbox verification and reset links capture on the immutable production server", async ({
  request,
}) => {
  const generated = [
    [process.env.FRAMEWORK_CAPTURE_VERIFICATION_LINK, "/verify-email"],
    [process.env.FRAMEWORK_CAPTURE_RESET_LINK, "/reset-password"],
  ] as const;
  for (const [link, destination] of generated) {
    expect(link).toBeTruthy();
    const source = new URL(link!);
    const presentations: Array<Record<string, string>> = [
      {},
      { RSC: "1", "next-router-state-tree": "synthetic" },
      { "next-router-prefetch": "1", purpose: "prefetch" },
      { RSC: "1", "next-router-prefetch": "1", purpose: "prefetch" },
    ];
    for (const headers of presentations) {
      const response = await request.get(`${source.pathname}${source.search}`, {
        headers,
        maxRedirects: 0,
      });
      expect(response.status()).toBe(303);
      expect(response.headers()["location"]).toBe(destination);
      expectCaptureHeaders(response);
      const observable = `${JSON.stringify(response.headersArray())}\n${await response.text()}`;
      const generatedToken = source.searchParams.get("token")!;
      for (const value of [
        generatedToken,
        encodeURIComponent(generatedToken),
        encodeURIComponent(encodeURIComponent(generatedToken)),
      ]) expect(observable).not.toContain(value);
    }
  }
});

test("immutable production server captures HTML, RSC, prefetch, HEAD, and unsupported methods", async ({
  request,
}) => {
  const presentations: Array<Record<string, string>> = [
    {},
    { RSC: "1", "next-router-state-tree": "synthetic" },
    { "next-router-prefetch": "1" },
    { purpose: "prefetch" },
    {
      RSC: "1",
      "next-router-state-tree": "synthetic",
      "next-router-prefetch": "1",
      purpose: "prefetch",
    },
  ];

  for (const [path, destination] of entries) {
    for (const headers of presentations) {
      const response = await request.get(
        `${path}?extra=value&token=${encoded}&_rsc=synthetic`,
        { headers, maxRedirects: 0 },
      );
      expect(response.status(), `${path}: ${JSON.stringify(headers)}`).toBe(303);
      expect(response.headers()["location"]).toBe(destination);
      expectCaptureHeaders(response);
      await expectTokenFree(response);
    }

    const head = await request.head(`${path}?token=${encoded}&_rsc=synthetic`, {
      headers: { RSC: "1", purpose: "prefetch" },
      maxRedirects: 0,
    });
    expect(head.status()).toBe(303);
    expect(head.headers()["location"]).toBe(destination);
    expect(head.headers()["set-cookie"]).toContain("Max-Age=0");
    expectCaptureHeaders(head);
    await expectTokenFree(head);

    const unsupported = await request.fetch(`${path}?token=${encoded}`, {
      method: "PATCH",
      maxRedirects: 0,
    });
    expect(unsupported.status()).toBe(405);
    expect(unsupported.headers()["allow"]).toBe("GET, HEAD");
    expect(unsupported.headers()["location"]).toBeUndefined();
    expect(unsupported.headers()["set-cookie"]).toContain("Max-Age=0");
    expectCaptureHeaders(unsupported);
    await expectTokenFree(unsupported);
  }
});

test("production capture rejects duplicates and near misses without framework token redirects", async ({
  request,
}) => {
  for (const query of [
    `token=${encoded}&token=${encoded}`,
    "token=",
    "token=short",
    `token=${"x".repeat(201)}`,
    "token=%E0%A4%A",
  ]) {
    const response = await request.get(`/verify-email/capture?${query}`, { maxRedirects: 0 });
    expect(response.status()).toBe(303);
    expect(response.headers()["location"]).toBe("/verify-email");
    expect(response.headers()["set-cookie"]).toContain("Max-Age=0");
    expectCaptureHeaders(response);
    await expectTokenFree(response);
  }

  for (const path of [
    "/verify-email/capture/extra",
    "/reset-password/captured",
    "/workspace/invitations/acceptance",
  ]) {
    const response = await request.get(`${path}?token=${encoded}`, { maxRedirects: 0 });
    expect(response.status(), path).toBe(404);
    expect(response.headers()["location"], path).toBeUndefined();
    expect(response.headers()["referrer-policy"], path).toBeUndefined();
  }
});

test("browser navigation leaves only opaque intent and no token in rendered or outbound state", async ({
  page,
  context,
}) => {
  const requests: Array<{ url: string; referer: string | undefined }> = [];
  const consoleMessages: string[] = [];
  page.on("request", (request) => {
    requests.push({ url: request.url(), referer: request.headers()["referer"] });
  });
  page.on("console", (message) => consoleMessages.push(message.text()));

  const captureResponse = await page.goto(`/verify-email/capture?extra=one&token=${encoded}&_rsc=synthetic`);
  await expect(page).toHaveURL(/\/verify-email$/);
  const captureCookie = captureResponse?.request().redirectedFrom()?.response()
    ? await (await captureResponse.request().redirectedFrom()!.response())!.headerValue("set-cookie")
    : null;
  expect(captureCookie).toContain("nexaflow_email_verification_intent=");
  expect(captureCookie).toContain("HttpOnly");
  expect(captureCookie).toContain("Secure");
  expect(captureCookie).not.toContain(token);
  expect(await page.locator("html").textContent()).not.toContain(token);
  expect(JSON.stringify(await page.evaluate(() => ({
    local: Object.entries(localStorage),
    session: Object.entries(sessionStorage),
    body: document.documentElement.innerHTML,
    url: location.href,
    referrer: document.referrer,
  })))).not.toContain(token);
  const cookies = await context.cookies();
  expect(JSON.stringify(cookies)).not.toContain(token);
  await expect(page.locator("#website-main")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await page.setViewportSize({ width: 320, height: 720 });
  expect(await page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth))
    .toBe(true);
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe("BODY");

  await page.reload();
  await page.goto("/login");
  await page.goBack();
  await expect(page).toHaveURL(/\/verify-email$/);

  for (const request of requests) {
    const requestUrl = new URL(request.url);
    if (requestUrl.searchParams.has("token")) {
      expect(requestUrl.pathname).toBe("/verify-email/capture");
      expect(requestUrl.searchParams.get("token")).toBe(token);
      expect(request.referer).toBeUndefined();
    } else {
      expect(request.url).not.toContain(encoded);
      expect(request.url).not.toContain(twiceEncoded);
      expect(request.referer ?? "").not.toContain(token);
    }
  }
  expect(JSON.stringify(consoleMessages)).not.toContain(token);
});
