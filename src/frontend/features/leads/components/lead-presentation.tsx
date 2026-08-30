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
function outcomeLabel(lead: LeadSummaryItem) {
  if (lead.lifecycle.status === "open") return "Not yet settled";
  const source = lead.lifecycle.statusSource === "manual" ? "manual override" : "automatic";
  return `${lead.lifecycle.status === "won" ? "Won" : "Lost"} — ${source}`;
}
function LeadActions({ lead, compact = false, management }: { lead: LeadSummaryItem; compact?: boolean; management?: { workspaceId: string; stages: LeadPipelineStage[] } }) {
  const actions = <><ActionLink variant="tertiary" href={`/crm/leads/${lead.leadId}`}>View lead</ActionLink>{lead.capabilities.canEditLead && <ActionLink variant="tertiary" href={`/crm/leads/${lead.leadId}/edit`}>Edit lead</ActionLink>}{management && lead.capabilities.canMoveStage && <LeadStageMove workspaceId={management.workspaceId} leadId={lead.leadId} leadName={lead.displayName} version={lead.version} currentStageId={lead.stage.id} currentStageName={lead.stage.name} stages={management.stages} focusDestinationOnSuccess/>}{lead.capabilities.canReview && lead.nextView.kind === "identity_review_detail" && <ActionLink variant={compact ? "tertiary" : "primary"} href={`/crm/identity-reviews/${lead.leadId}`}>{compact ? "Review identity" : "Continue review"}</ActionLink>}</>;
  return <div className="flex flex-wrap items-center gap-2">{compact ? <ActionMenu label={`Actions for ${lead.displayName}`}>{actions}</ActionMenu> : actions}</div>;
}

export function LeadSummaryCard({ lead, management }: { lead: LeadSummaryItem; management?: { workspaceId: string; stages: LeadPipelineStage[] } }) {
  return <article className="grid gap-2 rounded-card border border-line bg-surface p-3" data-lead-id={lead.leadId}><div className="flex flex-wrap items-center gap-2"><StatusBadge tone={lifecycleTone(lead.lifecycle.status)}>{lead.lifecycle.label ?? lead.lifecycle.status}</StatusBadge></div><h3><Link href={`/crm/leads/${lead.leadId}`}>{lead.displayName}</Link></h3><p>{lead.company.displayName ?? "No company"}</p><p>{leadContactLabel(lead)}</p><small>{leadAssignmentLabel(lead)} · {reviewLabel(lead.identityReviewStatus)}</small><LeadActions lead={lead} compact management={management}/></article>;
}

export function LeadList({ view, q, stageId }: { view: LeadSummariesView; q: string; stageId?: string }) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (stageId) params.set("stageId", stageId);
  const scope = [q ? `Search: “${q}”` : null, stageId ? "Stage filter active" : null].filter(Boolean).join(" · ");
  return <section className="grid gap-3" aria-label="Visible leads"><div className="rounded-card border border-line bg-surface-muted p-3 text-xs text-ink-muted" role="status" aria-live="polite"><div><strong>{view.items.length} loaded {view.items.length === 1 ? "lead" : "leads"}</strong><p>{scope || "Current authorized Lead page"}. Stage, responsibility, and review values are server-produced.</p></div></div>{view.items.length === 0 ? <EmptyState title={q || stageId ? "No matching leads" : "No leads yet"}><p>{q || stageId ? "Clear the filters or try a different search." : "Add a lead to begin tracking customer work."}</p></EmptyState> : <><DataTable caption="Loaded leads"><thead><tr><th scope="col">Lead</th><th scope="col">Contact</th><th scope="col">Company</th><th scope="col">Responsibility</th><th scope="col">Review</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead><tbody>{view.items.map(lead => <tr key={lead.leadId}><th scope="row"><Link href={`/crm/leads/${lead.leadId}`}>{lead.displayName}</Link><span className="mt-1 block"><StatusBadge tone={lifecycleTone(lead.lifecycle.status)}>{lead.lifecycle.label ?? lead.lifecycle.status}</StatusBadge></span></th><td>{leadContactLabel(lead)}</td><td>{lead.company.displayName ?? "No company"}</td><td>{leadAssignmentLabel(lead)}</td><td>{reviewLabel(lead.identityReviewStatus)}</td><td><LeadActions lead={lead} compact /></td></tr>)}</tbody></DataTable><RecordCards label="Loaded leads">{view.items.map(lead => <RecordCard key={lead.leadId} title={lead.displayName} href={`/crm/leads/${lead.leadId}`} secondary={leadContactLabel(lead)} facts={[{label:"Lifecycle",value:<StatusBadge tone={lifecycleTone(lead.lifecycle.status)}>{lead.lifecycle.label ?? lead.lifecycle.status}</StatusBadge>},{label:"Company",value:lead.company.displayName ?? "No company"},{label:"Responsibility",value:leadAssignmentLabel(lead)},{label:"Review",value:reviewLabel(lead.identityReviewStatus)}]} actions={<LeadActions lead={lead} compact/>}/>)}</RecordCards></>}{view.nextCursor && <div className="mt-4 flex flex-wrap justify-end gap-2"><ActionLink href={`/crm?${new URLSearchParams([...params, ["cursor", view.nextCursor]]).toString()}`}>Next page</ActionLink></div>}</section>;
}

