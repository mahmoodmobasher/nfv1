import Link from "next/link";
import { ActionLink, ActionMenu, ContentTabs, DataTable, EmptyState, FactsGrid, FeedbackState, Panel, ProductPageHeader, RecordCard, RecordCards, RecordIdentity, RecordWorkspace, RelationshipRow, StageColumn, StatusBadge } from "@/frontend/design-system";
import type { LeadPipelineStage, LeadSummariesView, LeadSummaryItem } from "@/frontend/shared/contracts/p1a-transport";
import { LeadStageMove } from "./lead-management";

const sourceLabels: Record<LeadSummaryItem["originalAttribution"]["sourceCategory"], string> = {
  website: "Website", referral: "Referral", outbound: "Outbound", event: "Event", partner: "Partner",
  social_media: "Social media", import: "Import", manual: "Manual", other: "Other",
};
const platformLabels: Record<NonNullable<LeadSummaryItem["originalAttribution"]["sourcePlatform"]>, string> = {
  tiktok: "TikTok", instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn", x: "X",
  youtube: "YouTube", other_social: "Other social",
};
const intakeLabels: Record<LeadSummaryItem["originalAttribution"]["intakeChannel"], string> = {
  web_form: "Web form", manual: "Manual", csv: "CSV", spreadsheet: "Spreadsheet",
  future_api: "API", future_integration: "Integration",
};

export function leadContactLabel(lead: LeadSummaryItem) {
  return lead.contact.maskedEmail ?? lead.contact.maskedPhone ?? "Not provided";
}
export function leadAssignmentLabel(lead: LeadSummaryItem) {
  if (lead.assignment.isUnassigned) return "Unassigned";
  return [lead.assignment.responsibleMembershipLabel, lead.assignment.responsibleTeamLabel].filter(Boolean).join(" · ") || "Assigned";
}
function sourceLabel(lead: LeadSummaryItem) {
  const source = sourceLabels[lead.originalAttribution.sourceCategory];
  const platform = lead.originalAttribution.sourcePlatform ? platformLabels[lead.originalAttribution.sourcePlatform] : null;
  return platform ? `${source} · ${platform}` : source;
}
function reviewLabel(status: LeadSummaryItem["identityReviewStatus"]) {
  return status === "pending" ? "Pending review" : status === "resolved" ? "Resolved" : "Not required";
}
function lifecycleTone(status: LeadSummaryItem["lifecycle"]["status"]) {
  return status === "won" ? "success" : status === "lost" ? "danger" : "accent";
}
function LeadActions({ lead, compact = false, management }: { lead: LeadSummaryItem; compact?: boolean; management?: { workspaceId: string; stages: LeadPipelineStage[] } }) {
  const actions = <><ActionLink variant="tertiary" href={`/crm/leads/${lead.leadId}`}>View lead</ActionLink>{lead.capabilities.canEditLead && <ActionLink variant="tertiary" href={`/crm/leads/${lead.leadId}/edit`}>Edit lead</ActionLink>}{management && lead.capabilities.canMoveStage && <LeadStageMove workspaceId={management.workspaceId} leadId={lead.leadId} leadName={lead.displayName} version={lead.version} currentStageId={lead.stage.id} currentStageName={lead.stage.name} stages={management.stages} focusDestinationOnSuccess/>}{lead.capabilities.canReview && lead.nextView.kind === "identity_review_detail" && <ActionLink variant={compact ? "tertiary" : "primary"} href={`/crm/identity-reviews/${lead.leadId}`}>{compact ? "Review identity" : "Continue review"}</ActionLink>}</>;
  return <div className="ds-lead-actions">{compact ? <ActionMenu label={`Actions for ${lead.displayName}`}>{actions}</ActionMenu> : actions}</div>;
}

