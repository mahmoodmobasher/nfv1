import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { companyTransactionParticipant } from "@/backend/modules/companies";
import { lookupActiveActor, workspaceAuthorityParticipant, type TrustedActor } from "@/backend/platform/authorization";
import { LeadIntakeError } from "../../contracts/lead-inquiry-intake.contract";
import { assertLeadPresentationSafe, leadDetailViewV1Schema, leadSummariesViewV1Schema,
  leadSummaryFiltersV1Schema, type LeadDetailViewV1, type LeadSummariesViewV1,
  type LeadSummaryFiltersV1, type LeadSummaryItemV1 } from "../../contracts/lead-presentation.contract";

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
function item(row: Record<string, unknown>, labels: Labels, companies: Map<string, string>): LeadSummaryItemV1 {
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
    capabilities:{canView:true,canEdit:false},nextView:{kind:"lead_detail",leadId} };
}

const selectPresentation=`select l.id "leadId",l.display_name "displayName",l.first_name "firstName",l.last_name "lastName",
 l.email_display "emailDisplay",l.phone "phoneDisplay",l.contact_id "contactId",l.company_id "companyId",l.company "companyName",
 l.owner_membership_id "responsibleMembershipId",l.responsible_team_id "responsibleTeamId",l.status,l.version,
 l.identity_review_status "identityReviewStatus",l.visibility,l.received_at "receivedAt",l.updated_at "updatedAt",
 l.original_source_category "sourceCategory",l.original_source_platform "sourcePlatform",l.original_source_medium "sourceMedium",
 l.original_source_detail "sourceDetail",l.original_campaign_context "campaignContext",l.attribution_contract_version "attributionContractVersion",
 l.intake_channel "intakeChannel",ps.id "stageId",ps.name "stageName",ps.status "stageStatus",
 lifecycle.code "lifecycleCode",lifecycle.label "lifecycleLabel" from leads l
 join pipeline_stages ps on ps.workspace_id=l.workspace_id and ps.id=l.stage_id
 left join lead_lifecycle_definitions lifecycle on lifecycle.id=l.lifecycle_definition_id`;

async function readOnly<T>(pool:Pool,work:(client:PoolClient)=>Promise<T>):Promise<T>{const client=await pool.connect();try{
  await client.query("begin isolation level repeatable read read only");const result=await work(client);await client.query("commit");return result;
}catch(error){await client.query("rollback").catch(()=>undefined);throw error}finally{client.release()}}

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
    const candidates=(await client.query<Record<string,unknown>>(`${selectPresentation} where l.workspace_id=$1
      and ($2::uuid is null or l.stage_id=$2) and ($3='' or position($3 in lower(concat_ws(' ',l.display_name,l.email_display,l.phone,l.company)))>0)
      and ($4::timestamptz is null or (l.updated_at,l.id)<($4::timestamptz,$5::uuid)) order by l.updated_at desc,l.id desc limit 201`,
      [current.workspaceId,filters.stageId??null,filters.q.toLocaleLowerCase("en-US"),cursor?.updatedAt??null,cursor?.leadId??null])).rows;
    const authority=workspaceAuthorityParticipant(client),visible=await authority.visibleLeadIds(current,candidates.map(row=>({id:String(row.leadId),
      visibility:String(row.visibility),ownerMembershipId:row.responsibleMembershipId?String(row.responsibleMembershipId):null})));
    const authorized=candidates.filter(row=>visible.has(String(row.leadId))),hasMore=authorized.length>filters.limit,rows=authorized.slice(0,filters.limit);
    const presentation=await enrich(client,current.workspaceId,rows);await lookupActiveActor(client,actor);
    const items=rows.map(row=>item(row,presentation.labels,presentation.companies)),boundary=items.at(-1);
    return assertLeadPresentationSafe(leadSummariesViewV1Schema,{contractVersion:"listLeadSummaries.v1",requestId,items,
      nextCursor:hasMore&&boundary?encodeCursor({updatedAt:boundary.updatedAt,leadId:boundary.leadId},filters):null})})}

export async function getLeadDetailV1(pool:Pool,actor:TrustedActor,leadId:string,requestId:string=randomUUID()):Promise<LeadDetailViewV1>{
  if(!uuid.safeParse(leadId).success)throw new LeadIntakeError("resource_not_found",404);return readOnly(pool,async client=>{
    const current=await lookupActiveActor(client,actor),row=(await client.query<Record<string,unknown>>(`${selectPresentation} where l.workspace_id=$1 and l.id=$2`,
      [current.workspaceId,leadId])).rows[0];if(!row)throw new LeadIntakeError("resource_not_found",404);
    const authority=workspaceAuthorityParticipant(client),visible=await authority.visibleLeadIds(current,[{id:leadId,visibility:String(row.visibility),
      ownerMembershipId:row.responsibleMembershipId?String(row.responsibleMembershipId):null}]);if(!visible.has(leadId))throw new LeadIntakeError("resource_not_found",404);
    const presentation=await enrich(client,current.workspaceId,[row]);await lookupActiveActor(client,actor);
    return assertLeadPresentationSafe(leadDetailViewV1Schema,{contractVersion:"getLeadDetail.v1",requestId,
      lead:item(row,presentation.labels,presentation.companies)})})}
