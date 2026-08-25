import { LeadIntakeError } from "../contracts/lead-inquiry-intake.contract";

const privateHeaders = { "cache-control": "private, no-store, max-age=0", pragma: "no-cache", vary: "cookie" };

export function leadIntakeJson(data: unknown, status = 200) {
  return Response.json({ data }, { status, headers: privateHeaders });
}

export function leadIntakeFailure(error: unknown, requestId: string) {
  const known = error instanceof LeadIntakeError ? error :
    error && typeof error === "object" && "code" in error && "status" in error
      ? new LeadIntakeError((error as { code: never }).code, (error as { status: number }).status)
      : new LeadIntakeError("unexpected_error", 500);
  const body: Record<string, unknown> = { code: known.code };
  if (known.safe && known.status === 400) body.details = known.safe;
  return Response.json({ error: body, requestId }, { status: known.status, headers: privateHeaders });
}