export function LeadSummaryCard({ lead, management }: { lead: LeadSummaryItem; management?: { workspaceId: string; stages: LeadPipelineStage[] } }) {
  return <article className="ds-lead-card" data-lead-id={lead.leadId}><div className="ds-lead-card__meta"><StatusBadge tone={lifecycleTone(lead.lifecycle.status)}>{lead.lifecycle.label ?? lead.lifecycle.status}</StatusBadge><span>{lead.stage.name}</span></div><h3><Link href={`/crm/leads/${lead.leadId}`}>{lead.displayName}</Link></h3><p>{lead.company.displayName ?? "No company"}</p><p>{leadContactLabel(lead)}</p><small>{leadAssignmentLabel(lead)} · {reviewLabel(lead.identityReviewStatus)}</small><LeadActions lead={lead} compact management={management}/></article>;
}

export function LeadList({ view, q, stageId }: { view: LeadSummariesView; q: string; stageId?: string }) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (stageId) params.set("stageId", stageId);
  const scope = [q ? `Search: “${q}”` : null, stageId ? "Stage filter active" : null].filter(Boolean).join(" · ");
  return <section className="ds-lead-list ds-responsive-record-list" aria-label="Visible leads"><div className="ds-list-context" role="status" aria-live="polite"><div><strong>{view.items.length} loaded {view.items.length === 1 ? "lead" : "leads"}</strong><p>{scope || "Current authorized Lead page"}. Stage, responsibility, and review values are server-produced.</p></div></div>{view.items.length === 0 ? <EmptyState title={q || stageId ? "No matching leads" : "No leads yet"}><p>{q || stageId ? "Clear the filters or try a different search." : "Add a lead to begin tracking customer work."}</p></EmptyState> : <><DataTable caption="Loaded leads"><thead><tr><th scope="col">Lead</th><th scope="col">Contact</th><th scope="col">Company</th><th scope="col">Stage</th><th scope="col">Responsibility</th><th scope="col">Review</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead><tbody>{view.items.map(lead => <tr key={lead.leadId}><th scope="row"><Link href={`/crm/leads/${lead.leadId}`}>{lead.displayName}</Link><StatusBadge tone={lifecycleTone(lead.lifecycle.status)}>{lead.lifecycle.label ?? lead.lifecycle.status}</StatusBadge></th><td>{leadContactLabel(lead)}</td><td>{lead.company.displayName ?? "No company"}</td><td><StatusBadge>{lead.stage.name}</StatusBadge></td><td>{leadAssignmentLabel(lead)}</td><td>{reviewLabel(lead.identityReviewStatus)}</td><td><LeadActions lead={lead} compact /></td></tr>)}</tbody></DataTable><RecordCards label="Loaded leads">{view.items.map(lead => <RecordCard key={lead.leadId} title={lead.displayName} href={`/crm/leads/${lead.leadId}`} secondary={leadContactLabel(lead)} facts={[{label:"Lifecycle",value:<StatusBadge tone={lifecycleTone(lead.lifecycle.status)}>{lead.lifecycle.label ?? lead.lifecycle.status}</StatusBadge>},{label:"Company",value:lead.company.displayName ?? "No company"},{label:"Stage",value:<StatusBadge>{lead.stage.name}</StatusBadge>},{label:"Responsibility",value:leadAssignmentLabel(lead)},{label:"Review",value:reviewLabel(lead.identityReviewStatus)}]} actions={<LeadActions lead={lead} compact/>}/>)}</RecordCards></>}{view.nextCursor && <div className="ds-pagination"><ActionLink href={`/crm?${new URLSearchParams([...params, ["cursor", view.nextCursor]]).toString()}`}>Next page</ActionLink></div>}</section>;
}

export function LeadPipeline({ stages, workspaceId }: { stages: Array<{ stage: LeadPipelineStage; view: LeadSummariesView }>; workspaceId?: string }) {
  const total = stages.reduce((count, item) => count + item.view.items.length, 0);
  const registry = stages.map(item => item.stage);
  return <section className="ds-pipeline" aria-labelledby="pipeline-board-title"><h2 id="pipeline-board-title" className="sr-only">Pipeline board</h2><p role="status">{total} {total === 1 ? "lead" : "leads"} shown across {stages.length} stages.</p><div className="pipeline-board">{stages.map(({ stage, view }) => <StageColumn key={stage.stageId} id={`stage-${stage.stageId}`} tone="neutral" title={stage.name} count={`${view.items.length} ${view.items.length === 1 ? "lead" : "leads"}`}>{view.items.length === 0 ? <p className="helper pipeline-empty-stage">No leads in this stage.</p> : <div className="ds-pipeline__cards">{view.items.map(lead => <LeadSummaryCard key={lead.leadId} lead={lead} management={workspaceId ? {workspaceId,stages:registry} : undefined}/>)}</div>}</StageColumn>)}</div></section>;
}

