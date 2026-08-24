import { NextResponse } from "next/server";

export function privateSessionJson(authenticated: boolean): NextResponse {
  const response = NextResponse.json({ authenticated });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
