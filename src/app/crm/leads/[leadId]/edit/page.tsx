import Link from "next/link";
import { notFound } from "next/navigation";
import { CrmShell } from "../../../crm-shell";
import { LeadOperationalEditForm } from "@/frontend/features/leads";
import { isLeadNotFound, loadLeadOperationalEdit } from "@/frontend/features/leads/server";
import { FeedbackState } from "@/frontend/design-system";
import { crmPageContext } from "@/server/crm/page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit lead | NexaFlow" };

export default async function Page({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params, { pool, workspace, context } = await crmPageContext(`/crm/leads/${leadId}/edit`);
  try {
    try {
      const view = await loadLeadOperationalEdit(pool, context, leadId);
      return <CrmShell workspace={workspace.name} role={context.role}><section className="admin-content narrow-admin p1a-feature"><header className="product-page-header"><div><p className="eyebrow">Leads / Edit</p><h1>Edit lead</h1><p className="lead">Update responsibility and visibility. Identity-bearing corrections are not available in this editor.</p></div></header>{view.capabilities.canEditLead ? <LeadOperationalEditForm workspaceId={workspace.id} initial={view}/> : <FeedbackState tone="warning" title="Editing isn’t available" action={<Link className="ds-action ds-action--secondary" href={`/crm/leads/${leadId}`}>Return to Lead details</Link>}><p>Only authorized Workspace Owners and Admins can edit Lead operations.</p></FeedbackState>}</section></CrmShell>;
    } catch (error) {
      if (isLeadNotFound(error)) notFound();
      return <CrmShell workspace={workspace.name} role={context.role}><section className="admin-content narrow-admin"><FeedbackState tone="danger" title="Lead editing is temporarily unavailable" action={<Link className="ds-action ds-action--secondary" href={`/crm/leads/${leadId}`}>Return to Lead details</Link>}><p>No operational values or choices are shown. Try again safely.</p></FeedbackState></section></CrmShell>;
    }
  } finally { await pool.end(); }
}