export function LeadPipeline({ stages, workspaceId }: { stages: Array<{ stage: LeadPipelineStage; view: LeadSummariesView }>; workspaceId?: string }) {
  const total = stages.reduce((count, item) => count + item.view.items.length, 0);
  const registry = stages.map(item => item.stage);
  return <section className="flex min-w-0 gap-3 overflow-x-auto pb-3" aria-labelledby="pipeline-board-title"><h2 id="pipeline-board-title" className="sr-only">Pipeline board</h2><p role="status">{total} {total === 1 ? "lead" : "leads"} shown across {stages.length} stages.</p><div className="grid gap-4 overflow-x-auto pb-2 lg:grid-flow-col lg:auto-cols-[minmax(18rem,1fr)]">{stages.map(({ stage, view }, index) => <StageColumn key={stage.stageId} id={`stage-${stage.stageId}`} tone="neutral" position={index + 1} title={stage.name} count={`${view.items.length} ${view.items.length === 1 ? "lead" : "leads"}`}>{view.items.length === 0 ? <p className="rounded-control border border-dashed border-control p-3 text-xs text-ink-muted">No leads in this stage.</p> : <div className="grid gap-3">{view.items.map(lead => <LeadSummaryCard key={lead.leadId} lead={lead} management={workspaceId ? {workspaceId,stages:registry} : undefined}/>)}</div>}</StageColumn>)}</div></section>;
}

export function LeadReadOnlyDetail({ lead, workspaceId, stages = [] }: { lead: LeadSummaryItem; workspaceId?: string; stages?: LeadPipelineStage[] }) {
  const contact = [["Contact", leadContactLabel(lead)], ["Company", lead.company.displayName ?? "No company provided"], ["Responsibility", leadAssignmentLabel(lead)]];
  const lifecycleFacts = [["Lifecycle", lead.lifecycle.label ?? lead.lifecycle.status], ["Identity review", reviewLabel(lead.identityReviewStatus)], ["Outcome", outcomeLabel(lead)]];
  const attribution = [["Source", sourceLabel(lead)], ["Source medium", lead.originalAttribution.sourceMedium], ["Intake channel", intakeLabels[lead.originalAttribution.intakeChannel]], ["Received", new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(lead.receivedAt))]];
  const facts = (items: string[][]) => <FactsGrid>{items.map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}</FactsGrid>;
  const detailActions = <div className="flex flex-wrap items-center gap-2"><ActionLink href="/crm">Back to leads</ActionLink><ActionLink href="/crm/pipeline">View pipeline</ActionLink>{lead.capabilities.canEditLead && <ActionLink variant="primary" href={`/crm/leads/${lead.leadId}/edit`}>Edit lead</ActionLink>}{workspaceId && lead.capabilities.canMoveStage && <LeadStageMove workspaceId={workspaceId} leadId={lead.leadId} leadName={lead.displayName} version={lead.version} currentStageId={lead.stage.id} currentStageName={lead.stage.name} stages={stages}/>} {lead.capabilities.canReview && lead.nextView.kind === "identity_review_detail" && <ActionLink variant="primary" href={`/crm/identity-reviews/${lead.leadId}`}>Continue identity review</ActionLink>}</div>;
  const summary = <><RecordIdentity marker={lead.displayName.split(/\s+/).slice(0,2).map(value => value[0]).join("").toUpperCase()} title={lead.displayName} secondary={leadContactLabel(lead)} meta={<span className="grid gap-1 rounded-control border border-line bg-surface-muted p-3"><span className="text-[10.5px] font-bold uppercase tracking-[.08em] text-ink-faint">Lifecycle</span><span className="font-semibold text-ink"><StatusBadge tone={lifecycleTone(lead.lifecycle.status)}>{lead.lifecycle.label ?? lead.lifecycle.status}</StatusBadge></span></span>}/><div className="grid gap-2 [&_div]:grid [&_div]:grid-cols-[minmax(8rem,auto)_1fr] [&_div]:gap-3 [&_dt]:text-ink-muted [&_dd]:m-0 [&_dd]:font-semibold [&_dd]:text-ink"><RelationshipRow label="Company" value={lead.company.displayName ?? "No company provided"}/><RelationshipRow label="Responsibility" value={leadAssignmentLabel(lead)}/><RelationshipRow label="Identity review" value={reviewLabel(lead.identityReviewStatus)}/></div></>;
  return <><ProductPageHeader context="Leads / Details" title={lead.displayName} description={<p>Confirmed Lead information. Identity, attribution and lifecycle values remain protected from ordinary editing.</p>}/><RecordWorkspace summary={summary}><ContentTabs label="Lead detail sections" items={[{href:"#lead-overview",label:"Overview",active:true},{href:"#lead-conversion",label:"Conversion"},{href:"#lead-activity",label:"Activity"}]}/><div id="lead-overview" className="grid gap-4"><Panel title="Contact and Company" description="Optional information is shown only when present.">{facts(contact)}</Panel><Panel title="Lifecycle status">{facts(lifecycleFacts)}</Panel><Panel title="Original attribution" description="Source and intake channel remain separate and read-only.">{facts(attribution)}</Panel>{detailActions}</div></RecordWorkspace></>;
}

export function LeadPresentationUnavailable({ detail = false }: { detail?: boolean }) {
  return <FeedbackState tone="danger" autoFocus title={detail ? "Lead unavailable" : "Leads are temporarily unavailable"} action={<ActionLink href="/crm">Return to leads</ActionLink>}><p>No protected Lead information is shown. Try again safely.</p></FeedbackState>;
}
