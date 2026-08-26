import type { PoolClient } from "pg";
import type { TrustedActor } from "@/backend/platform/authorization";

export async function listLeadStageScreenOptions(
  tx: PoolClient,
  actor: TrustedActor,
  input: {
    search: string;
    cursor: { label: string; id: string } | null;
    limit: number;
  },
) {
  const rows = (
    await tx.query<{ id: string; label: string; updatedAt: string }>(
      `select s.id,s.name label,s.updated_at::text "updatedAt" from pipeline_stages s where s.workspace_id=$1 and s.status='active' and lower(s.name) like $2 escape '\\' and ($3::text is null or (lower(s.name),s.id)>($3,$4::uuid)) order by lower(s.name),s.id limit $5 for no key update of s`,
      [
        actor.workspaceId,
        input.search,
        input.cursor?.label ?? null,
        input.cursor?.id ?? null,
        input.limit + 1,
      ],
    )
  ).rows;
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    target: {
      kind: "updated_at" as const,
      updatedAt: new Date(row.updatedAt).toISOString(),
    },
  }));
}
