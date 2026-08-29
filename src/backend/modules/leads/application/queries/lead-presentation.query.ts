import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { companyTransactionParticipant } from "@/backend/modules/companies";
import { lookupActiveActor, workspaceAuthorityParticipant, WORKSPACE_LEAD_DISCLOSURE_SQL_PREDICATE_V1,
  type TrustedActor } from "@/backend/platform/authorization";
import { LeadIntakeError } from "../../contracts/lead-inquiry-intake.contract";
import { ALLOWED_LEAD_LIFECYCLE_TRANSITIONS, type LeadLifecycleCode } from "../../contracts/lead-lifecycle.contract";
import { assertLeadPresentationSafe, leadDetailViewV1Schema, leadSummariesViewV1Schema,
  leadPipelineStagesViewV1Schema,
  leadSummaryFiltersV1Schema, type LeadDetailViewV1, type LeadSummariesViewV1,
  type LeadPipelineStagesViewV1, type LeadSummaryFiltersV1, type LeadSummaryItemV1 } from "../../contracts/lead-presentation.contract";

type CursorV1 = { v: 1; updatedAt: string; leadId: string; q: string; stageId: string | null };
const uuid = z.string().uuid();

function decodeCursor(value: string | undefined, filters: Pick<LeadSummaryFiltersV1, "q" | "stageId">): CursorV1 | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as CursorV1;
    if (parsed.v !== 1 || !Number.isFinite(Date.parse(parsed.updatedAt)) || !uuid.safeParse(parsed.leadId).success ||
        parsed.q !== filters.q || parsed.stageId !== (filters.stageId ?? null)) throw new Error("invalid");
    return parsed;
  } catch { throw new LeadIntakeError("validation_failed", 400); }
}
function encodeCursor(row: { updatedAt: string; leadId: string }, filters: Pick<LeadSummaryFiltersV1, "q" | "stageId">) {
  return Buffer.from(JSON.stringify({ v: 1, updatedAt: row.updatedAt, leadId: row.leadId,
    q: filters.q, stageId: filters.stageId ?? null })).toString("base64url");
}
function maskEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const [local, domain] = value.split("@"); return local && domain ? `${local[0]}***@${domain}`.slice(0, 320) : null;
}
function maskPhone(value: unknown): string | null {
  if (typeof value !== "string") return null; const digits = value.replace(/\D/g, "");
  return digits.length >= 4 ? `***${digits.slice(-4)}` : null;
}
function safeContext(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const allowed = new Set(["page", "account", "campaign", "ad", "form", "post", "operator_context", "platform_context"]);
  const result: Record<string, string> = {};
  for (const key of Object.keys(value)) { const entry = (value as Record<string, unknown>)[key];
    if (allowed.has(key) && typeof entry === "string" && entry.length >= 1 && entry.length <= 200) result[key] = entry; }
  return result;
}

type Labels = { memberships: Map<string, string>; teams: Map<string, string> };
function item(row: Record<string, unknown>, labels: Labels, companies: Map<string, string>, actor: TrustedActor): LeadSummaryItemV1 {
  const leadId=String(row.leadId),membershipId=row.responsibleMembershipId?String(row.responsibleMembershipId):null;
  const teamId=row.responsibleTeamId?String(row.responsibleTeamId):null,companyId=row.companyId?String(row.companyId):null;
  return { leadId,displayName:String(row.displayName),structuredName:{firstName:row.firstName?String(row.firstName):null,lastName:row.lastName?String(row.lastName):null},
    contact:{contactId:row.contactId?String(row.contactId):null,maskedEmail:maskEmail(row.emailDisplay),maskedPhone:maskPhone(row.phoneDisplay)},
    company:{companyId,displayName:companyId?companies.get(companyId)??null:row.companyName?String(row.companyName):null},
    assignment:{responsibleMembershipId:membershipId,responsibleMembershipLabel:membershipId?labels.memberships.get(membershipId)??null:null,
      responsibleTeamId:teamId,responsibleTeamLabel:teamId?labels.teams.get(teamId)??null:null,isUnassigned:!membershipId&&!teamId},
    lifecycle:{code:row.lifecycleCode?String(row.lifecycleCode):null,label:row.lifecycleLabel?String(row.lifecycleLabel):null,status:row.status as "open"|"won"|"lost"},
    stage:{id:String(row.stageId),name:String(row.stageName),status:row.stageStatus as "active"|"archived"},version:Number(row.version),
    identityReviewStatus:row.identityReviewStatus as LeadSummaryItemV1["identityReviewStatus"],visibility:row.visibility as "workspace"|"teams",
    receivedAt:new Date(String(row.receivedAt)).toISOString(),updatedAt:new Date(String(row.updatedAt)).toISOString(),originalAttribution:{
      sourceCategory:row.sourceCategory as LeadSummaryItemV1["originalAttribution"]["sourceCategory"],
      sourcePlatform:row.sourcePlatform?row.sourcePlatform as LeadSummaryItemV1["originalAttribution"]["sourcePlatform"]:null,
      sourceMedium:row.sourceMedium as LeadSummaryItemV1["originalAttribution"]["sourceMedium"],sourceDetail:safeContext(row.sourceDetail),
      campaignContext:safeContext(row.campaignContext),attributionContractVersion:String(row.attributionContractVersion),
      intakeChannel:row.intakeChannel as LeadSummaryItemV1["originalAttribution"]["intakeChannel"]},
    capabilities:{canView:true,canEdit:false,canEditLead:actor.role==="owner"||actor.role==="admin",
      canMoveStage:actor.role==="owner"||actor.role==="admin"||membershipId===actor.membershipId,canReview:row.identityReviewStatus==="pending"&&
      (actor.role==="owner"||actor.role==="admin"||membershipId===actor.membershipId)},
    nextView:row.identityReviewStatus==="pending"&&(actor.role==="owner"||actor.role==="admin"||membershipId===actor.membershipId)
      ?{kind:"identity_review_detail",leadId}:{kind:"lead_detail",leadId} };
}

