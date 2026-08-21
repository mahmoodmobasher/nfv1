import type { Pool } from "pg";
import type { IdentityContext } from "../security/session";

export type CrmHomeFilters = {
  status: "all" | "open" | "won" | "lost";
  stage: "all" | string;
  owner: "all" | "mine" | string;
  team: "all" | string;
  period: "all" | "7d" | "30d" | "90d";
};
export type CrmHomeRawFilters = Record<string, string | string[] | undefined>;
export type CrmHomeOption = { id: string; label: string; archived?: boolean };
export type CrmHomeModel = {
  source: "live";
  generatedAt: string;
  workspace: { id: string; name: string };
  actor: { role: "owner" | "admin" | "member"; membershipId: string };
  filters: CrmHomeFilters;
  options: { stages: CrmHomeOption[]; owners: CrmHomeOption[]; teams: CrmHomeOption[] };
  summary: { visible: number; open: number; won: number; lost: number };
  pipeline: Array<{ stageId: string; name: string; position: number; archived: boolean; count: number }>;
  owners: Array<{ membershipId: string; displayName: string; count: number }>;
  teams: Array<{ teamId: string; name: string; count: number }>;
  recentActivity: Array<{ activityId: string; leadId: string; leadLabel: string; kind: string; bodyPreview: string; actorLabel: string; occurredAt: string }>;
};

