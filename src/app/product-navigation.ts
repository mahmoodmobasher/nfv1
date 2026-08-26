export type ProductNavIcon =
  | "contact"
  | "home"
  | "kanban"
  | "mail"
  | "plus"
  | "settings"
  | "user"
  | "users";
export type ProductNavItem = {
  href: string;
  label: string;
  icon: ProductNavIcon;
  exact?: boolean;
};
export type ProductNavGroup = { label: string; items: ProductNavItem[] };

const crmCore: ProductNavGroup[] = [
  {
    label: "Workspace",
    items: [{ href: "/crm/home", label: "Home", icon: "home", exact: true }],
  },
  {
    label: "Customers",
    items: [
      { href: "/crm", label: "Leads", icon: "contact", exact: true },
      { href: "/crm/companies", label: "Companies", icon: "users" },
      { href: "/crm/contacts", label: "Contacts", icon: "contact" },
      { href: "/crm/deals", label: "Deals", icon: "kanban" },
      { href: "/crm/identity-reviews", label: "Identity review", icon: "users" },
      { href: "/crm/pipeline", label: "Pipeline", icon: "kanban", exact: true },
      { href: "/crm/leads/new", label: "Add lead", icon: "plus", exact: true },
    ],
  },
];
const crmAdministration: ProductNavGroup = {
  label: "Administration",
  items: [
    {
      href: "/workspace/settings/people",
      label: "People and roles",
      icon: "users",
    },
    {
      href: "/workspace/settings",
      label: "Workspace settings",
      icon: "settings",
      exact: true,
    },
  ],
};
const adminCore: ProductNavGroup[] = [
  {
    label: "Workspace",
    items: [{ href: "/crm", label: "CRM overview", icon: "home" }],
  },
  {
    label: "Administration",
    items: [
      {
        href: "/workspace/settings/people",
        label: "People and roles",
        icon: "users",
      },
      {
        href: "/workspace/settings/invitations",
        label: "Invitations",
        icon: "mail",
      },
      { href: "/workspace/settings/teams", label: "Teams", icon: "contact" },
      {
        href: "/workspace/settings",
        label: "Workspace settings",
        icon: "settings",
        exact: true,
      },
    ],
  },
];
function clone(groups: ProductNavGroup[]) {
  return groups.map((group) => ({
    ...group,
    items: group.items.map((item) => ({ ...item })),
  }));
}

/** Server adapter model. Route/API authorization remains independently mandatory. */
export function crmNavigationForRole(role: string): ProductNavGroup[] {
  return clone([
    ...crmCore,
    ...(role === "owner" || role === "admin" ? [crmAdministration] : []),
  ]);
}

/** Admin pages are already capability-gated by adminPageContext before this model is built. */
export function adminNavigationForRole(role: string): ProductNavGroup[] {
  if (role !== "owner" && role !== "admin") return [];
  return clone(adminCore);
}