export const LEAD_PRESENTATION_SELECT_SQL_V1=`select l.id "leadId",l.display_name "displayName",l.first_name "firstName",l.last_name "lastName",
 l.email_display "emailDisplay",l.phone "phoneDisplay",l.contact_id "contactId",l.company_id "companyId",l.company "companyName",
 l.owner_membership_id "responsibleMembershipId",l.responsible_team_id "responsibleTeamId",l.status,l.version,
 l.identity_review_status "identityReviewStatus",l.visibility,l.received_at "receivedAt",l.updated_at "updatedAt",
 l.updated_at::text "cursorUpdatedAt",
 l.original_source_category "sourceCategory",l.original_source_platform "sourcePlatform",l.original_source_medium "sourceMedium",
 l.original_source_detail "sourceDetail",l.original_campaign_context "campaignContext",l.attribution_contract_version "attributionContractVersion",
 l.intake_channel "intakeChannel",ps.id "stageId",ps.name "stageName",ps.status "stageStatus",
 lifecycle.code "lifecycleCode",lifecycle.label "lifecycleLabel" from leads l
 join pipeline_stages ps on ps.workspace_id=l.workspace_id and ps.id=l.stage_id
 left join lead_lifecycle_definitions lifecycle on lifecycle.id=l.lifecycle_definition_id`;
export const LEAD_PRESENTATION_LIST_SQL_V1=`${LEAD_PRESENTATION_SELECT_SQL_V1} where l.workspace_id=$1
  and ($2::uuid is null or l.stage_id=$2) and ($3='' or position($3 in lower(concat_ws(' ',l.display_name,l.email_display,l.phone,l.company)))>0)
  and ($4::timestamptz is null or (l.updated_at,l.id)<($4::timestamptz,$5::uuid))
  and ${WORKSPACE_LEAD_DISCLOSURE_SQL_PREDICATE_V1} order by l.updated_at desc,l.id desc limit $6`;
export const LEAD_PRESENTATION_DETAIL_SQL_V1=`${LEAD_PRESENTATION_SELECT_SQL_V1} where l.workspace_id=$1 and l.id=$2`;
export const LEAD_PIPELINE_STAGES_SQL_V1=`select id "stageId",name,position,status from pipeline_stages
  where workspace_id=$1 and status='active' order by position,id limit 101`;

async function readOnly<T>(pool:Pool,work:(client:PoolClient)=>Promise<T>):Promise<T>{const client=await pool.connect();try{
  await client.query("begin isolation level repeatable read read only");const result=await work(client);await client.query("commit");return result;
}catch(error){await client.query("rollback").catch(()=>undefined);throw error}finally{client.release()}}

type DisclosureSnapshot = { leadId:string;version:number;updatedAt:string;visibility:string;
  responsibleMembershipId:string|null;responsibleTeamId:string|null };
function disclosureSnapshot(row:Record<string,unknown>):DisclosureSnapshot{return{leadId:String(row.leadId),version:Number(row.version),
  updatedAt:String(row.cursorUpdatedAt),visibility:String(row.visibility),
  responsibleMembershipId:row.responsibleMembershipId?String(row.responsibleMembershipId):null,
  responsibleTeamId:row.responsibleTeamId?String(row.responsibleTeamId):null}}
function sameDisclosure(left:DisclosureSnapshot,right:DisclosureSnapshot){return left.leadId===right.leadId&&left.version===right.version&&
  left.updatedAt===right.updatedAt&&left.visibility===right.visibility&&left.responsibleMembershipId===right.responsibleMembershipId&&
  left.responsibleTeamId===right.responsibleTeamId}

