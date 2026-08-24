import { NextResponse } from "next/server";

export function privateSessionJson(authenticated: boolean): NextResponse {
  return privateIdentityJson({ authenticated });
}

export function privateIdentityJson(body: unknown, init?: ResponseInit): NextResponse {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export function privateIdentityResponse<T extends Response>(response: T): T {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
