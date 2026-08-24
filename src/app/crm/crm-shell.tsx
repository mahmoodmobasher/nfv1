import { ProductShell } from "../product-shell";
import { crmNavigationForRole } from "../product-navigation";

export function CrmShell({
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
      kind="crm"
      workspace={workspace}
      role={role}
      navigation={crmNavigationForRole(role)}
      banner="LOCAL SERVER · Leads, pipeline, ownership, visibility, notes, and activities are saved and authorized by the local server. Production providers and deployment are not connected."
    >
      {children}
    </ProductShell>
  );
}
