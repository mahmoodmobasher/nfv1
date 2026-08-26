import type { WorkspaceNavigationCapabilitiesV1 } from "@/frontend/shared/contracts/workspace-navigation";

export type ProductNavIcon = "contact" | "home" | "kanban" | "mail" | "plus" | "settings" | "user" | "users";
export type ProductNavItem = { href: string; label: string; icon: ProductNavIcon; match: "exact" | "descendants"; excludedDescendants?: string[] };
export type ProductNavGroup = { id: string; label: string; items: ProductNavItem[] };

const item = (href: string, label: string, icon: ProductNavIcon,
  match: ProductNavItem["match"] = "descendants", excludedDescendants?: string[]): ProductNavItem =>
  ({ href, label, icon, match, excludedDescendants });

export function navigationFromCapabilities(value: WorkspaceNavigationCapabilitiesV1): ProductNavGroup[] {
  const capability = value.capabilities, groups: ProductNavGroup[] = [];
  if (capability.home.canView) groups.push({ id: "home", label: "Home", items: [item("/crm/home", "Home", "home")] });
  const contacts = [
    ...(capability.companies.canView ? [item("/crm/companies", "Companies", "users")] : []),
    ...(capability.contacts.canView ? [item("/crm/contacts", "Contacts", "contact")] : []),
  ];
  if (contacts.length) groups.push({ id: "contacts", label: "Contact Management", items: contacts });
  const sales = [
    ...(capability.leads.canView ? [item("/crm", "Leads", "contact", "descendants", [
      "/crm/home", "/crm/companies", "/crm/contacts", "/crm/pipeline", "/crm/deals", "/crm/identity-reviews",
    ])] : []),
    ...(capability.pipeline.canView ? [item("/crm/pipeline", "Lead pipeline", "kanban")] : []),
    ...(capability.deals.canView ? [
      item("/crm/deals", "Deals", "kanban", "descendants", ["/crm/deals/board"]),
      item("/crm/deals/board", "Deal pipeline", "kanban"),
    ] : []),
  ];
  if (sales.length) groups.push({ id: "sales", label: "Sales", items: sales });
  if (capability.identityReview.canView) groups.push({
    id: "review", label: "Review", items: [item("/crm/identity-reviews", "Identity review", "users")],
  });
  const settingsItems = [
    ...(capability.settings.canViewPersonal ? [item("/settings", "Personal settings", "user")] : []),
    ...(capability.settings.canViewWorkspace ? [item("/workspace/settings", "Workspace settings", "settings", "exact")] : []),
    ...(capability.settings.canManagePeople ? [item("/workspace/settings/people", "People and roles", "users")] : []),
    ...(capability.settings.canManageInvitations ? [item("/workspace/settings/invitations", "Invitations", "mail")] : []),
    ...(capability.settings.canManageTeams ? [item("/workspace/settings/teams", "Teams", "contact")] : []),
  ];
  if (settingsItems.length) groups.push({ id: "settings", label: "Settings", items: settingsItems });
  return groups;
}

export function isProductNavItemActive(pathname: string, entry: ProductNavItem) {
  if (entry.match === "exact") return pathname === entry.href;
  if (entry.excludedDescendants?.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return false;
  return pathname === entry.href || pathname.startsWith(`${entry.href}/`);
}

export function activeProductNavigation(pathname: string, groups: ProductNavGroup[]) {
  return groups.flatMap((group) => group.items.map((entry) => ({ entry, group: group.label, groupId: group.id })))
    .filter(({ entry }) => isProductNavItemActive(pathname, entry))
    .sort((left, right) => right.entry.href.length - left.entry.href.length)[0];
}
