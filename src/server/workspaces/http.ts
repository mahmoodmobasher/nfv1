import { NextResponse } from "next/server";

export function privateWorkspaceResponse(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export function privateWorkspaceJson(data: unknown, init?: ResponseInit): NextResponse {
  return privateWorkspaceResponse(NextResponse.json(data, init));
}
