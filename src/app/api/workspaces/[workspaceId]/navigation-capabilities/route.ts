import { getWorkspaceNavigationCapabilitiesV1, workspaceNavigationErrorEnvelopeV1Schema } from "@/backend/modules/navigation";
import { localDatabase } from "@/server/http";
import { tenant } from "@/server/tenant-admin/http";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function GET(request: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const requestId = crypto.randomUUID();
  const { workspaceId } = await params;
  const { pool } = localDatabase();
  try {
    const value = await getWorkspaceNavigationCapabilitiesV1(pool, await tenant(pool, request, workspaceId), workspaceId, requestId);
    return Response.json({ data: value }, { headers });
  } catch (error) {
    const code = (error as { code?: string }).code;
    const ownedCode = code === "authentication_required" ? code : code === "resource_not_found" ? code : "navigation_unavailable";
    const unavailable = ownedCode === "navigation_unavailable";
    const body = workspaceNavigationErrorEnvelopeV1Schema.parse({
      error: {
        code: ownedCode,
        message: unavailable ? "Navigation is temporarily unavailable." : ownedCode === "authentication_required" ? "Authentication is required." : "Workspace is unavailable.",
        retryable: unavailable,
        reconciliation: { required: true, action: unavailable ? "retry_same_request" : "clear_navigation_state" },
      },
      requestId,
    });
    return Response.json(body, { status: unavailable ? 503 : ownedCode === "authentication_required" ? 401 : 404, headers });
  } finally {
    await pool.end();
  }
}
