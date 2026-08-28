import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ActionLink, ActionMenu, AdminPanel, AdminWorkspace, ContentTabs, DataTable, DataToolbar, EmptyState, FactsGrid, FeedbackState, FieldMessage, FormActions, FormGrid, FormSection, FormWorkbench, LoadingState, Panel, ProductPageHeader, RecordCard, RecordCards, RecordIdentity, RecordWorkspace, RelationshipRow, ReviewDecisionGroup, ReviewDecisionHeader, ReviewDecisionSummary, ReviewWorkspace, SectionNav, StageColumn, StatusBadge, ViewTabs, WorkflowSummaryGrid } from "../src/frontend/design-system";

describe("CRM shared design-system components", () => {
  it("renders complete semantic state primitives without feature authority", () => {
    const markup = renderToStaticMarkup(<><Panel title="Pipeline health" description="Server-produced totals"><StatusBadge tone="success">Qualified</StatusBadge></Panel><FeedbackState title="Lead changed" tone="conflict" autoFocus><p>Reload the confirmed state.</p></FeedbackState><EmptyState title="No leads"><p>Add a lead to begin.</p></EmptyState><LoadingState label="Loading leads" rows={2}/><FieldMessage id="phone-error" tone="error">Enter a valid phone.</FieldMessage></>);
    expect(markup).toContain("ds-panel");
    expect(markup).toContain("ds-badge--success");
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('tabindex="-1"');
    expect(markup).toContain('aria-label="Loading leads"');
    expect(markup).toContain('id="phone-error"');
  });

  it("renders authoritative navigation and accessible table wrappers", () => {
    const markup = renderToStaticMarkup(<><ViewTabs label="Lead views" items={[{ href: "/crm", label: "List", active: true }, { href: "/crm/pipeline", label: "Pipeline", active: false }]}/><DataTable caption="Visible leads"><tbody><tr><td>Lead</td></tr></tbody></DataTable><ActionLink href="/crm/leads/new" variant="primary">Add lead</ActionLink></>);
    expect(markup).toContain('aria-label="Lead views"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain("<caption>Visible leads</caption>");
    expect(markup).toContain("ds-action--primary");
  });

  it("renders the five shared CRM archetype foundations without domain authority", () => {
    const markup = renderToStaticMarkup(<><DataTable caption="Contacts"><tbody><tr><td>Ada</td></tr></tbody></DataTable><StageColumn id="stage-qualified" tone="qualified" position={3} title="Qualified" count={1}><article data-lead-id="lead-1">Lead</article></StageColumn><FactsGrid><div><dt>Owner</dt><dd>Ada</dd></div></FactsGrid><WorkflowSummaryGrid><Panel tone="qualification" title="Qualification">Ready</Panel></WorkflowSummaryGrid><FormWorkbench label="Edit contact"><SectionNav label="Form sections" items={[{href:"#overview",label:"Overview"}]}/></FormWorkbench></>);
    expect(markup).toContain("ds-table");
    expect(markup).toContain("ds-stage-column--qualified");
    expect(markup).toContain('class="pipeline-stage ds-stage-column__content"');
    expect(markup).toContain('id="stage-qualified" tabindex="-1"');
    expect(markup).toContain("Pipeline stage 3");
    expect(markup).toContain("ds-stage-column__identifier");
    expect(markup).toContain('aria-labelledby="stage-qualified-position stage-qualified"');
    expect(markup).toContain("ds-facts-grid");
    expect(markup).toContain("ds-section-panel--qualification");
    expect(markup).toContain('aria-label="Form sections"');
  });

  it("renders the shared Lead list and editor composition primitives", () => {
    const markup = renderToStaticMarkup(<><ProductPageHeader marker="LD" context="Sales" title="Leads" description={<p>Authorized records.</p>} action={<ActionLink href="/crm/leads/new">Add lead</ActionLink>}/><RecordCards label="Loaded leads"><RecordCard title="Ada Lead" href="/crm/leads/1" secondary="a***@example.com" facts={[{label:"Stage",value:<StatusBadge tone="warning">New</StatusBadge>}]} actions={<ActionLink href="/crm/leads/1">View lead</ActionLink>}/></RecordCards><FormSection id="overview" number="01" title="Overview" description="Lead identity" tone="overview"><FormGrid><label>First name<input/></label></FormGrid></FormSection><FormActions><ActionLink href="/crm">Cancel</ActionLink></FormActions></>);
    expect(markup).toContain("ds-page-header__marker");
    expect(markup).toContain('role="list"');
    expect(markup).toContain("ds-record-card");
    expect(markup).toContain("ds-form-section");
    expect(markup).toContain("ds-form-grid");
    expect(markup).toContain("ds-form-actions");
  });

  it("renders the Structured Workspace identity, content, relationship, and compact-action foundations", () => {
    const markup = renderToStaticMarkup(<RecordWorkspace summary={<RecordIdentity marker="CT" title="Ada Lovelace" secondary="Masked contact"/>}><ContentTabs label="Contact sections" items={[{href:"#overview",label:"Overview",active:true},{href:"#company",label:"Company"}]}/><RelationshipRow label="Company" value="Analytical Engines" action={<ActionMenu label="Actions for Ada Lovelace"><ActionLink href="/crm/contacts/1/edit">Edit</ActionLink></ActionMenu>}/></RecordWorkspace>);
    expect(markup).toContain("ds-record-workspace");
    expect(markup).toContain("ds-record-identity");
    expect(markup).toContain('aria-label="Contact sections"');
    expect(markup).toContain("ds-relationship-row");
    expect(markup).toContain('aria-label="Actions for Ada Lovelace"');
  });

  it("renders shared Command Center completion patterns without domain authority", () => {
    const markup = renderToStaticMarkup(<><DataToolbar label="Search loaded companies" htmlFor="company-search" helper={<p id="company-search-help">Search applies only to loaded records.</p>} status={<p role="status">10 loaded companies</p>}><input id="company-search" type="search" aria-describedby="company-search-help"/><button>Search</button></DataToolbar><ReviewWorkspace evidence={<section><h2>Lead inquiry</h2></section>}><ReviewDecisionHeader title="Decision workspace" action={<button>Complete review</button>}/><ReviewDecisionGroup>Contact decision</ReviewDecisionGroup><ReviewDecisionSummary><div>Contact summary</div><div>Company summary</div></ReviewDecisionSummary></ReviewWorkspace><AdminWorkspace><AdminPanel title="People and roles" wide>Server-authorized controls</AdminPanel></AdminWorkspace></>);
    expect(markup).toContain('for="company-search"');
    expect(markup).toContain('aria-describedby="company-search-help"');
    expect(markup).toContain("ds-data-toolbar__status");
    expect(markup).toContain('aria-label="Review evidence"');
    expect(markup).toContain('aria-label="Decision workspace"');
    expect(markup).toContain("ds-review-decision__summary");
    expect(markup).toContain("ds-admin-panel--wide");
  });
});
