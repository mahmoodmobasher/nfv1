import { ProductShell } from "../../product-shell";

export function AdminShell({workspace,role,children}:{workspace:string;role:string;children:React.ReactNode}){
  return <ProductShell kind="admin" workspace={workspace} role={role} banner="LOCAL SERVER · Workspace settings, membership, roles, teams, and invitations are saved and authorized by the local server.">{children}</ProductShell>;
}
