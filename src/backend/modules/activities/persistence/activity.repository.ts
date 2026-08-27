import type { ModuleTransaction } from "@/backend/platform/database";
import type { ActivityCreateCommandV1 } from "../contracts/activity.contract";

export type ActivityRow = {
  activity_id: string; version: number; record_id: string; origin: "manual";
  kind: ActivityCreateCommandV1["kind"]; direction: ActivityCreateCommandV1["direction"];
  outcome: ActivityCreateCommandV1["outcome"]; occurred_at: Date; duration_minutes: number | null;
  subject: string; details: string | null; created_by_membership_id: string; created_at: Date;
};

export const ACTIVITY_TARGET_LIST_SQL_V1 = `select a.id activity_id,a.version,r.record_id,a.origin,a.kind,a.direction,a.outcome,
 r.occurred_at,a.duration_minutes,a.subject,a.details,a.created_by_membership_id,a.created_at
 from activity_record_references r
 join activity_records a on a.workspace_id=r.workspace_id and a.id=r.activity_id
 where r.workspace_id=$1 and r.record_type='crm.lead' and r.record_id=$2
 and ($3::text is null or a.kind=$3)
 and ($4::timestamptz is null or (r.occurred_at,r.activity_id)<($4::timestamptz,$5::uuid))
 order by r.occurred_at desc nulls last,r.activity_id desc nulls last limit $6`;

export function activityRepository(tx: ModuleTransaction) {
  async function find(workspaceId: string, leadId: string, activityId: string): Promise<ActivityRow | null> {
    const row = (await tx.query<ActivityRow>(`select a.id activity_id,a.version,r.record_id,a.origin,a.kind,
      a.direction,a.outcome,r.occurred_at,a.duration_minutes,a.subject,a.details,a.created_by_membership_id,a.created_at
      from activity_record_references r
      join activity_records a on a.workspace_id=r.workspace_id and a.id=r.activity_id
      where r.workspace_id=$1 and r.record_type='crm.lead' and r.record_id=$2 and r.activity_id=$3`,
    [workspaceId, leadId, activityId])).rows[0];
    return row ?? null;
  }
  return {
    async create(input: { workspaceId: string; leadId: string; actorMembershipId: string;
      command: ActivityCreateCommandV1 }) {
      const row = (await tx.query<{ id: string; version: number }>(
        `insert into activity_records(workspace_id,origin,kind,direction,outcome,occurred_at,duration_minutes,subject,
          details,created_by_membership_id) values($1,'manual',$2,$3,$4,$5,$6,$7,$8,$9) returning id,version`,
        [input.workspaceId, input.command.kind, input.command.direction, input.command.outcome,
          input.command.occurredAt, input.command.durationMinutes, input.command.subject, input.command.details,
          input.actorMembershipId])).rows[0];
      if (!row) throw new Error("activity_insert_unavailable");
      await tx.query(`insert into activity_record_references(workspace_id,activity_id,record_type,record_id)
        values($1,$2,'crm.lead',$3)`, [input.workspaceId, row.id, input.leadId]);
      return row;
    },
    async transactionTimestamp(): Promise<Date> {
      const row = (await tx.query<{ transaction_now: Date }>(
        `select transaction_timestamp() "transaction_now"`)).rows[0];
      if (!row?.transaction_now) throw new Error("transaction_timestamp_unavailable");
      return row.transaction_now;
    },
    find,
    async get(workspaceId: string, leadId: string, activityId: string): Promise<ActivityRow> {
      const row = await find(workspaceId, leadId, activityId);
      if (!row) throw Object.assign(new Error("resource_not_found"), { code: "resource_not_found", status: 404 });
      return row;
    },
    async list(input: { workspaceId: string; leadId: string; kind?: ActivityCreateCommandV1["kind"];
      cursor: { occurredAt: string; activityId: string } | null; limit: number }) {
      return (await tx.query<ActivityRow>(ACTIVITY_TARGET_LIST_SQL_V1, [input.workspaceId, input.leadId,
        input.kind ?? null, input.cursor?.occurredAt ?? null, input.cursor?.activityId ?? null, input.limit + 1])).rows;
    },
  };
}
