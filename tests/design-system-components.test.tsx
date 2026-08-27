import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ActionLink, DataTable, EmptyState, FactsGrid, FeedbackState, FieldMessage, FormWorkbench, LoadingState, PageHeader, Panel, RecordList, RecordRow, SectionNav, SectionPanel, StageColumn, StatusBadge, ViewTabs, WorkflowSummaryGrid } from "../src/frontend/design-system";

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
    const markup = renderToStaticMarkup(<><PageHeader eyebrow="Contacts" title="Contacts" description="Server-authorized records"/><RecordList label="Contacts"><RecordRow><span>Ada</span></RecordRow></RecordList><StageColumn title="Qualified" count={1}><article>Lead</article></StageColumn><FactsGrid><div><dt>Owner</dt><dd>Ada</dd></div></FactsGrid><WorkflowSummaryGrid><SectionPanel tone="qualification" title="Qualification">Ready</SectionPanel></WorkflowSummaryGrid><FormWorkbench label="Edit contact"><SectionNav label="Form sections" items={[{href:"#overview",label:"Overview"}]}/></FormWorkbench></>);
    expect(markup).toContain("ds-page-header");
    expect(markup).toContain('role="list"');
    expect(markup).toContain("ds-stage-column");
    expect(markup).toContain("ds-facts-grid");
    expect(markup).toContain("ds-section-panel--qualification");
    expect(markup).toContain('aria-label="Form sections"');
  });
});
