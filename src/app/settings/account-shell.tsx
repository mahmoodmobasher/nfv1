import { ProductShell } from "../product-shell";
import { crmNavigationForRole } from "../product-navigation";

export function AccountShell({
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
      banner="LOCAL SERVER · Your profile, preferences, and account security are saved to your account. Workspace administration and permissions remain separate."
    >
      {children}
    </ProductShell>
  );
}