type RevalidatedDisclosure = { actor:TrustedActor; rows:Map<string,Record<string,unknown>>; presentation:{labels:Labels;
  companies:Map<string,string>} };
async function revalidateCurrentDisclosure(pool:Pool,actor:TrustedActor,expected:DisclosureSnapshot[]):Promise<RevalidatedDisclosure>{
  if(!expected.length)return readOnly(pool,async client=>({actor:await lookupActiveActor(client,actor),rows:new Map(),
    presentation:{labels:{memberships:new Map(),teams:new Map()},companies:new Map()}}));
  return readOnly(pool,async client=>{const current=await lookupActiveActor(client,actor),ids=expected.map(row=>row.leadId);
    const rows=(await client.query<Record<string,unknown>>(`${LEAD_PRESENTATION_SELECT_SQL_V1} where l.workspace_id=$1 and l.id=any($2::uuid[])
      order by l.id`,[current.workspaceId,[...ids].sort()])).rows;
    const actual=new Map(rows.map(row=>{const snapshot=disclosureSnapshot(row);return[snapshot.leadId,snapshot]}));
    if(expected.some(snapshot=>{const currentSnapshot=actual.get(snapshot.leadId);return!currentSnapshot||!sameDisclosure(snapshot,currentSnapshot)}))
      throw new LeadIntakeError("resource_not_found",404);
    const visible=await workspaceAuthorityParticipant(client).visibleLeadIds(current,rows.map(row=>({id:String(row.leadId),
      visibility:String(row.visibility),ownerMembershipId:row.responsibleMembershipId?String(row.responsibleMembershipId):null})));
    if(expected.some(snapshot=>!visible.has(snapshot.leadId)))throw new LeadIntakeError("resource_not_found",404);
    return{actor:current,rows:new Map(rows.map(row=>[String(row.leadId),row])),presentation:await enrich(client,current.workspaceId,rows)};
  });
}

export function parseLeadSummaryFiltersV1(url:URL):LeadSummaryFiltersV1{const allowed=new Set(["q","stageId","limit","cursor"]),keys=[...url.searchParams.keys()];
  if(keys.some(key=>!allowed.has(key))||[...allowed].some(key=>url.searchParams.getAll(key).length>1))throw new LeadIntakeError("validation_failed",400);
  const parsed=leadSummaryFiltersV1Schema.safeParse({q:url.searchParams.get("q")??"",stageId:url.searchParams.get("stageId")??undefined,
    limit:url.searchParams.has("limit")?Number(url.searchParams.get("limit")):50,cursor:url.searchParams.get("cursor")??undefined});
  if(!parsed.success)throw new LeadIntakeError("validation_failed",400,{fields:parsed.error.issues.map(issue=>issue.path.join("."))});
  decodeCursor(parsed.data.cursor,parsed.data);return parsed.data}

async function enrich(client:PoolClient,workspaceId:string,rows:Array<Record<string,unknown>>){const authority=workspaceAuthorityParticipant(client);
  const labels=await authority.presentAssignments(workspaceId,rows.flatMap(row=>row.responsibleMembershipId?[String(row.responsibleMembershipId)]:[]),
    rows.flatMap(row=>row.responsibleTeamId?[String(row.responsibleTeamId)]:[]));
  const companyRows=await companyTransactionParticipant(client).present(workspaceId,rows.flatMap(row=>row.companyId?[String(row.companyId)]:[]));
  return{labels,companies:new Map(companyRows.map(row=>[String(row.id),String(row.displayName)]))}}

export async function listLeadSummariesV1(pool:Pool,actor:TrustedActor,rawFilters:LeadSummaryFiltersV1,
  requestId:string=randomUUID()):Promise<LeadSummariesViewV1>{const filters=leadSummaryFiltersV1Schema.parse(rawFilters),cursor=decodeCursor(filters.cursor,filters);
  return readOnly(pool,async client=>{const current=await lookupActiveActor(client,actor);
    const authorized=(await client.query<Record<string,unknown>>(LEAD_PRESENTATION_LIST_SQL_V1,
      [current.workspaceId,filters.stageId??null,filters.q.toLocaleLowerCase("en-US"),cursor?.updatedAt??null,
        cursor?.leadId??null,filters.limit+1,current.role,current.membershipId])).rows;
    const hasMore=authorized.length>filters.limit,rows=authorized.slice(0,filters.limit);
    await lookupActiveActor(client,actor);const fresh=await revalidateCurrentDisclosure(pool,current,rows.map(disclosureSnapshot));
    const currentRows=rows.map(row=>fresh.rows.get(String(row.leadId))!);
    const items=currentRows.map(row=>item(row,fresh.presentation.labels,fresh.presentation.companies,fresh.actor)),lastReturned=rows.at(-1),boundary=hasMore&&lastReturned
      ?disclosureSnapshot(lastReturned):null;
    const result=assertLeadPresentationSafe(leadSummariesViewV1Schema,{contractVersion:"listLeadSummaries.v1",requestId,items,
      nextCursor:hasMore&&boundary?encodeCursor(boundary,filters):null});
    return result})}