export class CrmHomeError extends Error {
  constructor(public code: "invalid_filter" | "resource_not_found" | "access_denied" | "dashboard_unavailable", public status: number) { super(code); }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEYS = new Set(["status", "stage", "owner", "team", "period"]);

export function parseCrmHomeFilters(raw: CrmHomeRawFilters): CrmHomeFilters {
  if (Object.keys(raw).some((key) => !KEYS.has(key)) || Object.values(raw).some(Array.isArray)) throw new CrmHomeError("invalid_filter", 400);
  const status = raw.status ?? "all", stage = raw.stage ?? "all", owner = raw.owner ?? "all", team = raw.team ?? "all", period = raw.period ?? "all";
  if (typeof status !== "string" || !["all", "open", "won", "lost"].includes(status)) throw new CrmHomeError("invalid_filter", 400);
  if (typeof period !== "string" || !["all", "7d", "30d", "90d"].includes(period)) throw new CrmHomeError("invalid_filter", 400);
  if (typeof stage !== "string" || (stage !== "all" && !UUID.test(stage))) throw new CrmHomeError("invalid_filter", 400);
  if (typeof owner !== "string" || (owner !== "all" && owner !== "mine" && !UUID.test(owner))) throw new CrmHomeError("invalid_filter", 400);
  if (typeof team !== "string" || (team !== "all" && !UUID.test(team))) throw new CrmHomeError("invalid_filter", 400);
  return { status: status as CrmHomeFilters["status"], stage, owner, team, period: period as CrmHomeFilters["period"] };
}

export function activityLabel(kind: string) {
  return ({ note: "Note", created: "Lead created", updated: "Lead updated", stage_changed: "Stage changed", status_changed: "Status changed" } as Record<string, string>)[kind] ?? "Activity";
}
export function activityPreview(value: string) { return value.replace(/\s+/g, " ").trim().slice(0, 160); }
export function crmPeriodStart(period:CrmHomeFilters["period"],now=new Date()){return period==="all"?undefined:new Date(now.getTime()-Number.parseInt(period,10)*86_400_000)}

type SnapshotRow = {
  workspace: { id: string; name: string } | null;
  actor: { role: "owner" | "admin" | "member"; membershipId: string } | null;
  summary: CrmHomeModel["summary"];
  pipeline: CrmHomeModel["pipeline"];
  owners: CrmHomeModel["owners"];
  teams: CrmHomeModel["teams"];
  activities: Array<Omit<CrmHomeModel["recentActivity"][number], "kind" | "bodyPreview" | "occurredAt"> & { kind: string; body: string; occurredAt: Date | string }>;
  stage_options: CrmHomeOption[];
  owner_options: CrmHomeOption[];
  team_options: CrmHomeOption[];
};

export async function crmHome(database: Pool, identity: IdentityContext, workspaceId: string, rawFilters: CrmHomeRawFilters, now = new Date()): Promise<CrmHomeModel> {
  const filters = parseCrmHomeFilters(rawFilters);
  const since = crmPeriodStart(filters.period,now)??null;
  const client = await database.connect();
  try {
    await client.query("begin isolation level repeatable read read only");
    const result = await client.query<SnapshotRow>(`
      with actor as materialized (
        select w.id workspace_id,w.name workspace_name,m.id membership_id,r.code role
          from sessions s join users u on u.id=s.user_id and u.status='active' and u.security_version=s.security_version
          join workspace_memberships m on m.user_id=u.id and m.workspace_id=$3 and m.status='active'
          join roles r on r.id=m.role_id and r.workspace_id=m.workspace_id
          join workspaces w on w.id=m.workspace_id and w.status='active'
         where s.id=$2 and s.user_id=$1 and s.revoked_at is null and s.idle_expires_at>$9 and s.absolute_expires_at>$9
      ), actor_teams as materialized (
        select tm.team_id from team_memberships tm join teams t on t.id=tm.team_id and t.workspace_id=tm.workspace_id and t.status='active'
         join actor a on a.workspace_id=tm.workspace_id and a.membership_id=tm.workspace_membership_id
      ), authorized_leads as materialized (
        select l.* from leads l join actor a on a.workspace_id=l.workspace_id
         where a.role in ('owner','admin') or l.visibility='workspace' or l.owner_membership_id=a.membership_id
            or exists(select 1 from lead_visible_teams lvt join actor_teams at on at.team_id=lvt.team_id where lvt.workspace_id=l.workspace_id and lvt.lead_id=l.id)
      ), filtered_leads as materialized (
        select l.* from authorized_leads l cross join actor a
         where ($4::text is null or l.status=$4)
           and ($5::uuid is null or l.stage_id=$5)
           and ($6::text is null or l.owner_membership_id=case when $6='mine' then a.membership_id else $6::uuid end)
           and ($7::uuid is null or exists(select 1 from lead_visible_teams lvt where lvt.workspace_id=l.workspace_id and lvt.lead_id=l.id and lvt.team_id=$7))
           and ($8::timestamptz is null or l.created_at >= $8)
      ), allowed_teams as materialized (
        select t.id,t.name from teams t cross join actor a where t.workspace_id=a.workspace_id and t.status='active'
          and (a.role in ('owner','admin') or exists(select 1 from actor_teams at where at.team_id=t.id))
      ), stage_options as (
        select distinct ps.id,ps.name,ps.position,ps.status from pipeline_stages ps cross join actor a
         where ps.workspace_id=a.workspace_id and (ps.status='active' or exists(select 1 from authorized_leads l where l.stage_id=ps.id))
      ), owner_options as (
        select distinct m.id,coalesce(nullif(btrim(u.display_name),''),'Workspace member') label
          from workspace_memberships m join users u on u.id=m.user_id cross join actor a
         where m.workspace_id=a.workspace_id and m.status='active' and (m.id=a.membership_id or exists(select 1 from authorized_leads l where l.owner_membership_id=m.id))
      )
      select
        (select json_build_object('id',a.workspace_id,'name',a.workspace_name) from actor a) workspace,
        (select json_build_object('role',a.role,'membershipId',a.membership_id) from actor a) actor,
        json_build_object('visible',(select count(*)::int from filtered_leads),'open',(select count(*)::int from filtered_leads where status='open'),'won',(select count(*)::int from filtered_leads where status='won'),'lost',(select count(*)::int from filtered_leads where status='lost')) summary,
        coalesce((select json_agg(json_build_object('stageId',s.id,'name',s.name,'position',s.position,'archived',s.status='archived','count',(select count(*)::int from filtered_leads l where l.stage_id=s.id)) order by s.position,s.id) from stage_options s),'[]') pipeline,
        coalesce((select json_agg(json_build_object('membershipId',x.id,'displayName',x.label,'count',x.count) order by x.count desc,lower(x.label),x.id) from (select o.id,o.label,count(l.id)::int count from owner_options o join filtered_leads l on l.owner_membership_id=o.id group by o.id,o.label) x),'[]') owners,
        coalesce((select json_agg(json_build_object('teamId',x.id,'name',x.name,'count',x.count) order by x.count desc,lower(x.name),x.id) from (select t.id,t.name,count(distinct l.id)::int count from allowed_teams t join lead_visible_teams lvt on lvt.team_id=t.id and lvt.workspace_id=$3 join filtered_leads l on l.id=lvt.lead_id group by t.id,t.name) x),'[]') teams,
        coalesce((select json_agg(json_build_object('activityId',x.id,'leadId',x.lead_id,'leadLabel',x.lead_label,'kind',x.kind,'body',x.body,'actorLabel',x.actor_label,'occurredAt',x.created_at) order by x.created_at desc,x.id desc) from (select la.id,la.lead_id,concat(l.first_name,' ',l.last_name) lead_label,la.kind,la.body,coalesce(nullif(btrim(u.display_name),''),'Workspace member') actor_label,la.created_at from lead_activities la join filtered_leads l on l.id=la.lead_id and l.workspace_id=la.workspace_id join workspace_memberships m on m.id=la.created_by_membership_id and m.workspace_id=la.workspace_id join users u on u.id=m.user_id order by la.created_at desc,la.id desc limit 10) x),'[]') activities,
        coalesce((select json_agg(json_build_object('id',s.id,'label',s.name,'archived',s.status='archived') order by s.position,s.id) from stage_options s),'[]') stage_options,
        coalesce((select json_agg(json_build_object('id',o.id,'label',o.label) order by lower(o.label),o.id) from owner_options o),'[]') owner_options,
        coalesce((select json_agg(json_build_object('id',t.id,'label',t.name) order by lower(t.name),t.id) from allowed_teams t),'[]') team_options
    `,[identity.userId,identity.sessionId,workspaceId,filters.status==="all"?null:filters.status,filters.stage==="all"?null:filters.stage,filters.owner==="all"?null:filters.owner,filters.team==="all"?null:filters.team,since,now]);
    const row=result.rows[0];
    if(!row?.workspace||!row.actor)throw new CrmHomeError("access_denied",403);
    if(filters.stage!=="all"&&!row.stage_options.some(option=>option.id===filters.stage))throw new CrmHomeError("resource_not_found",404);
    if(filters.owner!=="all"&&filters.owner!=="mine"&&!row.owner_options.some(option=>option.id===filters.owner))throw new CrmHomeError("resource_not_found",404);
    if(filters.team!=="all"&&!row.team_options.some(option=>option.id===filters.team))throw new CrmHomeError("resource_not_found",404);
    await client.query("commit");
    return {source:"live",generatedAt:now.toISOString(),workspace:row.workspace,actor:row.actor,filters,options:{stages:row.stage_options,owners:row.owner_options,teams:row.team_options},summary:row.summary,pipeline:row.pipeline,owners:row.owners,teams:row.teams,recentActivity:row.activities.map(activity=>({...activity,kind:activityLabel(activity.kind),bodyPreview:activityPreview(activity.body),occurredAt:new Date(activity.occurredAt).toISOString()}))};
  } catch(error) {
    await client.query("rollback").catch(()=>undefined);
    if(error instanceof CrmHomeError)throw error;
    throw new CrmHomeError("dashboard_unavailable",500);
  } finally { client.release(); }
}
