import { ProductShell } from "../../product-shell";

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
