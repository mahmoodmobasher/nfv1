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
    >
      {children}
    </ProductShell>
  );
}
