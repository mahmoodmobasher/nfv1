import {
  getScreenFormSelectedOptionV1,
  screenFormSelectedOptionQueryV1Schema,
} from "@/backend/modules/screen-forms";
import { screenFormsRoute } from "@/backend/modules/screen-forms/presentation/screen-forms.route";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  return screenFormsRoute(request, workspaceId, ({ pool, actor, requestId }) => {
    const values = new URL(request.url).searchParams;
    const allowed = new Set([
      "kind",
      "optionKind",
      "id",
      "targetKind",
      "target",
      "excludeRecordId",
    ]);
    if (
      [...values.keys()].some(
        (key) => !allowed.has(key) || values.getAll(key).length !== 1,
      ) ||
      [...allowed]
        .filter((key) => key !== "excludeRecordId")
        .some((key) => !values.has(key))
    )
      throw Object.assign(new Error("validation_failed"), {
        code: "validation_failed",
        status: 400,
      });
    const targetKind = values.get("targetKind"),
      targetValue = values.get("target"),
      target =
        targetKind === "version"
          ? { kind: "version" as const, version: Number(targetValue) }
          : targetKind === "updated_at"
            ? { kind: "updated_at" as const, updatedAt: targetValue }
            : null,
      parsed = screenFormSelectedOptionQueryV1Schema.safeParse({
        kind: values.get("kind") ?? undefined,
        optionKind: values.get("optionKind") ?? undefined,
        id: values.get("id") ?? undefined,
        target,
        excludeRecordId: values.get("excludeRecordId") ?? undefined,
      });
    if (!parsed.success)
      throw Object.assign(new Error("validation_failed"), {
        code: "validation_failed",
        status: 400,
        fields: parsed.error.issues
          .map((issue) => issue.path.map(String).join("."))
          .filter(Boolean),
      });
    return getScreenFormSelectedOptionV1(
      pool,
      actor,
      parsed.data,
      requestId,
    );
  });
}
