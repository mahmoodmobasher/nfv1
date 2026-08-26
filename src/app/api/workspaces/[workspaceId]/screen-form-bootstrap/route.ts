import { getScreenFormBootstrapV1 } from "@/backend/modules/screen-forms";
import { screenFormsRoute } from "@/backend/modules/screen-forms/presentation/screen-forms.route";

const kinds = new Set(["company", "contact", "lead"] as const);

export async function GET(request: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  return screenFormsRoute(request, workspaceId, ({ pool, actor, requestId }) => {
    const values = new URL(request.url).searchParams;
    if ([...values.keys()].some(key => key !== "kind") || values.getAll("kind").length !== 1)
      throw Object.assign(new Error("validation_failed"), { code: "validation_failed", status: 400, fields: ["kind"] });
    const kind = values.get("kind");
    if (!kind || !kinds.has(kind as "company" | "contact" | "lead"))
      throw Object.assign(new Error("validation_failed"), { code: "validation_failed", status: 400, fields: ["kind"] });
    return getScreenFormBootstrapV1(pool, actor, kind as "company" | "contact" | "lead", requestId);
  });
}