export function LeadReadOnlyDetail({ lead, workspaceId, stages = [] }: { lead: LeadSummaryItem; workspaceId?: string; stages?: LeadPipelineStage[] }) {
  const contact = [["Contact", leadContactLabel(lead)], ["Company", lead.company.displayName ?? "No company provided"], ["Responsibility", leadAssignmentLabel(lead)]];
  const pipeline = [["Lifecycle", lead.lifecycle.label ?? lead.lifecycle.status], ["Pipeline stage", lead.stage.name], ["Identity review", reviewLabel(lead.identityReviewStatus)]];
  const attribution = [["Source", sourceLabel(lead)], ["Source medium", lead.originalAttribution.sourceMedium], ["Intake channel", intakeLabels[lead.originalAttribution.intakeChannel]], ["Received", new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(lead.receivedAt))]];
  const facts = (items: string[][]) => <FactsGrid>{items.map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}</FactsGrid>;
  const detailActions = <div className="ds-page-actions"><ActionLink href="/crm">Back to leads</ActionLink><ActionLink href="/crm/pipeline">View pipeline</ActionLink>{lead.capabilities.canEditLead && <ActionLink variant="primary" href={`/crm/leads/${lead.leadId}/edit`}>Edit lead</ActionLink>}{workspaceId && lead.capabilities.canMoveStage && <LeadStageMove workspaceId={workspaceId} leadId={lead.leadId} leadName={lead.displayName} version={lead.version} currentStageId={lead.stage.id} currentStageName={lead.stage.name} stages={stages}/>} {lead.capabilities.canReview && lead.nextView.kind === "identity_review_detail" && <ActionLink variant="primary" href={`/crm/identity-reviews/${lead.leadId}`}>Continue identity review</ActionLink>}</div>;
  const summary = <><RecordIdentity marker={lead.displayName.split(/\s+/).slice(0,2).map(value => value[0]).join("").toUpperCase()} title={lead.displayName} secondary={leadContactLabel(lead)} meta={<StatusBadge tone={lifecycleTone(lead.lifecycle.status)}>{lead.lifecycle.label ?? lead.lifecycle.status}</StatusBadge>}/><div className="ds-fact-list"><RelationshipRow label="Company" value={lead.company.displayName ?? "No company provided"}/><RelationshipRow label="Stage" value={lead.stage.name}/><RelationshipRow label="Responsibility" value={leadAssignmentLabel(lead)}/><RelationshipRow label="Identity review" value={reviewLabel(lead.identityReviewStatus)}/></div></>;
  return <><ProductPageHeader context="Leads / Details" title={lead.displayName} description={<p>Confirmed Lead information. Identity, attribution and lifecycle values remain protected from ordinary editing.</p>}/><RecordWorkspace summary={summary}><ContentTabs label="Lead detail sections" items={[{href:"#lead-overview",label:"Overview",active:true},{href:"#lead-conversion",label:"Conversion"},{href:"#lead-activity",label:"Activity"}]}/><div id="lead-overview" className="ds-record-workspace__section"><Panel title="Contact and Company" description="Optional information is shown only when present.">{facts(contact)}</Panel><Panel title="Pipeline and responsibility">{facts(pipeline)}</Panel><Panel title="Original attribution" description="Source and intake channel remain separate and read-only.">{facts(attribution)}</Panel>{detailActions}</div></RecordWorkspace></>;
}

export function LeadPresentationUnavailable({ detail = false }: { detail?: boolean }) {
  return <FeedbackState tone="danger" autoFocus title={detail ? "Lead unavailable" : "Leads are temporarily unavailable"} action={<ActionLink href="/crm">Return to leads</ActionLink>}><p>No protected Lead information is shown. Try again safely.</p></FeedbackState>;
}