const LIFECYCLE_LABELS:Record<string,string>={new:"Mark as new",working:"Start working",qualified:"Mark qualified",
  disqualified:"Disqualify",converted:"Convert"};

/**
 * The legal moves for THIS actor from THIS state. Mirrors the orchestrator's rules:
 * the map decides what may follow what; owner/admin may make any legal move; a Member
 * may act only on a Lead they own; reopening a disqualified Lead is owner/admin only;
 * `converted` belongs to the conversion orchestrator and is never offered here.
 */
function lifecycleTransitionOptions(lead:LeadSummaryItemV1,actor:TrustedActor){
  const from=lead.lifecycle.code;
  if(!from||!(from in ALLOWED_LEAD_LIFECYCLE_TRANSITIONS))return [];
  const privileged=actor.role==="owner"||actor.role==="admin";
  if(from==="disqualified"&&!privileged)return [];
  if(!privileged&&lead.assignment.responsibleMembershipId!==actor.membershipId)return [];
  const unassigned=!lead.assignment.responsibleMembershipId;
  return ALLOWED_LEAD_LIFECYCLE_TRANSITIONS[from as LeadLifecycleCode]
    .filter(to=>to!=="converted")
    .filter(to=>!(unassigned&&(to==="working"||to==="qualified")))
    .map(to=>({to,label:LIFECYCLE_LABELS[to]??to,requiresReason:to==="disqualified"}));
}

export async function getLeadDetailV1(pool:Pool,actor:TrustedActor,leadId:string,requestId:string=randomUUID()):Promise<LeadDetailViewV1>{
  if(!uuid.safeParse(leadId).success)throw new LeadIntakeError("resource_not_found",404);return readOnly(pool,async client=>{
    const current=await lookupActiveActor(client,actor),row=(await client.query<Record<string,unknown>>(LEAD_PRESENTATION_DETAIL_SQL_V1,
      [current.workspaceId,leadId])).rows[0];if(!row)throw new LeadIntakeError("resource_not_found",404);
    const authority=workspaceAuthorityParticipant(client),visible=await authority.visibleLeadIds(current,[{id:leadId,visibility:String(row.visibility),
      ownerMembershipId:row.responsibleMembershipId?String(row.responsibleMembershipId):null}]);if(!visible.has(leadId))throw new LeadIntakeError("resource_not_found",404);
    await lookupActiveActor(client,actor);const fresh=await revalidateCurrentDisclosure(pool,current,[disclosureSnapshot(row)]);
    const lead=item(fresh.rows.get(leadId)!,fresh.presentation.labels,fresh.presentation.companies,fresh.actor);
    const result=assertLeadPresentationSafe(leadDetailViewV1Schema,{contractVersion:"getLeadDetail.v1",requestId,
      lead,lifecycleTransitions:lifecycleTransitionOptions(lead,fresh.actor)});return result})}

export async function listLeadPipelineStagesV1(pool:Pool,actor:TrustedActor,
  requestId:string=randomUUID()):Promise<LeadPipelineStagesViewV1>{const result=await readOnly(pool,async client=>{
    const current=await lookupActiveActor(client,actor),rows=(await client.query<{stageId:string;name:string;position:number;status:"active"}>(
      LEAD_PIPELINE_STAGES_SQL_V1,[current.workspaceId])).rows;
    if(rows.length>100)throw new LeadIntakeError("validation_failed",400);
    return leadPipelineStagesViewV1Schema.parse({contractVersion:"listLeadPipelineStages.v1",requestId,items:rows});
  });await revalidateCurrentDisclosure(pool,actor,[]);return result}

export async function assertLegacyLeadPatchAllowedV1(pool:Pool,actor:TrustedActor,leadId:string):Promise<void>{
  if(!uuid.safeParse(leadId).success)throw new LeadIntakeError("resource_not_found",404);
  await readOnly(pool,async client=>{const current=await lookupActiveActor(client,actor),row=(await client.query<{id:string}>(
    `select l.id from leads l where l.workspace_id=$1 and l.id=$2 and not exists
      (select 1 from lead_intakes intake where intake.workspace_id=l.workspace_id and intake.lead_id=l.id)`,
    [current.workspaceId,leadId])).rows[0];
    if(!row)throw new LeadIntakeError("resource_not_found",404);
    await lookupActiveActor(client,actor);
  });
}
