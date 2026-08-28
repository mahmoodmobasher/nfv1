import { ProductShell } from "../../product-shell";
import { AdminWorkspace, ProductPageHeader, ViewTabs } from "@/frontend/design-system";

type WorkspaceAdminView = "overview" | "people" | "invitations" | "teams";

const workspaceAdminViews = [
  { href: "/workspace/settings", label: "Overview", view: "overview" },
  { href: "/workspace/settings/people", label: "People and roles", view: "people" },
  { href: "/workspace/settings/invitations", label: "Invitations", view: "invitations" },
  { href: "/workspace/settings/teams", label: "Teams", view: "teams" },
] as const;

export function AdminShell({
  workspace,
  role,
  children,
}: {
  workspace: string;
  role: string;
  children: React.ReactNode;
}) {
  return (
    <ProductShell
      kind="admin"
      workspace={workspace}
      role={role}
    >
      {children}
    </ProductShell>
  );
}

export function WorkspaceAdminPage({
  title,
  description,
  marker,
  activeView,
  action,
  narrow = false,
  children,
}: {
  title: string;
  description: React.ReactNode;
  marker: React.ReactNode;
  activeView: WorkspaceAdminView;
  action?: React.ReactNode;
  narrow?: boolean;
  children: React.ReactNode;
}) {
  return <section className={`admin-content ds-admin-page${narrow ? " narrow-admin" : ""}`}>
    <ProductPageHeader marker={marker} context="Workspace administration" title={title} description={description} action={action}/>
    <div className="ds-admin-tabs"><ViewTabs label="Workspace administration" items={workspaceAdminViews.map(item => ({ href: item.href, label: item.label, active: item.view === activeView }))}/></div>
    <AdminWorkspace>{children}</AdminWorkspace>
  </section>;
}
