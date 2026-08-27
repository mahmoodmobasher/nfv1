import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { leadActivityTargetParticipant } from "@/backend/modules/leads";
import type { TrustedActor } from "@/backend/platform/authorization";
import { runModuleTransaction, type ModuleTransaction } from "@/backend/platform/database";
import { ACTIVITY_LIST_QUERY_V1, activityListQueryV1Schema, leadActivityListV1Schema,
  type ActivityListQueryV1 } from "../contracts/activity.contract";
import { activityRepository, type ActivityRow } from "../persistence/activity.repository";
import { activityFail, activityItem, mapActivityError } from "./activity.shared";

const uuid = z.string().uuid();
type CursorV1 = { v: 1; queryVersion: typeof ACTIVITY_LIST_QUERY_V1; workspaceId: string; leadId: string;
  kind: ActivityListQueryV1["kind"] | null; occurredAt: string; activityId: string };
function decodeCursor(value: string | undefined, input: { workspaceId: string; leadId: string;
  kind?: ActivityListQueryV1["kind"] }): CursorV1 | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<CursorV1>;
    if (parsed.v !== 1 || parsed.queryVersion !== ACTIVITY_LIST_QUERY_V1 || parsed.workspaceId !== input.workspaceId ||
        parsed.leadId !== input.leadId || parsed.kind !== (input.kind ?? null) ||
        typeof parsed.occurredAt !== "string" || Number.isNaN(Date.parse(parsed.occurredAt)) ||
        !uuid.safeParse(parsed.activityId).success) throw new Error("invalid");
    return parsed as CursorV1;
  } catch { return activityFail("validation_failed", 400, { fields: ["cursor"] }); }
}
function encodeCursor(row: ActivityRow, input: { workspaceId: string; leadId: string;
  kind?: ActivityListQueryV1["kind"] }) {
  const cursor: CursorV1 = { v: 1, queryVersion: ACTIVITY_LIST_QUERY_V1, workspaceId: input.workspaceId,
    leadId: input.leadId, kind: input.kind ?? null, occurredAt: row.occurred_at.toISOString(),
    activityId: row.activity_id };
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}
export function parseActivityListSearchParams(params: URLSearchParams): unknown {
  const allowed = new Set(["queryVersion", "kind", "limit", "cursor"]), keys = [...params.keys()];
  if (keys.some(key => !allowed.has(key)) || keys.some(key => params.getAll(key).length !== 1))
    return { invalid: true };
  return { queryVersion: params.get("queryVersion") ?? ACTIVITY_LIST_QUERY_V1,
    kind: params.get("kind") ?? undefined, limit: params.has("limit") ? Number(params.get("limit")) : undefined,
    cursor: params.get("cursor") ?? undefined };
}
export async function listLeadActivitiesV1(pool: Pool, actor: TrustedActor, leadId: string,
  rawQuery: ActivityListQueryV1, requestId: string = randomUUID(),
  testOnlyBeforeFinalFence?: (tx: ModuleTransaction) => Promise<void>) {
  const queryResult = activityListQueryV1Schema.safeParse(rawQuery);
  if (!queryResult.success) activityFail("validation_failed", 400,
    { fields: queryResult.error.issues.map(issue => String(issue.path[0] ?? "")) });
  const query = queryResult.data;
  try {
    return await runModuleTransaction(pool, async tx => {
      const target = leadActivityTargetParticipant(tx), initial = await target.authorizeView(actor, leadId);
      const cursor = decodeCursor(query.cursor, { workspaceId: initial.actor.workspaceId, leadId, kind: query.kind });
      const rows = await activityRepository(tx).list({ workspaceId: initial.actor.workspaceId, leadId,
        kind: query.kind, cursor, limit: query.limit });
      const hasMore = rows.length > query.limit, page = rows.slice(0, query.limit), boundary = page.at(-1);
      await testOnlyBeforeFinalFence?.(tx);
      const final = await target.authorizeView(initial.actor, leadId);
      return leadActivityListV1Schema.parse({ contractVersion: "lead-activity-list.v1",
        lead: { leadId, version: final.lead.version, capabilities: final.capabilities }, items: page.map(activityItem),
        hasMore, nextCursor: hasMore && boundary ? encodeCursor(boundary, { workspaceId: final.actor.workspaceId,
          leadId, kind: query.kind }) : null, requestId });
    });
  } catch (error) { return mapActivityError(error); }
}
