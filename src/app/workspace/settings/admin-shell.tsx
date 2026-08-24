import { ProductShell } from "../../product-shell";
import { adminNavigationForRole } from "../../product-navigation";

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
      navigation={adminNavigationForRole(role)}
      banner="LOCAL SERVER · Workspace settings, membership, roles, teams, and invitations are saved and authorized by the local server."
    >
      {children}
    </ProductShell>
  );
}
