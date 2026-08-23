import { NextResponse } from "next/server";
import { TenantAdminError } from "../tenant-admin/permissions";
import { AccountError } from "./service";

export function privateAccountResponse(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export function privateAccountJson(data: unknown, init?: ResponseInit): NextResponse {
  return privateAccountResponse(NextResponse.json(data, init));
}

export function accountFailure(error: unknown): NextResponse {
  if (error instanceof AccountError) {
    return privateAccountJson({ ok: false, code: error.code }, { status: error.status });
  }
  if (error instanceof TenantAdminError && (error.code === "authentication_required" || error.code === "rate_limited")) {
    return privateAccountJson({ ok: false, code: error.code }, { status: error.status });
  }
  return privateAccountJson({ ok: false, code: "validation_failed" }, { status: 400 });
}
