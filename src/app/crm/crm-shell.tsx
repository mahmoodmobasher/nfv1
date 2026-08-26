import { ProductShell } from "../product-shell";

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
    >
      {children}
    </ProductShell>
  );
}
