import Link from "next/link";
import type { LeadPipelineStage, LeadSummariesView, LeadSummaryItem } from "@/frontend/shared/contracts/p1a-transport";

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
  return lead.contact.maskedEmail ?? lead.contact.maskedPhone ?? "Contact details not provided";
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
  return status === "pending" ? "Pending identity review" : status === "resolved" ? "Identity review resolved" : "No identity review required";
}
function LeadActions({ lead }: { lead: LeadSummaryItem }) {
  return <div className="row-actions p1a-card-actions"><Link className="secondary link-button" href={`/crm/leads/${lead.leadId}`}>View lead</Link>{lead.capabilities.canReview && lead.nextView.kind === "identity_review_detail" && <Link className="primary link-button" href={`/crm/identity-reviews/${lead.leadId}`}>Continue identity review</Link>}</div>;
}
export function LeadSummaryCard({ lead }: { lead: LeadSummaryItem }) {
  return <article className="lead-card p1a-lead-card"><div className="p1a-card-meta"><span className="lead-status">{lead.lifecycle.label ?? lead.lifecycle.status}</span><span>{lead.stage.name}</span></div><h2><Link href={`/crm/leads/${lead.leadId}`}>{lead.displayName}</Link></h2><p>{lead.company.displayName ?? "No company provided"}</p><p className="wrap-email">{leadContactLabel(lead)}</p><small>{leadAssignmentLabel(lead)} · {reviewLabel(lead.identityReviewStatus)}</small><LeadActions lead={lead}/></article>;
}
export function LeadList({ view, q, stageId }: { view: LeadSummariesView; q: string; stageId?: string }) {
  const params = new URLSearchParams(); if (q) params.set("q", q); if (stageId) params.set("stageId", stageId);
  return <><p role="status">{view.items.length} {view.items.length === 1 ? "lead" : "leads"} shown.</p>{view.items.length === 0 ? <div className="empty"><h2>{q || stageId ? "No matching leads" : "No leads yet"}</h2><p>{q || stageId ? "Clear the filters or try a different search." : "Add a lead to begin tracking customer work."}</p></div> : <div className="lead-grid p1a-lead-grid">{view.items.map(lead => <LeadSummaryCard key={lead.leadId} lead={lead}/>)}</div>}{view.nextCursor && <div className="row-actions"><Link className="secondary link-button" href={`/crm?${new URLSearchParams([...params, ["cursor", view.nextCursor]]).toString()}`}>Next page</Link></div>}</>;
}
export function LeadPipeline({ stages }: { stages: Array<{ stage: LeadPipelineStage; view: LeadSummariesView }> }) {
  const total = stages.reduce((count, item) => count + item.view.items.length, 0);
  return <><p role="status">{total} {total === 1 ? "lead" : "leads"} shown across {stages.length} stages.</p><div className="pipeline-board">{stages.map(({ stage, view }) => <section className="pipeline-stage" key={stage.stageId} aria-labelledby={`stage-${stage.stageId}`}><h2 id={`stage-${stage.stageId}`}>{stage.name} <span className="pipeline-count" aria-label={`${view.items.length} ${view.items.length === 1 ? "lead" : "leads"}`}>{view.items.length}</span></h2>{view.items.length === 0 ? <p className="helper pipeline-empty-stage">No leads in this stage.</p> : view.items.map(lead => <LeadSummaryCard key={lead.leadId} lead={lead}/>)}</section>)}</div></>;
}
export function LeadReadOnlyDetail({ lead }: { lead: LeadSummaryItem }) {
  const detail = [
    ["Contact", leadContactLabel(lead)], ["Company", lead.company.displayName ?? "No company provided"],
    ["Assignment", leadAssignmentLabel(lead)], ["Lifecycle", lead.lifecycle.label ?? lead.lifecycle.status],
    ["Pipeline stage", lead.stage.name], ["Identity review", reviewLabel(lead.identityReviewStatus)],
    ["Source", sourceLabel(lead)], ["Source medium", lead.originalAttribution.sourceMedium],
    ["Intake channel", intakeLabels[lead.originalAttribution.intakeChannel]],
    ["Received", new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(lead.receivedAt))],
  ];
  return <><header className="product-page-header"><div><p className="eyebrow">Leads / Details</p><h1>{lead.displayName}</h1><p className="lead">Read-only canonical lead information. The Workspace owns this lead.</p></div></header><dl className="p1a-detail-grid">{detail.map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}</dl><div className="row-actions"><Link className="secondary link-button" href="/crm">Back to leads</Link><Link className="secondary link-button" href="/crm/pipeline">View Pipeline</Link>{lead.capabilities.canReview && lead.nextView.kind === "identity_review_detail" && <Link className="primary link-button" href={`/crm/identity-reviews/${lead.leadId}`}>Continue identity review</Link>}</div></>;
}
export function LeadPresentationUnavailable({ detail = false }: { detail?: boolean }) {
  return <div className="alert error" role="alert" tabIndex={-1} autoFocus><h2>{detail ? "Lead unavailable" : "Leads are temporarily unavailable"}</h2><p>No lead details are shown. Try again safely.</p><Link className="secondary link-button" href="/crm">Return to leads</Link></div>;
}
