import { NextResponse } from "next/server";
import { privateWorkspaceResponse } from "@/server/workspaces/http";

// Raw browser-token capture moved to Proxy so it completes before rendering.
// Keep the former endpoint fail-closed while cached clients age out.
export function POST() {
  const response = privateWorkspaceResponse(
    NextResponse.json({ code: "invitation_capture_retired" }, { status: 404 }),
  );
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
