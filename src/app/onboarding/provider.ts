import "server-only";
import { getServerEnv } from "@/server/env";

export type WebsiteProvider = { mode: "disabled" | "fixture" };

export function websiteProvider(): WebsiteProvider {
  const env = getServerEnv();
  return { mode: env.OIDC_MODE === "fixture" && env.NODE_ENV !== "production" ? "fixture" : "disabled" };
}
